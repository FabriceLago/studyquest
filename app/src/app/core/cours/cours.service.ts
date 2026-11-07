import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase';

export type Format = 'pdf' | 'photos' | 'texte';
export type Statut = 'en_attente' | 'transcription' | 'a_relire' | 'generation' | 'pret' | 'echec';

export interface Cours {
  readonly id: string;
  readonly titre: string;
  /** « manuel » : écrit à la main, sans import. */
  readonly format: Format | 'manuel';
  readonly statut: Statut;
  readonly raison: string | null;
  readonly texte: string | null;
  readonly updated_at: string;
  readonly date_examen: string | null;
  readonly code_partage: string | null;
  readonly partage_de: string | null;
}

const CHAMPS_COURS =
  'id, titre, format, statut, raison, texte, updated_at, date_examen, code_partage, partage_de';

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

export interface Brouillon {
  readonly titre: string;
  readonly format: Format;
  readonly fichiers: readonly {
    readonly nom: string;
    readonly taille: number;
    readonly type: string;
  }[];
  readonly texte: string;
}

const MO = 1024 * 1024;

/** Limites du § 4 de la spécification ; le serveur les revérifie. Renvoie l'erreur à afficher. */
export function validerImport(b: Brouillon): string | null {
  if (b.titre.trim().length === 0 || b.titre.trim().length > 120)
    return 'Donne un titre à ce cours (120 caractères au plus).';
  if (b.format === 'texte') {
    if (b.texte.trim().length < 200)
      return 'Colle au moins quelques phrases de cours (200 caractères).';
    if (b.texte.length > 60_000) return 'Ce texte dépasse 60 000 caractères.';
    return null;
  }
  if (b.fichiers.length === 0)
    return b.format === 'pdf' ? 'Choisis un fichier PDF.' : 'Choisis au moins une photo.';
  if (b.format === 'pdf') {
    if (b.fichiers.length > 1 || b.fichiers[0].type !== 'application/pdf')
      return 'Choisis un seul fichier PDF.';
    if (b.fichiers[0].taille > 20 * MO) return 'Ce PDF dépasse 20 Mo.';
    return null;
  }
  if (b.fichiers.length > 30) return 'Choisis 30 photos au plus.';
  if (b.fichiers.some((f) => !f.type.startsWith('image/'))) return 'Choisis uniquement des photos.';
  return null;
}

/** Une photo réduite à 1 600 px avant l'envoi, comme prévu par la spécification. */
export async function reduirePhoto(fichier: Blob): Promise<Blob> {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canevas = document.createElement('canvas');
  canevas.width = Math.round(image.width * echelle);
  canevas.height = Math.round(image.height * echelle);
  canevas.getContext('2d')?.drawImage(image, 0, 0, canevas.width, canevas.height);
  image.close();
  return new Promise((resolve, reject) =>
    canevas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Photo illisible'))),
      'image/jpeg',
      0.85,
    ),
  );
}

export function messageCreation(code: string | undefined): string {
  if (code === 'SQ409') return 'Un import est déjà en cours : attends qu’il se termine.';
  if (code === 'SQ429') return 'Tu as atteint ton nombre d’imports pour ce mois-ci.';
  return 'L’import n’a pas pu démarrer. Réessaie plus tard.';
}

export function messageRejoindre(code: string | undefined): string {
  if (code === 'SQ404') return 'Ce code n’existe pas ou n’est plus actif.';
  if (code === 'SQ409') return 'Ce cours est déjà le tien.';
  if (code === 'SQ429') return 'Ce code a atteint son nombre de personnes.';
  return 'Le cours n’a pas pu être ajouté. Réessaie plus tard.';
}

/** Plusieurs questions citent souvent le même passage du cours. Une question écrite à la main n'en cite aucun. */
export function extraitsUniques(notion: Pick<NotionVue, 'questions'>): string[] {
  return [...new Set(notion.questions.map((q) => q.extrait).filter(Boolean))];
}

/** Limites des cours écrits à la main, reprises de regles() : le serveur les revérifie. */
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

/** Ce que reçoit ecrire_cours : textes rognés, choix vides retirés. */
export function versEnvoi(notions: readonly NotionEcrite[]) {
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

export function messageEcriture(code: string | undefined): string {
  if (code === 'SQ429')
    return `Limite atteinte : ${ECRITURE.notions} notions par cours, 100 cours écrits à la main.`;
  if (code === 'SQ404') return 'Ce cours ne peut pas recevoir de nouvelles notions.';
  return 'Le cours n’a pas pu être enregistré. Vérifie ta connexion, puis réessaie.';
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

@Injectable({ providedIn: 'root' })
export class CoursService {
  private readonly client = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  async liste(): Promise<Cours[]> {
    const supabase = await this.client;
    const { data } = await supabase
      .from('courses')
      .select(CHAMPS_COURS)
      .order('created_at', { ascending: false });
    return (data ?? []) as Cours[];
  }

  async quota(): Promise<{ pretes: number; total: number }> {
    const supabase = await this.client;
    const mois = `${new Date().toISOString().slice(0, 7)}-01`;
    const [{ data: usage }, { data: total }] = await Promise.all([
      supabase.from('import_usage').select('pretes').eq('mois', mois).maybeSingle(),
      supabase.rpc('quota_imports_mensuel'),
    ]);
    return { pretes: usage?.pretes ?? 0, total: total ?? 0 };
  }

  async lire(id: string): Promise<Cours | null> {
    const supabase = await this.client;
    const { data } = await supabase.from('courses').select(CHAMPS_COURS).eq('id', id).maybeSingle();
    return data as Cours | null;
  }

  async notions(id: string): Promise<NotionVue[]> {
    const supabase = await this.client;
    const { data } = await supabase
      .from('notions')
      .select('id, titre, carte_recto, carte_verso, questions(id, type, enonce, extrait, ordre)')
      .eq('course_id', id)
      .order('ordre')
      .order('ordre', { referencedTable: 'questions' });
    return (data ?? []) as NotionVue[];
  }

  /** Crée le cours, dépose les fichiers, puis lance l'import. Renvoie l'identifiant ou l'erreur. */
  async importer(
    titre: string,
    format: Format,
    fichiers: readonly Blob[],
    texte: string,
  ): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data: id, error } = await supabase.rpc('creer_import', {
      p_titre: titre.trim(),
      p_format: format,
      p_texte: format === 'texte' ? texte : null,
    });
    if (error) return { erreur: messageCreation(error.code) };
    const dossier = `${this.auth.userId()}/${id}`;
    for (const [i, fichier] of fichiers.entries()) {
      const nom = `${String(i + 1).padStart(2, '0')}.${format === 'pdf' ? 'pdf' : 'jpg'}`;
      const { error: envoi } = await supabase.storage
        .from('imports')
        .upload(`${dossier}/${nom}`, fichier);
      if (envoi)
        return { erreur: 'L’envoi du fichier a échoué. Vérifie ta connexion, puis réessaie.' };
    }
    await this.lancer(id);
    return { id };
  }

  /** Crée un cours écrit à la main (cours nul) ou lui ajoute des notions. Ni IA ni quota. */
  async ecrire(
    cours: string | null,
    titre: string | null,
    notions: readonly NotionEcrite[],
  ): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('ecrire_cours', {
      p_cours: cours,
      p_titre: titre?.trim() ?? null,
      p_notions: versEnvoi(notions),
    });
    return error ? { erreur: messageEcriture(error.code) } : { id: data };
  }

  /** Démarre, reprend ou poursuit après relecture. Une erreur ici se voit dans le statut du cours. */
  async lancer(id: string): Promise<void> {
    const supabase = await this.client;
    await supabase.functions.invoke('import-cours', { body: { cours: id } });
  }

  async corriger(id: string, texte: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('corriger_transcription', { p_id: id, p_texte: texte });
    return !error;
  }

  async fixerExamen(id: string, date: string | null): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('fixer_examen', { p_cours: id, p_date: date });
    return !error;
  }

  /** Le code n'est donné qu'à qui déclare avoir le droit de partager ce cours. */
  async partager(id: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('partager_cours', { p_cours: id, p_droit: true });
    return !error;
  }

  async arreterPartage(id: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.rpc('arreter_partage', { p_cours: id });
    return !error;
  }

  async rejoindre(code: string): Promise<{ id: string } | { erreur: string }> {
    const supabase = await this.client;
    const { data, error } = await supabase.rpc('rejoindre_cours', { p_code: code });
    return error ? { erreur: messageRejoindre(error.code) } : { id: data };
  }

  async supprimerQuestion(id: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.from('questions').delete().eq('id', id);
    return !error;
  }

  async supprimerCours(id: string): Promise<boolean> {
    const supabase = await this.client;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    return !error;
  }
}
