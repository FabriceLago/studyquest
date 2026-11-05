import { expect, test } from '@playwright/test';
import { environment } from '../src/environments/environment';
import { API, MOT_DE_PASSE, exigeSupabase, inscrireEtConfirmer } from './aide';

/** Parcours réels : demandent la pile locale (npm run db:start), ignorés sinon. */
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

  const email = await inscrireEtConfirmer(page, request);
  const motDePasse = MOT_DE_PASSE;

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
