// Outils communs aux fonctions d'abonnement, repris de Cyber Academy. Secrets (jamais dans le
// dépôt) : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MENSUEL, SITE_URL.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { pickSubscription, subscriptionRow } from './billing.ts';

export { Stripe };

// Sans clé, le SDK refuse de démarrer et la fonction plante. Avec cette valeur, Stripe refuse
// chaque appel et la fonction répond « indisponible » ; le webhook vérifie toujours ses signatures.
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || 'sk_test_absente', {
  httpClient: Stripe.createFetchHttpClient(),
});

/** Adresse du site : seule origine autorisée, et retour après paiement (jamais celle de la requête). */
export const SITE_URL = Deno.env.get('SITE_URL') ?? '';

/** Client serveur (service_role) : seul autorisé à écrire dans subscriptions. */
export const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

export const INDISPONIBLE = 'Le service de paiement ne répond pas. Réessaie plus tard.';

const CORS = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Réponse à la requête de vérification du navigateur (CORS), sinon null. */
export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response(null, { headers: CORS }) : null;
}

/** Utilisateur connecté qui fait la requête (jeton de session du navigateur), sinon null. */
export async function requestUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user;
}

/**
 * Relit chez Stripe tous les abonnements du client et enregistre celui qui fait foi : les
 * événements arrivent parfois en double, dans le désordre, ou concernent un ancien abonnement.
 */
export async function rafraichir(customer: string): Promise<boolean> {
  const { data } = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
  const sub = pickSubscription(data);
  if (!sub) return true;
  const { error } = await admin
    .from('subscriptions')
    .update(subscriptionRow(sub))
    .eq('stripe_customer_id', customer);
  return !error;
}
