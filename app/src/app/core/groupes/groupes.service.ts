import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase';

export interface Groupe {
  readonly id: string;
  readonly nom: string;
}

/** Ce qu'un membre voit d'un autre : pseudo, XP depuis lundi et série. L'id, seulement pour modérer. */
export interface MembreClassement {
  readonly pseudo: string;
  readonly xp: number;
  readonly serie: number;
  readonly moi: boolean;
  readonly id: string | null;
}

export interface Classement {
  readonly nom: string;
  readonly code: string;
  readonly createur: boolean;
  readonly membres: readonly MembreClassement[];
}

export function messageGroupe(code: string | undefined): string {
  switch (code) {
    case 'SQ404':
      return 'Ce code n’existe pas ou n’est plus actif.';
    case 'SQ409':
      return 'Ce groupe est complet : 50 membres au maximum.';
    case 'SQ429':
      return 'Tu as déjà créé 10 groupes, le maximum.';
    case '23514':
      return 'Donne au groupe un nom de 60 caractères au plus.';
  }
  return 'La demande a échoué. Réessaie plus tard.';
}

/** Spécification § 3, Classement. Les droits sont vérifiés par les fonctions serveur. */
@Injectable({ providedIn: 'root' })
export class GroupesService {
  private readonly client = inject(SUPABASE);

  async mesGroupes(): Promise<Groupe[]> {
    const supabase = await this.client;
    const { data } = await supabase.from('groups').select('id, nom').order('created_at');
    return data ?? [];
  }

  async creer(nom: string): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('creer_groupe', { p_nom: nom });
    return error ? { erreur: messageGroupe(error.code) } : { id: data };
  }

  async rejoindre(code: string): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('rejoindre_groupe', { p_code: code });
    return error ? { erreur: messageGroupe(error.code) } : { id: data };
  }

  /** Null hors du groupe : le serveur ne dit pas si le groupe existe. */
  async classement(id: string): Promise<Classement | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('classement_groupe', { p_groupe: id });
    return data ?? null;
  }

  async quitter(id: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('quitter_groupe', { p_groupe: id });
    return !error;
  }

  async retirer(id: string, membre: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('retirer_membre', { p_groupe: id, p_membre: membre });
    return !error;
  }

  async changerCode(id: string): Promise<string | null> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('changer_code_groupe', { p_groupe: id });
    return error ? null : data;
  }

  async supprimer(id: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('supprimer_groupe', { p_groupe: id });
    return !error;
  }
}
