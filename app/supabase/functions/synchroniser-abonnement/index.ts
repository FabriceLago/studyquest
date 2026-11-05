// Au retour de la page de paiement : relit l'abonnement chez Stripe sans attendre le webhook, qui
// peut arriver plus tard (ou jamais sur un poste local, que Stripe ne peut pas joindre).
import {
  INDISPONIBLE,
  admin,
  json,
  preflight,
  rafraichir,
  requestUser,
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
    return (await rafraichir(data.stripe_customer_id))
      ? json({ ok: true })
      : json({ error: 'La demande a échoué : réessaie.' }, 500);
  } catch {
    return json({ error: INDISPONIBLE }, 502);
  }
});
