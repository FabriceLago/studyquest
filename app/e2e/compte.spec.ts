import { expect, test } from '@playwright/test';
import { environment } from '../src/environments/environment';
import { API, commencer, exigeSupabase, sansDefaut } from './aide';

/** Parcours réels : demandent la pile locale (npm run db:start), ignorés sinon. */
test("sans déclaration d'âge, l'API refuse la session, même sans passer par Bienvenue", async ({
  request,
}) => {
  await exigeSupabase(request);
  const reponse = await request.post(`${API}/auth/v1/signup`, {
    headers: { apikey: environment.supabasePublishableKey },
    data: { data: { pseudo: 'Lina' } },
  });
  expect(reponse.ok()).toBe(false);
});

test('commencer sans compte, garder sa progression, puis tout supprimer', async ({
  page,
  request,
}) => {
  await exigeSupabase(request);
  test.setTimeout(120_000);

  await commencer(page);
  await page.getByRole('link', { name: 'Profil' }).click();
  await expect(
    page.getByText('Sans compte : ta progression est gardée pour ce navigateur.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me déconnecter' })).toHaveCount(0);
  await sansDefaut(page);
  await page.getByLabel('Pseudo').fill('Lina');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Pseudo enregistré.')).toBeVisible();

  // Le navigateur garde la session : recharger, ou revenir sur Bienvenue, retrouve la journée.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Lina' })).toBeVisible();
  await page.goto('/bienvenue');
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('button', { name: 'Supprimer mes données' }).click();
  await page.getByRole('button', { name: 'Oui, tout supprimer' }).click();
  await expect(page).toHaveURL(/\/bienvenue$/);
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/bienvenue$/);
});
