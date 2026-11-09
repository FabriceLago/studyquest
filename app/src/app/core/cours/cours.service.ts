import { Injectable, inject } from '@angular/core';
import * as base from '../local/base';
import type { NotionEnvoyee } from '../local/base';
import { Store } from '../local/store';

export interface Cours {
  readonly id: string;
  readonly titre: string;
  readonly date_examen: string | null;
}

export interface QuestionVue {
  readonly id: string;
  readonly type: string;
  readonly enonce: string;
  readonly extrait: string;
}

export interface NotionVue {
  readonly id: string;
  readonly titre: string;
  readonly carte_recto: string;
  readonly carte_verso: string;
  readonly questions: readonly QuestionVue[];
}

/** Plusieurs questions citent souvent le même passage du cours. Une question écrite à la main n'en cite aucun. */
export function extraitsUniques(notion: Pick<NotionVue, 'questions'>): string[] {
  return [...new Set(notion.questions.map((q) => q.extrait).filter(Boolean))];
}

/** Limites des cours écrits à la main. */
export const ECRITURE = {
  notions: 12,
  questions: 20,
  choix: 6,
  enonce: 300,
  choixLongueur: 150,
  texte: 300,
} as const;

export interface ChoixEcrit {
  texte: string;
  correcte: boolean;
}

/** Modifiée sur place par le formulaire, comme les deux types suivants. */
export interface QuestionEcrite {
  enonce: string;
  explication: string;
  vraiFaux: boolean;
  vrai: boolean;
  choix: ChoixEcrit[];
}

export interface NotionEcrite {
  titre: string;
  aRetenir: string;
  questions: QuestionEcrite[];
}

export const nouvelleQuestion = (): QuestionEcrite => ({
  enonce: '',
  explication: '',
  vraiFaux: false,
  vrai: true,
  choix: [0, 1, 2].map(() => ({ texte: '', correcte: false })),
});

export const nouvelleNotion = (): NotionEcrite => ({
  titre: '',
  aRetenir: '',
  questions: [nouvelleQuestion()],
});

/** Renvoie l'erreur à afficher, ou null. Un choix laissé vide est ignoré. Titre nul : ajout à un cours. */
export function validerEcriture(
  titre: string | null,
  notions: readonly NotionEcrite[],
): string | null {
  if (titre !== null && (titre.trim().length === 0 || titre.trim().length > 120))
    return 'Donne un titre à ce cours (120 caractères au plus).';
  if (notions.length === 0) return 'Ajoute au moins une notion.';
  for (const [i, notion] of notions.entries()) {
    const ou = `Notion ${i + 1}`;
    if (!notion.titre.trim()) return `${ou} : donne-lui un titre.`;
    if (!notion.aRetenir.trim()) return `${ou} : écris ce qu’il faut en retenir.`;
    if (notion.questions.length === 0) return `${ou} : ajoute au moins une question.`;
    for (const [j, question] of notion.questions.entries()) {
      const ici = `${ou}, question ${j + 1}`;
      if (!question.enonce.trim()) return `${ici} : écris la question.`;
      if (question.vraiFaux) continue;
      if (question.choix.some((c) => c.correcte && !c.texte.trim()))
        return `${ici} : une bonne réponse cochée est vide.`;
      const remplis = question.choix.map((c) => c.texte.trim()).filter(Boolean);
      if (remplis.length < 2) return `${ici} : écris au moins deux choix.`;
      if (new Set(remplis.map((t) => t.toLowerCase())).size < remplis.length)
        return `${ici} : deux choix sont identiques.`;
      if (!question.choix.some((c) => c.correcte))
        return `${ici} : coche au moins une bonne réponse.`;
    }
  }
  return null;
}

/** Ce que reçoit ecrireCours : textes rognés, choix vides retirés. */
export function versEnvoi(notions: readonly NotionEcrite[]): NotionEnvoyee[] {
  return notions.map((n) => ({
    titre: n.titre.trim(),
    a_retenir: n.aRetenir.trim(),
    questions: n.questions.map((q) => {
      const commun = { enonce: q.enonce.trim(), explication: q.explication.trim() || null };
      if (q.vraiFaux) return { ...commun, vrai: q.vrai };
      const choix = q.choix
        .filter((c) => c.texte.trim())
        .map((c) => ({ texte: c.texte.trim(), correcte: c.correcte }));
      return { ...commun, choix };
    }),
  }));
}

export function messageEcriture(): string {
  return `Limite atteinte : ${ECRITURE.notions} notions par cours.`;
}

/** La date du jour de l'élève, au format d'un champ de date. */
export function aujourdhuiIso(maintenant = new Date()): string {
  const decale = new Date(maintenant.getTime() - maintenant.getTimezoneOffset() * 60_000);
  return decale.toISOString().slice(0, 10);
}

/** Vide une fois l'examen passé. */
export function libelleExamen(date: string | null, maintenant = new Date()): string {
  if (!date) return '';
  const jours = Math.round((Date.parse(date) - Date.parse(aujourdhuiIso(maintenant))) / 86_400_000);
  if (jours < 0) return '';
  if (jours === 0) return 'Examen aujourd’hui';
  return jours === 1 ? 'Examen demain' : `Examen dans ${jours} jours`;
}

/** Les cours de l'élève, écrits à la main et gardés dans ce navigateur. */
@Injectable({ providedIn: 'root' })
export class CoursService {
  private readonly store = inject(Store);

  /** Du plus récent au plus ancien. */
  async liste(): Promise<Cours[]> {
    return [...this.store.lire().cours]
      .sort((a, b) => b.cree.localeCompare(a.cree))
      .map(({ id, titre, date_examen }) => ({ id, titre, date_examen }));
  }

  async lire(id: string): Promise<Cours | null> {
    return (await this.liste()).find((c) => c.id === id) ?? null;
  }

  async notions(id: string): Promise<NotionVue[]> {
    const e = this.store.lire();
    return e.notions
      .filter((n) => n.cours === id)
      .sort((a, b) => a.ordre - b.ordre)
      .map((n) => ({
        id: n.id,
        titre: n.titre,
        carte_recto: n.recto,
        carte_verso: n.verso,
        questions: e.questions
          .filter((q) => q.notion === n.id)
          .sort((a, b) => a.ordre - b.ordre)
          .map((q) => ({ id: q.id, type: q.type, enonce: q.enonce, extrait: '' })),
      }));
  }

  /** Crée un cours (cours nul) ou lui ajoute des notions. Renvoie l'identifiant ou l'erreur. */
  async ecrire(
    cours: string | null,
    titre: string | null,
    notions: readonly NotionEcrite[],
  ): Promise<{ id: string } | { erreur: string }> {
    const deja = cours ? (await this.notions(cours)).length : 0;
    if (deja + notions.length > ECRITURE.notions) return { erreur: messageEcriture() };
    const id = this.store.modifier((e) =>
      base.ecrireCours(e, cours, titre, versEnvoi(notions), Date.now()),
    );
    return id ? { id } : { erreur: 'Ce cours n’existe plus.' };
  }

  async fixerExamen(id: string, date: string | null): Promise<boolean> {
    return this.store.modifier((e) => base.fixerExamen(e, id, date, Date.now()));
  }

  async supprimerQuestion(id: string): Promise<boolean> {
    this.store.modifier((e) => base.supprimerQuestion(e, id));
    return true;
  }

  async supprimerCours(id: string): Promise<boolean> {
    this.store.modifier((e) => base.supprimerCours(e, id));
    return true;
  }
}
