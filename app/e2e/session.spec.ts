import { execFileSync } from 'node:child_process';
import { Page, expect, test } from '@playwright/test';
import { chiffres, exigeSupabase, importer, commencer, repondreJuste, sansDefaut } from './aide';

/** Parcours réel avec Supabase, la fonction d'import et une IA simulée (e2e/ia-simulee.mjs). */
test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
  test.setTimeout(240_000);
});

async function repondreAToutes(page: Page, nombre: number) {
  const titre = page.getByRole('heading', { level: 1 });
  for (let i = 0; i < nombre; i++) {
    await expect(page.getByText(`${i + 1}/${nombre}`)).toBeVisible();
    await expect(titre).toHaveText(/Question \d+ \?/);
    await sansDefaut(page);
    await repondreJuste(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByRole('status')).toContainText('Juste');
    await sansDefaut(page);
    await page.getByRole('button', { name: /Question suivante|Voir le résultat/ }).click();
  }
}

/** Avance le temps : rend dues toutes les questions vues par ce compte. */
function rendreDues(email: string) {
  execFileSync('docker', [
    'exec',
    'supabase_db_studyquest',
    'psql',
    '-U',
    'postgres',
    '-c',
    `update public.reviews set echeance = current_date - 1 where owner = '${email}'`,
  ]);
}

test('une journée complète : découvrir, défi, réviser, sans jamais recevoir de réponse à l’avance', async ({
  page,
}) => {
  const lectures: string[] = [];
  page.on('response', async (r) => {
    if (/rpc\/(questions_mission|mission_du_jour)/.test(r.url()))
      lectures.push(await r.text().catch(() => ''));
  });
  const email = await commencer(page);
  await expect(page.getByText('Ta ville est encore vide')).toBeVisible();
  await expect(page.getByText('Mission du jour')).toBeHidden();
  await importer(page);

  // Une seule mission proposée au départ : rien à réviser, pas de défi avant 5 questions vues.
  await expect(page.getByRole('link', { name: /Découvrir.*8 nouvelles questions/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Réviser/ })).toBeHidden();
  await expect(page.getByRole('link', { name: /^Défi/ })).toBeHidden();
  await expect(page.getByText('0 / 100 XP vers le niveau 2')).toBeVisible();
  await sansDefaut(page);

  await page.getByRole('link', { name: 'Découvrir une notion' }).click();
  await repondreAToutes(page, 8);
  await expect(page.getByText('Découverte terminée')).toBeVisible();
  await chiffres(page, '8/8', '+60', '1 j');

  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await expect(page.getByText('Niveau 1')).toBeVisible();
  await expect(page.getByText('60 / 100 XP vers le niveau 2')).toBeVisible();
  await expect(page.locator('.serie')).toContainText('1 j');
  await expect(page.locator('.mission.fait', { hasText: 'Découvrir' })).toBeVisible();

  await page.getByRole('link', { name: 'Lancer le défi' }).click();
  const titre = page.getByRole('heading', { level: 1 });
  await expect(page.getByRole('timer')).toBeVisible();
  await sansDefaut(page);
  while (!(await page.getByText('Défi terminé').isVisible())) {
    const enonce = await titre.textContent();
    if (!(await repondreJuste(page))) await page.getByRole('button', { name: 'Valider' }).click();
    await expect(async () => {
      expect(
        (await page.getByText('Défi terminé').isVisible()) ||
          (await titre.textContent()) !== enonce,
      ).toBe(true);
    }).toPass();
  }
  await chiffres(page, '8/8', '+36', '1 j');

  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await expect(page.getByText('96 XP aujourd’hui')).toBeVisible();
  await expect(page.getByText('96 / 100 XP vers le niveau 2')).toBeVisible();
  await expect(page.getByText('Mission terminée. À demain !')).toBeVisible();

  // Le lendemain : les 8 questions sont dues.
  rendreDues(email);
  await page.reload();
  await expect(page.getByRole('link', { name: /Réviser.*8 questions à revoir/ })).toBeVisible();
  await page.getByRole('link', { name: 'Commencer ma révision' }).click();
  await repondreAToutes(page, 8);
  await chiffres(page, '8/8', '+100', '1 j');
  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await expect(page.getByText('Niveau 2')).toBeVisible();
  await expect(page.getByText('96 / 300 XP vers le niveau 3')).toBeVisible();

  expect(lectures.length).toBeGreaterThan(0);
  expect(lectures.join('')).not.toMatch(/correctes|"associations"|"ordre"|explication|extrait/);
});

test('une erreur est corrigée, et une question fausse peut être retirée', async ({ page }) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: 'Découvrir une notion' }).click();

  await page.getByRole('button', { name: 'Fausse', exact: true }).click();
  await page.getByRole('button', { name: 'Valider' }).click();
  const retour = page.getByRole('status');
  await expect(retour).toContainText('À revoir, elle reviendra demain');
  await expect(retour).toContainText('Le cours le dit.');
  await expect(retour).toContainText('Dans ton cours, Biologie');
  await expect(page.getByRole('button', { name: /Bonne.*Bonne réponse/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Fausse.*Ta réponse/ })).toBeDisabled();
  await sansDefaut(page);

  await page.getByRole('button', { name: 'Cette question est fausse' }).click();
  await expect(
    page.getByRole('button', { name: 'Question retirée de tes révisions' }),
  ).toBeDisabled();
  await page.getByRole('link', { name: 'Quitter' }).click();
  await expect(page.getByRole('link', { name: /Découvrir.*7 nouvelles questions/ })).toBeVisible();
});

test('le chrono du défi vient du serveur : recharger ne le remet pas à zéro', async ({ page }) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: 'Découvrir une notion' }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.getByText(`${i + 1}/8`)).toBeVisible();
    await repondreJuste(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await page.getByRole('button', { name: /Question suivante|Voir le résultat/ }).click();
  }
  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await page.getByRole('link', { name: 'Lancer le défi' }).click();

  const chrono = page.getByRole('timer');
  await expect(chrono).toBeVisible();
  if (!(await repondreJuste(page))) await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.locator('.compte')).toContainText('1 juste');
  await page.waitForTimeout(3_000);
  await page.reload();
  await expect(chrono).toBeVisible();
  expect(Number(await chrono.textContent())).toBeLessThanOrEqual(57);

  await expect(page.getByText('Défi terminé')).toBeVisible({ timeout: 70_000 });
  await chiffres(page, '1/1', '+22', '1 j');
  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await expect(page.locator('.mission.fait', { hasText: 'Défi' })).toBeVisible();

  // Un seul essai par jour : revenir sur le défi remontre le bilan, sans rien rapporter de plus.
  await page.goto('/defi');
  await expect(page.getByText('Défi terminé')).toBeVisible();
  await chiffres(page, '1/1', '+2', '1 j');
});
