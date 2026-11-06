import { expect, test } from '@playwright/test';
import { sansDefaut } from './aide';

/** Étape 8 : les pages légales se lisent sans compte, depuis le pied de chaque page. */
for (const [lien, titre] of [
  ['Mentions légales', 'Mentions légales'],
  ['Confidentialité', 'Confidentialité'],
  ['Conditions', 'Conditions d’utilisation'],
] as const) {
  test(`la page « ${titre} » s’ouvre sans compte`, async ({ page }) => {
    await page.goto('/inscription');
    await page.getByRole('contentinfo').getByRole('link', { name: lien }).click();
    await expect(page.getByRole('heading', { level: 1, name: titre })).toBeVisible();
    await sansDefaut(page);
  });
}

test('l’inscription renvoie aux conditions et à la confidentialité', async ({ page }) => {
  await page.goto('/inscription');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'conditions d’utilisation' })).toHaveAttribute(
    'href',
    '/conditions',
  );
  await expect(main.getByRole('link', { name: 'confidentialité' })).toHaveAttribute(
    'href',
    '/confidentialite',
  );
});
