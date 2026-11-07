import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { API, exigeSupabase, commencer, sansDefaut } from './aide';

/**
 * Étape 8 : la chaîne d'envoi d'un rappel, de la base jusqu'au service de notification. Un faux
 * service écoute sur le poste (port 54798) ; la réception sur un vrai téléphone n'est pas testée.
 */
test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
  test.setTimeout(240_000);
});

function envLocal(nom: string): string {
  const fichier = readFileSync('supabase/functions/.env', 'utf8');
  return fichier.match(new RegExp(`^${nom}=(.*)$`, 'm'))?.[1].trim() ?? '';
}

function sql(requete: string): string {
  return execFileSync('docker', [
    'exec',
    'supabase_db_studyquest',
    'psql',
    '-U',
    'postgres',
    '-t',
    '-A',
    '-c',
    requete,
  ]).toString();
}

/** Clés d'un navigateur fictif, au format des abonnements aux notifications. */
const clePublique = () =>
  generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    .publicKey.export({ format: 'der', type: 'spki' })
    .subarray(-65)
    .toString('base64url');

test('un rappel part une fois par jour, chiffré et signé, et un navigateur expiré est oublié', async ({
  page,
  request,
}) => {
  const recus: { url: string; entetes: Record<string, unknown>; taille: number }[] = [];
  const service = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on('data', (m: Buffer) => morceaux.push(m));
    req.on('end', () => {
      recus.push({
        url: req.url ?? '',
        entetes: req.headers,
        taille: Buffer.concat(morceaux).length,
      });
      res.statusCode = req.url?.includes('expire') ? 410 : 201;
      res.end();
    });
  });
  await new Promise<void>((pret) => service.listen(54798, '0.0.0.0', pret));
  try {
    const email = await commencer(page);
    await page.goto('/profil');
    await expect(page.getByRole('heading', { name: 'Rappel du jour' })).toBeVisible();
    // L'autorisation du navigateur n'est pas jouée ici : seule l'heure est vérifiée avant.
    await page.getByLabel('Heure du rappel').fill('23:00');
    await page.getByRole('button', { name: 'Activer le rappel' }).click();
    await expect(page.getByText('Choisis une heure entre 6 h et 22 h.')).toBeVisible();
    await sansDefaut(page);

    const compte = `'${email}'`;
    sql(`update public.profiles set rappel = '10:00' where id = ${compte};
         insert into public.push_subscriptions (owner, endpoint, p256dh, auth) values
           (${compte}, 'http://host.docker.internal:54798/push/actif-${Date.now()}', '${clePublique()}', '${randomBytes(16).toString('base64url')}'),
           (${compte}, 'http://host.docker.internal:54798/push/expire-${Date.now()}', '${clePublique()}', '${randomBytes(16).toString('base64url')}')`);

    const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const envoyer = (secret: string) =>
      request.post(`${API}/functions/v1/envoyer-rappels`, {
        headers: { Authorization: `Bearer ${secret}` },
        data: { maintenant: `${jour} 10:05 Europe/Paris` },
      });

    expect((await envoyer('mauvais-secret')).status()).toBe(401);
    const premier = await envoyer(envLocal('RAPPELS_SECRET'));
    expect(premier.status()).toBe(200);
    expect(await premier.json()).toEqual({ envoyes: 1 });

    const actif = recus.find((r) => r.url.startsWith('/push/actif'));
    expect(recus).toHaveLength(2);
    expect(actif?.entetes['content-encoding']).toBe('aes128gcm');
    expect(actif?.entetes['ttl']).toBe('3600');
    expect(String(actif?.entetes['authorization'])).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(actif?.taille).toBeGreaterThan(100);
    expect(
      sql(`select count(*) from public.push_subscriptions where owner = ${compte}`).trim(),
    ).toBe('1');

    // Un seul rappel par jour, même si l'envoi est relancé.
    expect(await (await envoyer(envLocal('RAPPELS_SECRET'))).json()).toEqual({ envoyes: 0 });
    expect(recus).toHaveLength(2);
  } finally {
    service.close();
  }
});
