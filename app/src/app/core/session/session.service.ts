import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase';
import { CoursVille } from '../ville/ville';

export type Mission = 'reviser' | 'decouvrir' | 'defi';

export interface Journee {
  readonly reviser: { readonly questions: number; readonly fait: boolean };
  readonly decouvrir: { readonly questions: number; readonly fait: boolean };
  readonly defi: { readonly disponible: boolean; readonly fait: boolean };
  readonly jour_compte: boolean;
  readonly mini_questions: number;
  readonly xp_jour: number;
  readonly plafond: number;
  readonly xp_mission: number;
  readonly xp_total: number;
  readonly notions_maitrisees: number;
  readonly serie: number;
  readonly gels: number;
}

export interface QuestionMission {
  readonly id: string;
  readonly type: 'unique' | 'multiple' | 'vrai_faux' | 'association' | 'classement';
  readonly enonce: string;
  readonly presentation: {
    readonly options?: readonly string[];
    readonly gauche?: readonly string[];
    readonly droite?: readonly string[];
    readonly etapes?: readonly string[];
  };
  readonly notion: string;
  readonly cours: string;
}

export type Reponse =
  | { readonly choisies: readonly number[] }
  | { readonly associations: readonly number[] }
  | { readonly ordre: readonly number[] };

export interface Cle {
  readonly correctes?: readonly number[];
  readonly associations?: readonly number[];
  readonly ordre?: readonly number[];
}

/** Sans `compte`, le serveur n'a rien corrigé : la question était déjà traitée ou hors délai. */
export interface Resultat {
  readonly compte: boolean;
  readonly juste?: boolean;
  readonly xp?: number;
  readonly prime?: number;
  readonly reponse?: Cle;
  readonly explication?: string;
  readonly extrait?: string;
}

export interface BilanDefi {
  readonly prime: number;
  readonly justes: number;
  readonly total: number;
  readonly xp: number;
}

export interface ScoreExamen {
  readonly justes: number;
  readonly total: number;
  readonly notions: readonly {
    readonly titre: string;
    readonly justes: number;
    readonly total: number;
  }[];
}

/** Soit le score d'un examen terminé, soit les questions qui restent et le temps restant. */
export interface ExamenBlanc {
  readonly id: string;
  readonly score?: ScoreExamen;
  readonly total?: number;
  readonly questions?: QuestionMission[];
  readonly secondes?: number;
}

export interface NotionFaible {
  readonly notion: string | null;
  readonly questions: number;
}

export function messageNotionFaible({ notion, questions }: NotionFaible): string {
  if (!notion) return 'Aucune notion à retravailler : tout est juste.';
  if (questions === 0)
    return `Les questions ratées de « ${notion} » ne sont pas encore découvertes : lance Découvrir.`;
  return questions === 1
    ? `1 question de « ${notion} » est dans tes révisions du jour.`
    : `${questions} questions de « ${notion} » sont dans tes révisions du jour.`;
}

/** Soit le classement d'une partie terminée, soit les questions qui restent et le temps restant. */
export interface PartieDuel {
  readonly id: string;
  readonly code: string;
  readonly total: number;
  readonly questions?: QuestionMission[];
  readonly secondes?: number;
  readonly classement?: readonly {
    readonly pseudo: string;
    readonly justes: number;
    readonly moi: boolean;
  }[];
}

export interface DuelRecent {
  readonly id: string;
  readonly titre: string;
  readonly justes: number | null;
  readonly total: number;
  readonly joueurs: number;
}

export function messageDuel(code: string | undefined): string {
  if (code === 'SQ404') return 'Ce code ne correspond à aucun duel.';
  if (code === 'SQ403') return 'Pour jouer, il faut d’abord recevoir ce cours avec son code.';
  if (code === 'SQ429') return 'Tu as atteint le nombre de duels possibles pour aujourd’hui.';
  if (code === 'SQ409') return 'Ce cours ne permet pas de lancer un duel.';
  return 'Le duel n’a pas pu démarrer. Réessaie plus tard.';
}

/** Ce que lit le mode écoute : l'énoncé et les choix, jamais une correction. */
export function texteALire(q: Pick<QuestionMission, 'enonce' | 'presentation'>): string {
  const { options, gauche, droite, etapes } = q.presentation;
  const suite = options
    ? options.map((option, i) => `Réponse ${i + 1} : ${option}.`)
    : gauche
      ? [`À associer : ${gauche.join(', ')}.`, `Avec : ${droite?.join(', ')}.`]
      : [`À remettre dans l’ordre : ${etapes?.join(', ')}.`];
  return [q.enonce, ...suite].join(' ');
}

export const duree = (secondes: number): string =>
  `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;

/** Spécification § 3 : niveau 2 à 100 XP, 3 à 400, 4 à 900. */
export const niveau = (xp: number): number => Math.floor(Math.sqrt(xp / 100)) + 1;
export const seuil = (n: number): number => (n - 1) ** 2 * 100;

/** La réponse à envoyer, ou null tant que la saisie est incomplète. */
export function reponseDonnee(
  q: QuestionMission,
  choisies: readonly number[],
  associations: readonly (number | null)[],
  ordre: readonly number[],
): Reponse | null {
  if (q.presentation.options) return choisies.length > 0 ? { choisies } : null;
  if (q.presentation.gauche)
    return associations.every((a) => a !== null)
      ? { associations: associations as number[] }
      : null;
  return { ordre };
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly client = inject(SUPABASE);

  async journee(): Promise<Journee | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('mission_du_jour');
    return data as Journee | null;
  }

  /** Null si la mission n'est pas possible, par exemple un défi avant 5 questions vues. */
  async questions(
    mission: Mission,
  ): Promise<{ questions: QuestionMission[]; secondes?: number } | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('questions_mission', { p_mission: mission });
    return data;
  }

  /** Null si le serveur n'a pas pu être joint : la réponse peut être renvoyée. */
  async repondre(question: string, mission: Mission, reponse: Reponse): Promise<Resultat | null> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('submit_answer', {
      p_question: question,
      p_mission: mission,
      p_reponse: reponse,
    });
    return error ? null : data;
  }

  async demarrerExamen(cours: string): Promise<ExamenBlanc | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('demarrer_examen', { p_cours: cours });
    return data;
  }

  /** False si le serveur refuse, par exemple après la fin du temps ; null s'il n'a pas répondu. */
  async repondreExamen(
    examen: string,
    question: string,
    reponse: Reponse,
  ): Promise<boolean | null> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('repondre_examen', {
      p_examen: examen,
      p_question: question,
      p_reponse: reponse,
    });
    return error ? null : data;
  }

  async rendreExamen(examen: string): Promise<ScoreExamen | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('rendre_examen', { p_examen: examen });
    return data;
  }

  async reviserNotionFaible(examen: string): Promise<NotionFaible | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('reviser_notion_faible', { p_examen: examen });
    return data;
  }

  async creerDuel(cours: string): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('creer_duel', { p_cours: cours });
    return error ? { erreur: messageDuel(error.code) } : { id: data };
  }

  async rejoindreDuel(code: string): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('rejoindre_duel', { p_code: code });
    return error ? { erreur: messageDuel(error.code) } : { id: data };
  }

  /** Null si le duel n'est pas accessible à ce compte. */
  async jouerDuel(duel: string): Promise<PartieDuel | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('jouer_duel', { p_duel: duel });
    return data;
  }

  /** False si le serveur refuse, par exemple après la fin du temps ; null s'il n'a pas répondu. */
  async repondreDuel(duel: string, question: string, reponse: Reponse): Promise<boolean | null> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('repondre_duel', {
      p_duel: duel,
      p_question: question,
      p_reponse: reponse,
    });
    return error ? null : data;
  }

  async terminerDuel(duel: string): Promise<PartieDuel | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('terminer_duel', { p_duel: duel });
    return data;
  }

  async mesDuels(): Promise<DuelRecent[]> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('mes_duels');
    return data ?? [];
  }

  /** Un quartier par cours prêt, avec l'état de chaque notion (spécification § 3). */
  async maVille(): Promise<CoursVille[]> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('ma_ville');
    return data ?? [];
  }

  async terminerDefi(): Promise<BilanDefi | null> {
    const supabase = await this.client;
    const { data } = await supabase.rpc('terminer_defi');
    return data;
  }
}
