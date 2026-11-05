// Événements Stripe : tient à jour la table subscriptions (renouvellement, impayé, résiliation).
// Repris de Cyber Academy (stripe-webhook). On relit chez Stripe l'abonnement qui fait foi plutôt
// que de croire l'événement, qui peut arriver en double ou dans le désordre.
import { Stripe, rafraichir, stripe } from '../_shared/stripe.ts';

const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      req.headers.get('Stripe-Signature') ?? '',
      SECRET,
      undefined,
      crypto,
    );
  } catch {
    return new Response('Signature invalide.', { status: 400 });
  }
  if (!event.type.startsWith('customer.subscription.')) return new Response('ignoré');

  const { customer: owner } = event.data.object as Stripe.Subscription;
  const customer = typeof owner === 'string' ? owner : owner.id;
  try {
    // Erreur : Stripe renverra l'événement plus tard.
    return (await rafraichir(customer))
      ? new Response('ok')
      : new Response('Enregistrement impossible.', { status: 500 });
  } catch {
    return new Response('Stripe injoignable.', { status: 502 });
  }
});
