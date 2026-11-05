import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase';

/** Spécification § 7 : un rappel par jour au plus, seulement si l'élève l'a demandé. */
@Injectable({ providedIn: 'root' })
export class RappelsService {
  private readonly swPush = inject(SwPush);
  private readonly client = inject(SUPABASE);
  private readonly auth = inject(AuthService);
  /** Faux sans service worker : application non installée, développement, tests. */
  readonly disponible = this.swPush.isEnabled;

  /** Heure du rappel (« 18:00 »), ou null s'il est arrêté. */
  async heure(): Promise<string | null> {
    const supabase = await this.client;
    const { data } = await supabase.from('profiles').select('rappel').maybeSingle();
    return data?.rappel?.slice(0, 5) ?? null;
  }

  /** Demande l'autorisation du navigateur puis enregistre l'heure. Renvoie un message d'erreur. */
  async activer(heure: string): Promise<string | null> {
    let endpoint: string | undefined;
    let cles: Record<string, string> | undefined;
    try {
      const abonnement = await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      });
      ({ endpoint, keys: cles } = abonnement.toJSON());
    } catch {
      return 'Ton navigateur n’a pas autorisé les notifications.';
    }
    const supabase = await this.client;
    const { error } = await supabase.rpc('enregistrer_push', {
      p_endpoint: endpoint,
      p_p256dh: cles?.['p256dh'],
      p_auth: cles?.['auth'],
    });
    return error ? 'Le rappel n’a pas pu être enregistré.' : this.regler(heure);
  }

  /** Change l'heure, ou arrête le rappel avec null. */
  async regler(heure: string | null): Promise<string | null> {
    const supabase = await this.client;
    const { error } = await supabase
      .from('profiles')
      .update({ rappel: heure })
      .eq('id', this.auth.userId());
    return error ? 'Le rappel n’a pas pu être enregistré.' : null;
  }

  async arreter(): Promise<string | null> {
    await this.swPush.unsubscribe().catch(() => null);
    const supabase = await this.client;
    await supabase.from('push_subscriptions').delete().eq('owner', this.auth.userId());
    return this.regler(null);
  }
}
