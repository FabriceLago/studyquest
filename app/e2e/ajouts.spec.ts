import { expect, test } from '@playwright/test';
import { chiffres, exigeSupabase, importer, commencer, repondreJuste, sansDefaut } from './aide';

/** Parcours réels des ajouts du 4 novembre, avec Supabase et une IA simulée : aucune dépense. */
test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
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
  const lectures: string[] = [];
  page.on('response', async (r) => {
    if (/rpc\/(demarrer_examen|repondre_examen)/.test(r.url()))
      lectures.push(await r.text().catch(() => ''));
  });
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

  expect(lectures.length).toBeGreaterThan(0);
  expect(lectures.join('')).not.toMatch(/correctes|"associations"|"ordre"|explication|extrait/);
});

test('un code de partage donne une copie à une autre personne, sans quota', async ({
  page,
  browser,
}) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  const obtenir = page.getByRole('button', { name: 'Obtenir un code' });
  await expect(obtenir).toBeDisabled();
  await page.getByLabel(/j’ai le droit de le partager/).check();
  await obtenir.click();
  const code = ((await page.locator('.code-partage').textContent()) ?? '').trim();
  expect(code).toMatch(/^[0-9A-F]{12}$/);
  await sansDefaut(page);

  const contexte = await browser.newContext({
    baseURL: 'http://localhost:4221',
    serviceWorkers: 'block',
  });
  const autre = await contexte.newPage();
  await commencer(autre);
  await autre.getByRole('link', { name: 'J’ai un code de cours' }).click();
  const champ = autre.getByLabel('Code du cours');
  await champ.fill('INCONNU');
  await autre.getByRole('button', { name: 'Recevoir le cours' }).click();
  await expect(autre.getByRole('alert')).toContainText('n’existe pas');
  await sansDefaut(autre);

  await champ.fill(code.toLowerCase());
  await autre.getByRole('button', { name: 'Recevoir le cours' }).click();
  await expect(autre.getByText('12 questions prêtes')).toBeVisible();
  await expect(autre.getByText('Tu as reçu ce cours avec un code de partage.')).toBeVisible();
  await expect(autre.getByRole('button', { name: 'Obtenir un code' })).toBeHidden();
  await autre.getByRole('link', { name: 'Revenir à ma journée' }).click();
  await expect(autre.getByText('0 import sur 5')).toBeVisible();
  await expect(autre.getByRole('link', { name: /Découvrir.*8 nouvelles questions/ })).toBeVisible();

  // Arrêter le partage empêche les nouvelles copies, celles déjà reçues restent.
  await page.getByRole('button', { name: 'Arrêter le partage' }).click();
  await expect(obtenir).toBeVisible();
  await autre.goto('/cours/rejoindre');
  await champ.fill(code);
  await autre.getByRole('button', { name: 'Recevoir le cours' }).click();
  await expect(autre.getByRole('alert')).toContainText('n’existe pas');
  await autre.goto('/');
  await expect(autre.getByRole('link', { name: /Biologie/ })).toBeVisible();
  await contexte.close();
});
