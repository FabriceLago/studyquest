import { expect, test } from '@playwright/test';
import { sansDefaut } from './aide';

/** Étape 8 : les pages légales se lisent sans session, depuis le pied de chaque page. */
for (const [lien, titre] of [
  ['Mentions légales', 'Mentions légales'],
  ['Confidentialité', 'Confidentialité'],
  ['Conditions', 'Conditions d’utilisation'],
] as const) {
  test(`la page « ${titre} » s’ouvre sans session`, async ({ page }) => {
    await page.goto('/bienvenue');
    await page.getByRole('contentinfo').getByRole('link', { name: lien }).click();
    await expect(page.getByRole('heading', { level: 1, name: titre })).toBeVisible();
    await sansDefaut(page);
  });
}

test('Bienvenue renvoie aux conditions et à la confidentialité', async ({ page }) => {
  await page.goto('/bienvenue');
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

test('la confidentialité ne parle plus d’adresse e-mail ni de mot de passe à donner', async ({
  page,
}) => {
  await page.goto('/confidentialite');
  await expect(page.getByText('Aucune adresse e-mail ni aucun mot de passe')).toBeVisible();
  await expect(page.getByText('Ton adresse e-mail et ton mot de passe')).toHaveCount(0);
});
