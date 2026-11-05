import { execFileSync } from 'node:child_process';
import { devices, expect, test } from '@playwright/test';
import { AVATARS } from '../src/app/core/avatars';
import { exigeSupabase, importer, inscrireEtConfirmer, sansDefaut } from './aide';

/** Étape 7 : groupes par code et classement de la semaine, avatars visibles par soi seulement. */
test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
  test.setTimeout(240_000);
});

/** Donne de l'XP à un compte, dans la base locale de StudyQuest seulement. */
function xp(email: string, jour: string, points: number) {
  execFileSync('docker', [
    'exec',
    'supabase_db_studyquest',
    'psql',
    '-U',
    'postgres',
    '-c',
    `insert into public.daily_stats (owner, jour, xp, reviser_fait)
       values ((select id from auth.users where email = '${email}'), ${jour}, ${points}, true)
       on conflict (owner, jour) do update set xp = excluded.xp, reviser_fait = true`,
  ]);
}
const LUNDI = `date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date`;
const AUJOURDHUI = `(now() at time zone 'Europe/Paris')::date`;

test('un groupe classe ses membres sur la semaine, sans rien montrer de leurs cours', async ({
  page,
  request,
  browser,
}) => {
  // Lina crée le groupe. Elle a un cours, qui ne doit jamais apparaître aux autres.
  const lina = await inscrireEtConfirmer(page, request);
  await importer(page);
  await page.getByRole('link', { name: 'Mes groupes et classements' }).click();
  await sansDefaut(page);
  await page.getByLabel('Nom du groupe').fill('Terminale 2');
  await page.getByRole('button', { name: 'Créer le groupe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terminale 2' })).toBeVisible();
  const code = (await page.locator('.code-partage').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

  // Sam, un autre compte, sur un autre téléphone.
  const contexte = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4221',
    serviceWorkers: 'block',
  });
  const sam = await contexte.newPage();
  const emailSam = await inscrireEtConfirmer(sam, request);
  await sam.goto('/profil');
  await sam.getByLabel('Pseudo').fill('Sam');
  await sam.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(sam.getByText('Pseudo enregistré.')).toBeVisible();

  // 100 XP depuis lundi pour Lina, 500 la semaine d'avant ; 30 aujourd'hui pour Sam.
  xp(lina, LUNDI, 100);
  xp(lina, `${LUNDI} - 1`, 500);
  xp(emailSam, AUJOURDHUI, 30);

  await sam.goto('/groupes');
  await sam.getByLabel('Code du groupe').fill(`${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase());
  await sam.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(sam.getByRole('heading', { level: 1, name: 'Terminale 2' })).toBeVisible();
  const lignes = sam.locator('.rang');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText('Lina');
  await expect(lignes.nth(0)).toContainText('100 XP');
  await expect(lignes.nth(1)).toContainText('Sam (toi)');
  await expect(lignes.nth(1)).toContainText('30 XP');
  await expect(sam.getByText('Biologie')).toHaveCount(0);
  await expect(sam.getByRole('button', { name: /Retirer/ })).toHaveCount(0);
  await expect(sam.getByRole('heading', { name: 'Quitter le groupe' })).toBeVisible();
  await sansDefaut(sam);
  await sam.screenshot({ path: test.info().outputPath('groupe-sam.png'), fullPage: true });

  // Lina modère : elle retire Sam, qui perd l'accès au classement.
  await page.reload();
  await expect(page.locator('.rang')).toHaveCount(2);
  await sansDefaut(page);
  await page.getByRole('button', { name: 'Retirer Sam' }).click();
  await expect(page.getByRole('status')).toHaveText('Sam ne fait plus partie du groupe.');
  await expect(page.locator('.rang')).toHaveCount(1);
  await sam.reload();
  await expect(sam.getByRole('heading', { level: 1, name: 'Groupe introuvable' })).toBeVisible();

  // Puis supprime le groupe, après confirmation.
  await page.getByRole('button', { name: 'Supprimer le groupe' }).click();
  await page.getByRole('button', { name: 'Oui, supprimer le groupe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mes groupes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terminale 2' })).toHaveCount(0);
  await contexte.close();
});

test('un avatar se débloque avec le niveau', async ({ page, request }) => {
  const email = await inscrireEtConfirmer(page, request);
  await page.goto('/profil');
  const couronne = page.getByRole('radio', { name: /Couronne/ });
  await expect(page.getByRole('radio', { name: /Lune/ })).toBeChecked();
  await expect(couronne).toBeDisabled();
  await expect(page.getByRole('radio', { name: /Feuille/ })).toBeEnabled();
  await sansDefaut(page);

  // 2 500 XP : niveau 6, tous les avatars sont débloqués.
  xp(email, AUJOURDHUI, 2500);
  await page.reload();
  await couronne.check();
  await expect(page.getByText('Avatar enregistré.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('profil.png'), fullPage: true });

  await page.goto('/');
  await expect(page.locator('.salut .avatar path')).toHaveAttribute('d', AVATARS[7].d);
  await page.reload();
  await expect(page.locator('.salut .avatar path')).toHaveAttribute('d', AVATARS[7].d);
});
