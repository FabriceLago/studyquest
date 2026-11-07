import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { environment } from '../src/environments/environment';
import { API, exigeSupabase, commencer, sansDefaut } from './aide';

/**
 * Étape 8 : l'abonnement relève le quota. Sans clé Stripe de test sur ce poste, le vrai paiement
 * n'est pas joué ici : l'abonnement est enregistré comme le ferait le serveur après Stripe.
 */
test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
  test.setTimeout(240_000);
});

/** Valeur de test locale, lue sans être affichée. */
function envLocal(nom: string): string {
  const fichier = readFileSync('supabase/functions/.env', 'utf8');
  return fichier.match(new RegExp(`^${nom}=(.*)$`, 'm'))?.[1].trim() ?? '';
}

function sql(requete: string) {
  execFileSync('docker', [
    'exec',
    'supabase_db_studyquest',
    'psql',
    '-U',
    'postgres',
    '-c',
    requete,
  ]);
}

test('sans paiement, l’étude reste gratuite et aucun abonnement n’est proposé', async ({
  page,
}) => {
  test.skip(environment.paiement, 'Paiement ouvert : voir le parcours suivant');
  await commencer(page);
  await expect(page.getByText('0 import sur 5 ce mois-ci.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abonnement' })).toHaveCount(0);
  await page.goto('/abonnement');
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Joueur' })).toBeVisible();
  await page.goto('/conditions');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Conditions d’utilisation' }),
  ).toBeVisible();
  await expect(page.getByText('StudyQuest est gratuit et ne vend rien.')).toBeVisible();
  await expect(page.getByText(/Stripe|rétractation/)).toHaveCount(0);
  await page.goto('/confidentialite');
  await expect(page.getByText(/Stripe/)).toHaveCount(0);
});

test('l’abonnement relève le quota, et un abonné ne supprime pas son compte sans résilier', async ({
  page,
}) => {
  test.skip(!environment.paiement, 'Paiement coupé pour l’instant (environment.paiement)');
  const email = await commencer(page);
  await expect(page.getByText('0 import sur 5 ce mois-ci.')).toBeVisible();
  await page.getByRole('link', { name: 'Abonnement' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Abonnement' })).toBeVisible();

  const bouton = page.getByRole('button', { name: 'S’abonner' });
  await expect(bouton).toBeDisabled();
  await page.getByLabel(/Je demande l’accès immédiat/).check();
  await expect(bouton).toBeEnabled();
  await sansDefaut(page);
  // Aucun prix Stripe réglé sur ce poste : le serveur refuse d'ouvrir une page de paiement.
  await bouton.click();
  await expect(page.getByText('L’abonnement n’est pas encore en vente.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('abonnement.png'), fullPage: true });

  // L'abonnement tel que le serveur l'enregistre après Stripe.
  sql(`insert into public.subscriptions (user_id, stripe_customer_id, status, current_period_end)
       values ('${email}', 'cus_e2e_${Date.now()}', 'active', now() + interval '1 month')`);
  // Retour de Stripe : la synchronisation échoue sans clé, la page lit tout de même la table.
  await page.goto('/abonnement?statut=merci');
  await expect(page.getByText('Ton abonnement est actif.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gérer mon abonnement' })).toBeVisible();
  await sansDefaut(page);
  await page.goto('/');
  await expect(page.getByText('0 import sur 30 ce mois-ci.')).toBeVisible();

  await page.goto('/profil');
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await page.getByRole('button', { name: 'Oui, tout supprimer' }).click();
  await expect(page.getByRole('alert')).toHaveText('Résilie d’abord ton abonnement.');
});

test('le webhook n’accepte que des événements signés, et le paiement demande une connexion', async ({
  request,
}) => {
  const url = `${API}/functions/v1/webhook-stripe`;
  const secret = envLocal('STRIPE_WEBHOOK_SECRET');
  const evenement = JSON.stringify({
    id: 'evt_e2e',
    object: 'event',
    type: 'invoice.paid',
    data: { object: {} },
  });
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${evenement}`).digest('hex')}`;
  const entetes = { 'Content-Type': 'application/json' };

  const faux = await request.post(url, {
    data: evenement,
    headers: { ...entetes, 'Stripe-Signature': 'faux' },
  });
  expect(faux.status()).toBe(400);
  const signe = await request.post(url, {
    data: evenement,
    headers: { ...entetes, 'Stripe-Signature': signature },
  });
  expect(signe.status()).toBe(200);
  expect(await signe.text()).toBe('ignoré');

  for (const fonction of ['creer-paiement', 'portail-abonnement', 'synchroniser-abonnement']) {
    const reponse = await request.post(`${API}/functions/v1/${fonction}`, { data: {} });
    expect(reponse.status(), fonction).toBe(401);
  }
});
