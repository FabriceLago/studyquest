import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';

/** Le socle : Bienvenue, la déclaration d’âge, aucune donnée envoyée, l’installation. */
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

test("sans déclaration d'âge, rien ne commence", async ({ page }) => {
  await page.goto('/bienvenue');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'StudyQuest est réservé aux personnes de 15 ans et plus.',
  );
  expect(await page.evaluate(() => localStorage.getItem('studyquest'))).toBeNull();
  await sansDefaut(page);
});

test('aucune requête ne quitte le site : tout reste dans le navigateur', async ({ page }) => {
  const ailleurs: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== 'http://localhost:4221') ailleurs.push(r.url());
  });
  await page.goto('/bienvenue');
  await page.getByLabel('J’ai 15 ans ou plus').check();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Joueur' })).toBeVisible();
  await page.getByRole('link', { name: 'Ma ville' }).click();
  await page.getByRole('link', { name: 'Profil' }).click();
  expect(ailleurs).toEqual([]);
});

test("l'application est installable", async ({ request }) => {
  const manifeste = await (await request.get('/manifest.webmanifest')).json();
  expect(manifeste.name).toBe('StudyQuest');
  expect(manifeste.display).toBe('standalone');
  for (const icone of manifeste.icons) expect((await request.get(`/${icone.src}`)).ok()).toBe(true);
  expect((await request.get('/ngsw.json')).ok()).toBe(true);
  expect((await request.get('/ngsw-worker.js')).ok()).toBe(true);
});
