import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase';

export interface Abonnement {
  readonly status: string;
  /** Date ISO de fin de la période payée. */
  readonly currentPeriodEnd: string | null;
  /** Résilié : reste actif jusqu'à currentPeriodEnd, puis s'arrête. */
  readonly cancelAtPeriodEnd: boolean;
}

/** Payé, ou paiement refusé que Stripe retente encore : mêmes règles que abonne() côté serveur. */
export function estActif(abonnement: Abonnement | null, maintenant: Date): boolean {
  return (
    abonnement !== null &&
    ['active', 'trialing', 'past_due'].includes(abonnement.status) &&
    (abonnement.currentPeriodEnd === null || new Date(abonnement.currentPeriodEnd) > maintenant)
  );
}

const INDISPONIBLE = 'Le service de paiement ne répond pas. Réessaie plus tard.';

/** L'abonnement n'est écrit que par le serveur : ici, on le lit et on ouvre les pages de Stripe. */
@Injectable({ providedIn: 'root' })
export class AbonnementService {
  private readonly client = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);

  async charger(): Promise<Abonnement | null> {
    const supabase = await this.client;
    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end')
      .maybeSingle();
    return data
      ? {
          status: data.status,
          currentPeriodEnd: data.current_period_end,
          cancelAtPeriodEnd: data.cancel_at_period_end,
        }
      : null;
  }

  /** Page de paiement Stripe. Renvoie un message d'erreur, ou rien si la page s'ouvre. */
  payer(): Promise<string | null> {
    return this.ouvrir('creer-paiement');
  }

  /** Portail Stripe : moyen de paiement, factures, résiliation. */
  gerer(): Promise<string | null> {
    return this.ouvrir('portail-abonnement');
  }

  /** Au retour du paiement, sans attendre le webhook. Une erreur laisse la place au webhook. */
  async synchroniser(): Promise<void> {
    const supabase = await this.client;
    await supabase.functions.invoke('synchroniser-abonnement', { body: {} }).catch(() => null);
  }

  private async ouvrir(fonction: string): Promise<string | null> {
    try {
      const supabase = await this.client;
      const { data, error } = await supabase.functions.invoke<{ url: string }>(fonction, {
        body: {},
      });
      if (error || !data?.url) {
        // Message rédigé par la fonction (« Connexion requise. »…), sinon message générique.
        const detail = await (error?.context as Response | undefined)?.json?.().catch(() => null);
        return detail?.error ?? INDISPONIBLE;
      }
      this.document.location.assign(data.url);
      return null;
    } catch {
      return INDISPONIBLE;
    }
  }
}
