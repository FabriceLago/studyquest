import { Injectable, inject } from '@angular/core';
import * as base from '../local/base';
import { Store } from '../local/store';
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

/** Les missions, l'examen blanc et la ville, calculés dans ce navigateur (core/local/base.ts). */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly store = inject(Store);

  async journee(): Promise<Journee | null> {
    return base.missionDuJour(this.store.lire(), Date.now());
  }

  /** Null si la mission n'est pas possible, par exemple un défi avant 5 questions vues. */
  async questions(
    mission: Mission,
  ): Promise<{ questions: QuestionMission[]; secondes?: number } | null> {
    return this.store.modifier((e) => base.questionsMission(e, mission, Date.now()));
  }

  async repondre(question: string, mission: Mission, reponse: Reponse): Promise<Resultat | null> {
    return this.store.modifier((e) => base.repondre(e, question, mission, reponse, Date.now()));
  }

  async demarrerExamen(cours: string): Promise<ExamenBlanc | null> {
    return this.store.modifier((e) => base.demarrerExamen(e, cours, Date.now()));
  }

  /** False si la réponse arrive après la fin du temps. */
  async repondreExamen(
    examen: string,
    question: string,
    reponse: Reponse,
  ): Promise<boolean | null> {
    return this.store.modifier((e) =>
      base.repondreExamen(e, examen, question, reponse, Date.now()),
    );
  }

  async rendreExamen(examen: string): Promise<ScoreExamen | null> {
    return this.store.modifier((e) => base.rendreExamen(e, examen));
  }

  async reviserNotionFaible(examen: string): Promise<NotionFaible | null> {
    return this.store.modifier((e) => base.reviserNotionFaible(e, examen, Date.now()));
  }

  /** Un quartier par cours, avec l'état de chaque notion (spécification § 3). */
  async maVille(): Promise<CoursVille[]> {
    return base.maVille(this.store.lire(), Date.now());
  }

  async terminerDefi(): Promise<BilanDefi | null> {
    return this.store.modifier((e) => base.terminerDefi(e, Date.now()));
  }
}
