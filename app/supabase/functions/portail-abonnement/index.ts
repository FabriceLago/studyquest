// Portail Stripe de l'abonné : moyen de paiement, factures, résiliation. Repris de Cyber Academy.
import {
  INDISPONIBLE,
  SITE_URL,
  admin,
  json,
  preflight,
  requestUser,
  stripe,
} from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const user = await requestUser(req);
  if (!user) return json({ error: 'Connexion requise.' }, 401);

  const { data } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return json({ error: 'Aucun abonnement pour ce compte.' }, 404);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${SITE_URL}/abonnement`,
      locale: 'fr',
    });
    return json({ url: session.url });
  } catch {
    return json({ error: INDISPONIBLE }, 502);
  }
});
