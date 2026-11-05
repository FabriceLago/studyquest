// Envoie les rappels du moment. Appelée toutes les 15 minutes par pg_cron (migration
// 20261105130000_rappels.sql), avec un secret partagé avec le coffre de la base.
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { NOTIFICATION, hoteAutorise } from '../_shared/rappels.ts';

const SECRET = Deno.env.get('RAPPELS_SECRET') ?? '';
/** Hôte de test, sur le poste de développement seulement. */
const LOCAL = Deno.env.get('PUSH_HOTE_LOCAL') ?? '';
const VAPID = {
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
};
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('Authorization') !== `Bearer ${SECRET}`) {
    return new Response('Accès refusé.', { status: 401 });
  }
  // Une heure imposée : pour rattraper un envoi manqué, et pour les tests.
  const { maintenant } = await req.json().catch(() => ({}));
  const { data, error } = await admin.rpc(
    'rappels_a_envoyer',
    maintenant ? { p_maintenant: maintenant } : {},
  );
  if (error) return new Response('Base injoignable.', { status: 500 });

  let envoyes = 0;
  for (const s of data ?? []) {
    if (!hoteAutorise(s.endpoint, LOCAL)) continue;
    const requete = webpush.generateRequestDetails(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(NOTIFICATION),
      { vapidDetails: VAPID, TTL: 3600 },
    );
    // La longueur est calculée par fetch.
    const headers: Record<string, string> = { ...requete.headers };
    delete headers['Content-Length'];
    const reponse = await fetch(requete.endpoint, {
      method: 'POST',
      headers,
      body: requete.body,
    }).catch(() => null);
    if (reponse?.ok) envoyes++;
    // Abonnement expiré, ou retiré dans le navigateur : on l'oublie.
    if (reponse?.status === 404 || reponse?.status === 410) {
      await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return Response.json({ envoyes });
});
