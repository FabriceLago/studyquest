import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { environment } from '../src/environments/environment';
import { API, exigeSupabase, commencer, sansDefaut } from './aide';

/** Parcours réel avec Supabase, la fonction d'import et une IA simulée (e2e/ia-simulee.mjs). */
const PHRASES = Array.from(
  { length: 12 },
  (_, i) => `La phrase ${i + 1} de ce cours décrit une notion utile aux révisions.`,
);
const TEXTE = PHRASES.join(' ');
// Une image PNG d'un pixel : la vraie lecture est simulée, le dépôt et la réduction sont réels.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
  test.setTimeout(120_000);
});

async function ouvrirImport(page: Page, titre: string) {
  await page.getByRole('link', { name: 'Importer un cours' }).click();
  await page.getByLabel('Titre du cours').fill(titre);
}

async function jeton(page: Page): Promise<string> {
  return page.evaluate(() => {
    const cle = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('auth-token'),
    );
    return JSON.parse(localStorage.getItem(cle as string) as string).access_token;
  });
}

async function fichiersRestants(page: Page, request: APIRequestContext): Promise<number> {
  const reponse = await request.post(`${API}/storage/v1/object/list/imports`, {
    headers: {
      apikey: environment.supabasePublishableKey,
      Authorization: `Bearer ${await jeton(page)}`,
    },
    data: { prefix: '', limit: 100 },
  });
  return (await reponse.json()).length;
}

test('un texte collé devient des questions, sans jamais exposer les réponses', async ({ page }) => {
  const reponses: string[] = [];
  page.on('response', async (r) => {
    if (r.url().includes('/rest/v1/notions')) reponses.push(await r.text());
  });
  await commencer(page);
  await ouvrirImport(page, 'Biologie');
  await sansDefaut(page);
  await page.getByLabel('Du texte à coller').check();
  await page.getByLabel('Texte du cours').fill(TEXTE);
  await page.getByRole('button', { name: 'Créer mes questions' }).click();

  await expect(page.getByText('12 questions prêtes')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Notion 1' })).toBeVisible();
  await sansDefaut(page);
  expect(reponses.join('')).not.toMatch(/correcte|reponse|explication/);

  await page.getByRole('button', { name: 'Retirer : Question 1 ?' }).click();
  await expect(page.getByText('11 questions prêtes')).toBeVisible();

  await page.getByRole('link', { name: 'Revenir à ma journée' }).click();
  await expect(page.getByRole('link', { name: /Biologie/ })).toBeVisible();
  await expect(page.getByText('1 import sur 5')).toBeVisible();
});

test('un PDF est lu, ses questions créées et son fichier supprimé', async ({ page, request }) => {
  await commencer(page);
  await ouvrirImport(page, 'Un PDF');
  await page.getByLabel(/Fichier PDF/).setInputFiles({
    name: 'cours.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 cours'),
  });
  await page.getByRole('button', { name: 'Créer mes questions' }).click();
  await expect(page.getByText('12 questions prêtes')).toBeVisible({ timeout: 60_000 });
  expect(await fichiersRestants(page, request)).toBe(0);
});

test('des photos passent par la relecture du texte avant les questions', async ({
  page,
  request,
}) => {
  await commencer(page);
  await ouvrirImport(page, 'Mes photos');
  await page.getByLabel('Des photos').check();
  await page.getByLabel(/Photos, 30/).setInputFiles([
    { name: '1.png', mimeType: 'image/png', buffer: PNG },
    { name: '2.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await page.getByRole('button', { name: 'Créer mes questions' }).click();

  const texte = page.getByLabel('Texte lu sur tes photos');
  await expect(texte).toHaveValue(/La phrase numéro 1/, { timeout: 60_000 });
  expect(await fichiersRestants(page, request)).toBe(0);
  await sansDefaut(page);
  await texte.fill(TEXTE);
  await page.getByRole('button', { name: 'Créer mes questions' }).click();
  await expect(page.getByText('12 questions prêtes')).toBeVisible({ timeout: 60_000 });
});

test('un refus de l’IA est expliqué et ne consomme pas le quota', async ({ page }) => {
  await commencer(page);
  await ouvrirImport(page, 'Refusé');
  await page.getByLabel('Du texte à coller').check();
  await page.getByLabel('Texte du cours').fill(`REFUS ${TEXTE}`);
  await page.getByRole('button', { name: 'Créer mes questions' }).click();
  await expect(page.getByRole('alert')).toContainText('filtre de sécurité', { timeout: 60_000 });
  await page.getByRole('link', { name: 'Revenir à ma journée' }).click();
  await expect(page.getByText('0 import sur 5')).toBeVisible();
});

test('un second import est refusé tant que le premier travaille', async ({ page, request }) => {
  await commencer(page);
  const appel = await page.evaluate(async () => {
    const cle = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('auth-token'),
    );
    return JSON.parse(localStorage.getItem(cle as string) as string).access_token as string;
  });
  const entetes = { apikey: environment.supabasePublishableKey, Authorization: `Bearer ${appel}` };
  const creer = () =>
    request.post(`${API}/rest/v1/rpc/creer_import`, {
      headers: entetes,
      data: { p_titre: 'T', p_format: 'pdf' },
    });
  expect((await creer()).ok()).toBe(true);
  const second = await creer();
  expect(second.ok()).toBe(false);
  expect((await second.json()).code).toBe('SQ409');
});
