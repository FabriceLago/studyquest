import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';

/** Parcours sans Supabase : les appels au service sont simulés ou coupés. */
async function sansDefaut(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
}

test('sans session, le contenu mène à Bienvenue, et les anciennes pages de compte aussi', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/bienvenue$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bienvenue sur StudyQuest' }),
  ).toBeVisible();
  await sansDefaut(page);
  for (const adresse of ['/profil', '/inscription', '/connexion']) {
    await page.goto(adresse);
    await expect(page).toHaveURL(/\/bienvenue$/);
  }
});

test("sans déclaration d'âge, rien ne part vers le serveur", async ({ page }) => {
  let appels = 0;
  await page.route('**/auth/v1/signup**', (route) => {
    appels++;
    return route.abort();
  });
  await page.goto('/bienvenue');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'StudyQuest est réservé aux personnes de 15 ans et plus.',
  );
  expect(appels).toBe(0);
  await sansDefaut(page);
});

test("Commencer envoie la déclaration d'âge, et un accès fermé est expliqué", async ({ page }) => {
  let corps: { data?: Record<string, unknown>; email?: string } = {};
  await page.route('**/auth/v1/signup**', (route) => {
    corps = route.request().postDataJSON();
    return route.fulfill({
      status: 422,
      // Forme d'une réponse d'erreur de Supabase Auth, sans en-tête de version d'API.
      json: {
        code: 422,
        error_code: 'anonymous_provider_disabled',
        msg: 'Anonymous sign-ins are disabled',
      },
    });
  });
  await page.goto('/bienvenue');
  await page.getByLabel('J’ai 15 ans ou plus').check();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('alert')).toContainText('L’accès libre est fermé');
  expect(corps.data).toEqual({ declares_15_plus: true });
  expect(corps.email).toBeUndefined();
});

test('un service injoignable donne un message clair', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await page.goto('/bienvenue');
  await page.getByLabel('J’ai 15 ans ou plus').check();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('alert')).toContainText('ne répond pas');
});

test("l'application est installable", async ({ request }) => {
  const manifeste = await (await request.get('/manifest.webmanifest')).json();
  expect(manifeste.name).toBe('StudyQuest');
  expect(manifeste.display).toBe('standalone');
  for (const icone of manifeste.icons) expect((await request.get(`/${icone.src}`)).ok()).toBe(true);
  expect((await request.get('/ngsw.json')).ok()).toBe(true);
  expect((await request.get('/ngsw-worker.js')).ok()).toBe(true);
});
