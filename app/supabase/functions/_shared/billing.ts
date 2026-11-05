// Règles d'abonnement, sans dépendance (testées avec `node --test`, utilisées par les fonctions
// Deno) : quel abonnement Stripe d'un client fait foi, et quand refuser d'en ouvrir un second.
// Reprises de Cyber Academy, sans l'essai gratuit.

/** Ce que ces règles lisent d'un abonnement Stripe (Stripe.Subscription en a la forme). */
export interface StripeSubscriptionLike {
  readonly id: string;
  readonly status: string;
  /** Date de création, en secondes Unix. */
  readonly created: number;
  readonly cancel_at_period_end: boolean;
  readonly current_period_end?: number;
  readonly items: {
    readonly data: readonly {
      readonly current_period_end?: number;
      readonly price: { readonly id: string };
    }[];
  };
}

/** Du plus au moins déterminant : un abonnement qui donne ou facture l'accès passe avant un ancien. */
const PRIORITY = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
  'incomplete_expired',
  'canceled',
];

/** Encore facturés ou à régulariser : un nouvel abonnement ferait payer deux fois. */
const BILLED = ['active', 'trialing', 'past_due', 'unpaid'];

/**
 * Abonnement qui fait foi pour un client qui en a eu plusieurs (résilié puis réabonné, paiement
 * en double) : le plus déterminant, puis le plus récent. Un événement tardif sur un ancien
 * abonnement ne peut donc plus effacer celui qui est en cours.
 */
export function pickSubscription<T extends StripeSubscriptionLike>(subs: readonly T[]): T | null {
  const rank = (sub: T) => {
    const index = PRIORITY.indexOf(sub.status);
    return index === -1 ? PRIORITY.length : index;
  };
  return [...subs].sort((a, b) => rank(a) - rank(b) || b.created - a.created)[0] ?? null;
}

export function hasBilledSubscription(subs: readonly StripeSubscriptionLike[]): boolean {
  return subs.some((sub) => BILLED.includes(sub.status));
}

/** Ligne de la table subscriptions. Selon la version de l'API, la fin de période est sur l'article. */
export function subscriptionRow(sub: StripeSubscriptionLike) {
  const item = sub.items.data[0];
  const end = item?.current_period_end ?? sub.current_period_end;
  return {
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price.id ?? null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}
