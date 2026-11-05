import { filterGeneration, type Filtered } from './check.ts';
import { Generation, type Question } from './schema.ts';

/** Enchaînement d'un import, sans dépendance à Deno ni à l'API : testé avec des doublures. */

export interface ReponseIA {
  texte: string;
  stopReason: string | null;
  coutUsd: number;
}

export interface IA {
  tropLong(blocs: unknown[]): Promise<boolean>;
  transcrire(blocs: unknown[]): Promise<ReponseIA>;
  generer(texte: string): Promise<ReponseIA>;
}

export interface Depot {
  lireFichiers(): Promise<unknown[]>;
  supprimerFichiers(): Promise<void>;
  majCours(champs: {
    statut: string;
    raison?: string;
    texte?: string;
    cout_usd: number;
  }): Promise<void>;
  enregistrer(notions: NotionLigne[], coutUsd: number): Promise<void>;
}

export interface CoursATraiter {
  statut: 'transcription' | 'generation';
  format: 'pdf' | 'photos' | 'texte';
  texte: string | null;
  cout_usd: number;
}

export interface QuestionLigne {
  type: Question['type'];
  enonce: string;
  extrait: string;
  difficulte: Question['difficulte'];
  ordre: number;
  presentation: Record<string, string[]>;
  reponse: Record<string, number[]>;
  explication: string;
}

export interface NotionLigne {
  titre: string;
  ordre: number;
  carte_recto: string;
  carte_verso: string;
  questions: QuestionLigne[];
}

export const MESSAGES = {
  tropLong: 'Ce document est trop long : 30 pages environ au maximum.',
  refus: 'Le filtre de sécurité de l’IA a refusé ce cours. Cet import n’est pas décompté.',
  coupe: 'Ce cours est trop long pour être traité en une fois. Cet import n’est pas décompté.',
  vide: 'Aucun texte n’a pu être lu dans ce document. Cet import n’est pas décompté.',
  peuFiable: 'Trop peu de questions fiables ont pu être créées. Cet import n’est pas décompté.',
  panne: 'L’import a échoué. Réessaie plus tard, cet import n’est pas décompté.',
} as const;

function melange<T>(valeurs: readonly T[], aleatoire: () => number): T[] {
  const copie = [...valeurs];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Sépare ce que le navigateur peut lire de la réponse, gardée côté serveur. */
function versQuestion(q: Question, ordre: number, aleatoire: () => number): QuestionLigne {
  const commun = {
    type: q.type,
    enonce: q.enonce,
    extrait: q.extrait,
    difficulte: q.difficulte,
    ordre,
    explication: q.explication,
  };
  if (q.type === 'association') {
    const droite = melange(
      q.paires.map((p) => p.droite),
      aleatoire,
    );
    return {
      ...commun,
      presentation: { gauche: q.paires.map((p) => p.gauche), droite },
      reponse: { associations: q.paires.map((p) => droite.indexOf(p.droite)) },
    };
  }
  if (q.type === 'classement') {
    let etapes = melange(q.etapes, aleatoire);
    // L'ordre de départ n'est jamais déjà le bon.
    if (etapes.every((e, i) => e === q.etapes[i])) etapes = [...etapes.slice(1), etapes[0]];
    return {
      ...commun,
      presentation: { etapes },
      reponse: { ordre: q.etapes.map((e) => etapes.indexOf(e)) },
    };
  }
  const options = q.type === 'vrai_faux' ? q.options : melange(q.options, aleatoire);
  return {
    ...commun,
    presentation: { options: options.map((o) => o.texte) },
    reponse: { correctes: options.flatMap((o, i) => (o.correcte ? [i] : [])) },
  };
}

export function versLignes(filtre: Filtered, aleatoire: () => number = Math.random): NotionLigne[] {
  return filtre.notions.map((n, ordre) => ({
    titre: n.titre,
    ordre,
    carte_recto: n.carte.recto,
    carte_verso: n.carte.verso,
    questions: n.questions.map((q, i) => versQuestion(q, i, aleatoire)),
  }));
}

function messageArret(r: ReponseIA): string | null {
  if (r.stopReason === 'refusal') return MESSAGES.refus;
  if (r.stopReason === 'max_tokens') return MESSAGES.coupe;
  return null;
}

export async function traiter(
  cours: CoursATraiter,
  ia: IA,
  depot: Depot,
  aleatoire: () => number = Math.random,
): Promise<void> {
  let cout = cours.cout_usd;
  const echec = async (raison: string) => {
    // Le document de l'élève ne reste pas sur le serveur après un échec.
    await depot.supprimerFichiers().catch(() => {});
    await depot.majCours({ statut: 'echec', raison, cout_usd: cout });
  };
  try {
    let texte = cours.texte ?? '';
    if (cours.statut === 'transcription') {
      const blocs = await depot.lireFichiers();
      if (await ia.tropLong(blocs)) return await echec(MESSAGES.tropLong);
      const r = await ia.transcrire(blocs);
      cout += r.coutUsd;
      const arret = messageArret(r);
      if (arret) return await echec(arret);
      if (!r.texte.trim()) return await echec(MESSAGES.vide);
      texte = r.texte;
      await depot.supprimerFichiers();
      if (cours.format === 'photos') {
        return await depot.majCours({ statut: 'a_relire', texte, cout_usd: cout });
      }
      await depot.majCours({ statut: 'generation', texte, cout_usd: cout });
    }

    const r = await ia.generer(texte);
    cout += r.coutUsd;
    const arret = messageArret(r);
    if (arret) return await echec(arret);
    const parsed = Generation.safeParse(JSON.parse(r.texte));
    if (!parsed.success) return await echec(MESSAGES.peuFiable);
    const filtre = filterGeneration(parsed.data, texte);
    if (filtre.statut === 'echec') return await echec(MESSAGES.peuFiable);
    await depot.enregistrer(versLignes(filtre, aleatoire), cout);
  } catch (e) {
    console.error('Échec de l’import', e instanceof Error ? e.message : e);
    await echec(MESSAGES.panne);
  }
}
