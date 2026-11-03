import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';

/** Parcours sans Supabase : les appels au service de comptes sont simulés ou coupés. */
async function sansDefaut(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
}

async function remplir(page: Page, age: boolean) {
  await page.getByLabel('Pseudo').fill('Lina');
  await page.getByLabel('Adresse e-mail').fill('lina@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('une phrase assez longue');
  if (age) await page.getByLabel('J’ai 15 ans ou plus').check();
}

test('sans session, le contenu renvoie vers la connexion', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Me connecter' })).toBeVisible();
  await sansDefaut(page);
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/connexion$/);
});

test('un formulaire vide liste ses erreurs et prend le focus', async ({ page }) => {
  await page.goto('/inscription');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  const resume = page.getByRole('alert');
  await expect(resume).toBeFocused();
  await expect(resume).toContainText('15 ans et plus');
  await sansDefaut(page);
});

test("sans déclaration d'âge, rien ne part vers le serveur", async ({ page }) => {
  let appels = 0;
  await page.route('**/auth/v1/signup**', (route) => {
    appels++;
    return route.abort();
  });
  await page.goto('/inscription');
  await remplir(page, false);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('alert')).toContainText('15 ans et plus');
  expect(appels).toBe(0);
});

test("l'inscription envoie la déclaration d'âge et annonce le message de confirmation", async ({
  page,
}) => {
  let corps: { data?: { pseudo?: string; declares_15_plus?: boolean } } = {};
  await page.route('**/auth/v1/signup**', (route) => {
    corps = route.request().postDataJSON();
    return route.fulfill({
      json: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'lina@example.test',
        identities: [],
      },
    });
  });
  await page.goto('/inscription');
  await remplir(page, true);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifie ta boîte de réception' })).toBeVisible();
  expect(corps.data).toEqual({ pseudo: 'Lina', declares_15_plus: true });
  await sansDefaut(page);
});

test('un service de comptes injoignable donne un message clair', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill('lina@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Me connecter' }).click();
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
