import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, Page, expect, test } from '@playwright/test';

export const API = 'http://127.0.0.1:54821';
const MAILPIT = 'http://127.0.0.1:54824';
export const MOT_DE_PASSE = 'une phrase assez longue';

/** Un cours de 12 phrases : l'IA simulée (e2e/ia-simulee.mjs) en tire 12 questions. */
export const TEXTE = Array.from(
  { length: 12 },
  (_, i) => `La phrase ${i + 1} de ce cours décrit une notion utile aux révisions.`,
).join(' ');

export async function exigeSupabase(request: APIRequestContext) {
  // Arrêté, Supabase refuse aussitôt. Un délai court sauterait les parcours à la moindre lenteur.
  const disponible = await request.get(`${API}/auth/v1/health`, { timeout: 30_000 }).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!disponible, 'Supabase local arrêté');
}

/** Pas de défilement horizontal, aucune anomalie d'accessibilité détectée par axe. */
export async function sansDefaut(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
}

export async function importer(page: Page) {
  await page.getByRole('link', { name: 'Importer un cours' }).click();
  await page.getByLabel('Titre du cours').fill('Biologie');
  await page.getByLabel('Du texte à coller').check();
  await page.getByLabel('Texte du cours').fill(TEXTE);
  await page.getByRole('button', { name: 'Créer mes questions' }).click();
  await expect(page.getByText('12 questions prêtes')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Revenir à ma journée' }).click();
}

/** Les bonnes réponses de l'IA simulée. Renvoie true si le clic a suffi à répondre dans un défi. */
export async function repondreJuste(page: Page): Promise<boolean> {
  const etapes = page.locator('.ordre li span');
  if (await etapes.count()) {
    for (const [position, etape] of ['Un', 'Deux', 'Trois'].entries()) {
      let actuelle = (await etapes.allTextContents()).findIndex((t) => t.trim() === etape);
      while (actuelle > position) {
        await page.getByRole('button', { name: `Monter : ${etape}` }).click();
        actuelle--;
        await expect(etapes.nth(actuelle)).toHaveText(etape);
      }
    }
    return false;
  }
  if (await page.locator('.assoc').count()) {
    await page.locator('.assoc').nth(0).locator('select').selectOption({ label: '1' });
    await page.locator('.assoc').nth(1).locator('select').selectOption({ label: '2' });
    return false;
  }
  const multiple = page.getByRole('button', { name: 'Oui', exact: true });
  if (await multiple.count()) {
    await multiple.click();
    await page.getByRole('button', { name: 'Aussi', exact: true }).click();
    return false;
  }
  const unique = page.getByRole('button', { name: /^(Bonne|Vrai)$/ });
  await unique.click();
  return true;
}

export async function chiffres(page: Page, justes: string, gain: string, serie: string) {
  const valeurs = page.locator('.chiffres strong');
  await expect(valeurs).toHaveText([justes, gain, serie]);
  await sansDefaut(page);
}

/** Inscription par le formulaire, puis lien de confirmation relevé dans Mailpit. Revient connecté. */
export async function inscrireEtConfirmer(page: Page, request: APIRequestContext): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
  await page.goto('/inscription');
  await page.getByLabel('Pseudo').fill('Lina');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(MOT_DE_PASSE);
  await page.getByLabel('J’ai 15 ans ou plus').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifie ta boîte de réception' })).toBeVisible();

  let lien: string | undefined;
  await expect
    .poll(async () => {
      const recherche = await (
        await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
      ).json();
      const id = recherche.messages?.[0]?.ID;
      if (!id) return undefined;
      const message = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      lien = message.Text.match(/https?:\/\/\S+/)?.[0];
      return lien;
    })
    .toBeTruthy();
  await page.goto(lien as string);
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Lina' })).toBeVisible();
  return email;
}
