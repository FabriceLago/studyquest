import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase';

export interface Profile {
  readonly pseudo: string;
  /** Rang dans AVATARS (core/avatars.ts). */
  readonly avatar: number;
}

export type AuthResult =
  | { readonly ok: true; readonly needsConfirmation: boolean }
  | { readonly ok: false; readonly message: string; readonly unconfirmed?: boolean };

const OK: AuthResult = { ok: true, needsConfirmation: false };

/** Erreurs qui ne disent rien de l'adresse : les seules montrées lors d'un renvoi d'e-mail. */
function isTransient(error: {
  readonly code?: string;
  readonly status?: number;
  readonly name?: string;
}) {
  return (
    error.code === 'over_request_rate_limit' ||
    error.code === 'over_email_send_rate_limit' ||
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0
  );
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);
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

  async signUp(
    email: string,
    password: string,
    pseudo: string,
    captchaToken?: string,
  ): Promise<AuthResult> {
    return this.attempt(async (supabase) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Revérifiée par le serveur : sans cette déclaration, l'inscription est refusée.
          data: { pseudo, declares_15_plus: true },
          emailRedirectTo: `${this.document.location.origin}/`,
          captchaToken,
        },
      });
      // Adresse déjà inscrite : même réponse que pour une nouvelle, pour ne pas révéler qui a un compte.
      if (error?.code === 'user_already_exists' || error?.code === 'email_exists') {
        return { ok: true, needsConfirmation: true };
      }
      if (error) return { ok: false, message: authMessage(error) };
      return { ok: true, needsConfirmation: data.session === null };
    });
  }

  async signIn(email: string, password: string, captchaToken?: string): Promise<AuthResult> {
    return this.attempt(async (supabase) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (!error) return OK;
      const message = authMessage(error);
      return error.code === 'email_not_confirmed'
        ? { ok: false, message, unconfirmed: true }
        : { ok: false, message };
    });
  }

  async resendConfirmation(email: string, captchaToken?: string): Promise<AuthResult> {
    return this.attempt(async (supabase) => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${this.document.location.origin}/`, captchaToken },
      });
      return error && isTransient(error) ? { ok: false, message: authMessage(error) } : OK;
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

  /** Supprime le compte et son profil (serveur), puis ferme la session. */
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

  async signOut(): Promise<void> {
    const supabase = await this.client;
    await supabase.auth.signOut({ scope: 'local' });
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
    // Une réponse arrivée après une déconnexion ne doit pas réafficher l'ancien profil.
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
    case 'invalid_credentials':
      return 'Adresse e-mail ou mot de passe incorrect.';
    case 'weak_password':
      return 'Mot de passe trop faible : choisis-en un d’au moins 10 caractères.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives : patiente quelques minutes avant de réessayer.';
    case 'email_address_invalid':
      return 'Cette adresse e-mail n’est pas valide.';
    case 'email_not_confirmed':
      return 'Confirme d’abord ton adresse grâce au message reçu par e-mail.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées pour le moment.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'Le service de comptes ne répond pas. Réessaie plus tard.';
  }
  return 'La demande a échoué. Réessaie plus tard.';
}
