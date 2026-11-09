import { Injectable, computed, inject, signal } from '@angular/core';
import { REGLES, xpTotal } from '../local/base';
import { Store } from '../local/store';
import { niveau } from '../session/session.service';

export interface Profile {
  readonly pseudo: string;
  /** Rang dans AVATARS (core/avatars.ts). */
  readonly avatar: number;
}

export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const OK: AuthResult = { ok: true };
// Sans caractère de contrôle ni d'inversion de sens.
const INTERDITS = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/u;

/**
 * Sans compte ni serveur : le profil est créé dans ce navigateur après la déclaration d'âge.
 * Le nom de la classe est gardé pour que les pages n'aient pas à changer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly store = inject(Store);

  readonly profile = signal<Profile | null>(this.store.lire().profil);
  readonly userId = computed(() => (this.profile() ? 'local' : null));
  readonly whenReady: Promise<void> = Promise.resolve();

  async commencer(): Promise<AuthResult> {
    const profil = this.store.modifier((e) => (e.profil ??= { pseudo: 'Joueur', avatar: 0 }));
    this.profile.set({ ...profil });
    return OK;
  }

  async updatePseudo(pseudo: string): Promise<AuthResult> {
    const propre = pseudo.trim();
    if (propre.length < 1 || propre.length > 30 || INTERDITS.test(propre))
      return { ok: false, message: 'Choisis un pseudo de 1 à 30 caractères.' };
    this.store.modifier((e) => e.profil && (e.profil.pseudo = propre));
    this.profile.update((p) => (p ? { ...p, pseudo: propre } : p));
    return OK;
  }

  /** Refuse un avatar pas encore débloqué par le niveau. */
  async choisirAvatar(avatar: number): Promise<boolean> {
    const requis = REGLES.avatarsNiveaux[avatar];
    if (requis === undefined || niveau(xpTotal(this.store.lire())) < requis) return false;
    this.store.modifier((e) => e.profil && (e.profil.avatar = avatar));
    this.profile.update((p) => (p ? { ...p, avatar } : p));
    return true;
  }

  /** Efface toute la progression gardée par ce navigateur. */
  async deleteAccount(): Promise<AuthResult> {
    this.store.effacer();
    this.profile.set(null);
    return OK;
  }
}
