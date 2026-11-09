import { expect, test } from '@playwright/test';
import { chiffres, importer, commencer, repondreJuste, sansDefaut } from './aide';

/** Ajouts du 4 novembre : mini-mission, date d’examen, examen blanc. */
test.skip(({ isMobile }) => !isMobile, 'Parcours lourds : sur mobile seulement');
test.beforeEach(() => {
  test.setTimeout(240_000);
});

const dans = (jours: number) => {
  const d = new Date(Date.now() + jours * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

test('la mini-mission garde la série sans terminer la mission', async ({ page }) => {
  await commencer(page);
  await importer(page);
  const lien = page.getByRole('link', { name: /Pas le temps/ });
  await expect(lien).toContainText('3 questions gardent ta série');
  await lien.click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(`${i + 1}/3`)).toBeVisible();
    await repondreJuste(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await page.getByRole('button', { name: /Question suivante|Voir le résultat/ }).click();
  }
  await expect(page.getByText('Mini-mission terminée')).toBeVisible();
  await expect(page.getByText('Ta série est gardée pour aujourd’hui.')).toBeVisible();
  await chiffres(page, '3/3', '+15', '1 j');

  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await expect(page.locator('.serie')).toContainText('1 j');
  await expect(page.getByRole('link', { name: /Découvrir.*5 nouvelles questions/ })).toBeVisible();
  await expect(lien).toBeHidden();
});

test('une date d’examen s’enregistre, se retire et refuse le passé', async ({ page }) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  const date = page.getByLabel('Mon examen a lieu le');

  await date.fill(dans(10));
  await page.getByRole('button', { name: 'Enregistrer la date' }).click();
  await expect(page.getByText('Examen dans 10 jours')).toBeVisible();
  await sansDefaut(page);

  await page.getByRole('link', { name: 'Revenir à ma journée' }).click();
  await expect(page.locator('.liste-cours')).toContainText('Examen dans 10 jours');
  await page.getByRole('link', { name: /Biologie/ }).click();

  await page.getByRole('button', { name: 'Retirer la date' }).click();
  await expect(page.getByText('Examen dans 10 jours')).toBeHidden();

  await date.fill(dans(-1));
  await page.getByRole('button', { name: 'Enregistrer la date' }).click();
  await expect(page.getByRole('alert')).toContainText('date à venir');
});

test('un examen blanc donne un score par notion, sans rien dévoiler ni rapporter', async ({
  page,
}) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  await page.getByRole('link', { name: 'Passer un examen blanc' }).click();

  await expect(page.getByRole('timer')).toHaveText(/^\s*1[12]:\d\d\s*$/);
  await expect(page.getByText('1/12')).toBeVisible();
  await sansDefaut(page);
  await repondreJuste(page);
  await page.getByRole('button', { name: 'Question suivante' }).click();
  await expect(page.getByText('2/12')).toBeVisible();

  // Une reprise garde la réponse déjà donnée et ne relance pas le chrono.
  await page.reload();
  await expect(page.getByText('2/12')).toBeVisible();
  for (let i = 2; i <= 12; i++) {
    await expect(page.getByText(`${i}/12`)).toBeVisible();
    await page.getByRole('button', { name: 'Passer cette question' }).click();
  }

  await expect(page.getByText('Examen blanc terminé')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '1/12' })).toBeVisible();
  await expect(page.locator('.liste-cours li')).toHaveCount(3);
  await sansDefaut(page);

  // Une seule fois par jour : revenir remontre le même score.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '1/12' })).toBeVisible();
  await page.getByRole('link', { name: 'Revenir au cours' }).click();
  await page.getByRole('link', { name: 'Revenir à ma journée' }).click();
  await expect(page.getByText('0 / 100 XP vers le niveau 2')).toBeVisible();
});
