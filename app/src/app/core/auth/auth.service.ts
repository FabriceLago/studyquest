import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase';

export interface Profile {
  readonly pseudo: string;
  /** Rang dans AVATARS (core/avatars.ts). */
  readonly avatar: number;
}

export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const OK: AuthResult = { ok: true };

/**
 * Utilisation libre (ajout du 7 novembre 2026) : pas de compte à créer. L'élève ouvre une session
 * anonyme Supabase, gardée par ce navigateur ; pour le serveur, c'est un compte comme un autre.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(SUPABASE);
  private readonly session = signal<Session | null>(null);

  /** Résolue une fois la session gardée par le navigateur relue. */
  readonly whenReady: Promise<void>;
  readonly user = computed(() => this.session()?.user ?? null);
  /** Identifiant seul : ne change que si le compte change, pas à chaque événement de session. */
  readonly userId = computed(() => this.session()?.user.id ?? null);
  readonly profile = signal<Profile | null>(null);

  constructor() {
    this.whenReady = new Promise((resolve) => {
      this.client.then(
        (supabase) =>
          // Pas d'appel à Supabase dans ce rappel, il bloquerait le client : le profil est chargé
          // par l'effet ci-dessous.
          supabase.auth.onAuthStateChange((_event, session) => {
            this.session.set(session);
            resolve();
          }),
        () => resolve(),
      );
    });
    effect(() => {
      const userId = this.userId();
      untracked(() => void this.loadProfile(userId));
    });
  }

  /** Ouvre la session anonyme. La déclaration d'âge est revérifiée par le serveur. */
  async commencer(captchaToken?: string): Promise<AuthResult> {
    return this.attempt(async (supabase) => {
      const { error } = await supabase.auth.signInAnonymously({
        options: { data: { declares_15_plus: true }, captchaToken },
      });
      return error ? { ok: false, message: authMessage(error) } : OK;
    });
  }

  async updatePseudo(pseudo: string): Promise<AuthResult> {
    const userId = this.userId();
    if (!userId) return { ok: false, message: authMessage({}) };
    return this.attempt(async (supabase) => {
      const { error } = await supabase.from('profiles').update({ pseudo }).eq('id', userId);
      if (error) return { ok: false, message: authMessage({}) };
      this.profile.update((p) => (p ? { ...p, pseudo } : p));
      return OK;
    });
  }

  /** Le serveur refuse un avatar pas encore débloqué par le niveau. */
  async choisirAvatar(avatar: number): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('choisir_avatar', { p_avatar: avatar });
    if (!error) this.profile.update((p) => (p ? { ...p, avatar } : p));
    return !error;
  }

  /** Efface la session et tout ce qui s'y rattache (serveur), puis l'oublie dans ce navigateur. */
  async deleteAccount(): Promise<AuthResult> {
    return this.attempt(async (supabase) => {
      const { error } = await supabase.rpc('delete_my_account');
      // SQ409 : abonnement encore facturé, le serveur dit quoi faire.
      if (error)
        return { ok: false, message: error.code === 'SQ409' ? error.message : authMessage({}) };
      await supabase.auth.signOut({ scope: 'local' });
      return OK;
    });
  }

  private async attempt(
    action: (supabase: SupabaseClient) => Promise<AuthResult>,
  ): Promise<AuthResult> {
    try {
      return await action(await this.client);
    } catch {
      return { ok: false, message: authMessage({ name: 'AuthRetryableFetchError', status: 0 }) };
    }
  }

  private async loadProfile(userId: string | null): Promise<void> {
    if (!userId) {
      this.profile.set(null);
      return;
    }
    const supabase = await this.client;
    const { data } = await supabase
      .from('profiles')
      .select('pseudo, avatar')
      .eq('id', userId)
      .maybeSingle();
    // Une réponse arrivée après une suppression ne doit pas réafficher l'ancien profil.
    if (this.userId() === userId)
      this.profile.set(data ? { pseudo: data.pseudo, avatar: data.avatar } : null);
  }
}

export function authMessage(error: {
  readonly code?: string;
  readonly status?: number;
  readonly name?: string;
}): string {
  switch (error.code) {
    case 'over_request_rate_limit':
      return 'Trop de tentatives : patiente quelques minutes avant de réessayer.';
    case 'anonymous_provider_disabled':
      return 'L’accès libre est fermé pour le moment. Réessaie plus tard.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'Le service ne répond pas. Réessaie plus tard.';
  }
  return 'La demande a échoué. Réessaie plus tard.';
}
