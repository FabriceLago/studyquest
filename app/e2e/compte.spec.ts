import { APIRequestContext, expect, test } from '@playwright/test';
import { environment } from '../src/environments/environment';

/** Parcours réels : demandent la pile locale (npm run db:start), ignorés sinon. */
const API = 'http://127.0.0.1:54721';
const MAILPIT = 'http://127.0.0.1:54724';

async function exigeSupabase(request: APIRequestContext) {
  const disponible = await request.get(`${API}/auth/v1/health`, { timeout: 2_000 }).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!disponible, 'Supabase local arrêté');
}

test("sans déclaration d'âge, l'API refuse le compte, même sans passer par le formulaire", async ({
  request,
}) => {
  await exigeSupabase(request);
  const email = `e2e-age-${Date.now()}@example.test`;
  const password = 'une phrase assez longue';
  const headers = { apikey: environment.supabasePublishableKey };

  const inscription = await request.post(`${API}/auth/v1/signup`, {
    headers,
    data: { email, password, data: { pseudo: 'Lina' } },
  });
  expect(inscription.ok()).toBe(false);

  const connexion = await request.post(`${API}/auth/v1/token?grant_type=password`, {
    headers,
    data: { email, password },
  });
  expect(connexion.ok()).toBe(false);
});

test('inscription, confirmation, profil, déconnexion, suppression', async ({ page, request }) => {
  await exigeSupabase(request);
  test.setTimeout(120_000);

  const email = `e2e-${Date.now()}@example.test`;
  const motDePasse = 'une phrase assez longue';

  await page.goto('/inscription');
  await page.getByLabel('Pseudo').fill('Lina');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
  await page.getByLabel('J’ai 15 ans ou plus').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifie ta boîte de réception' })).toBeVisible();

  // Le lien du message de confirmation, relevé dans Mailpit.
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

  await page.getByRole('link', { name: 'Profil' }).click();
  await page.getByLabel('Pseudo').fill('Lina2');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Pseudo enregistré.')).toBeVisible();

  await page.getByRole('button', { name: 'Me déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
  await page.getByRole('button', { name: 'Me connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Lina2' })).toBeVisible();

  await page.getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await page.getByRole('button', { name: 'Oui, tout supprimer' }).click();
  await expect(page).toHaveURL(/\/inscription$/);

  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
  await page.getByRole('button', { name: 'Me connecter' }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
});
