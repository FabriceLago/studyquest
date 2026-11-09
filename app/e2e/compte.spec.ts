import { expect, test } from '@playwright/test';
import { commencer, sansDefaut } from './aide';

test('commencer sans compte, garder sa progression, puis tout supprimer', async ({ page }) => {
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
