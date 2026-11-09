/**
 * Base locale (9 novembre 2026) : tout vit dans le navigateur, sans serveur. Reprend la logique des
 * anciennes fonctions SQL (révision espacée, XP, série, défi, examen blanc, ville).
 * Fonctions pures sur l'état : store.ts s'occupe de le lire et de l'enregistrer.
 */

/** Valeurs de départ du § 3 de la spécification : à régler ici, et nulle part ailleurs. */
export const REGLES = {
  reviserMax: 15,
  decouvrirMax: 8,
  defiMinVues: 5,
  defiSecondes: 60,
  defiMargeSecondes: 5,
  xpDue: 10,
  xpNouvelle: 5,
  xpDefi: 2,
  xpMission: 20,
  xpPlafond: 300,
  gelsParMois: 2,
  intervalles: [1, 3, 7, 14, 30],
  miniQuestions: 3,
  examenQuestions: 20,
  examenSecondesParQuestion: 60,
  /** Niveau requis pour chacun des avatars, dans l'ordre de core/avatars.ts. */
  avatarsNiveaux: [1, 1, 1, 2, 3, 4, 5, 6],
} as const;

export type MissionBase = 'reviser' | 'decouvrir' | 'defi';
export interface ReponseBase {
  readonly choisies?: readonly number[];
  readonly associations?: readonly number[];
  readonly ordre?: readonly number[];
}

export interface CoursBase {
  id: string;
  titre: string;
  cree: string;
  date_examen: string | null;
}
export interface NotionBase {
  id: string;
  cours: string;
  titre: string;
  ordre: number;
  recto: string;
  verso: string;
  batie: string | null;
}
export interface QuestionBase {
  id: string;
  notion: string;
  type: 'unique' | 'multiple' | 'vrai_faux';
  enonce: string;
  options: string[];
  correctes: number[];
  explication: string;
  ordre: number;
}
export interface JourBase {
  xp: number;
  reviser: boolean;
  decouvrir: boolean;
  defi: boolean;
  mini: boolean;
  defiDebut: number | null;
}
export interface Score {
  justes: number;
  total: number;
  notions: { titre: string; justes: number; total: number }[];
}
export interface ExamenBase {
  id: string;
  cours: string;
  jour: string;
  questions: string[];
  fin: number;
  reponses: Record<string, ReponseBase>;
  score: Score | null;
}

export interface Etat {
  profil: { pseudo: string; avatar: number } | null;
  cours: CoursBase[];
  notions: NotionBase[];
  questions: QuestionBase[];
  revisions: Record<string, { boite: number; echeance: string }>;
  tentatives: { question: string; mission: MissionBase; juste: boolean; xp: number; jour: string }[];
  jours: Record<string, JourBase>;
  examens: ExamenBase[];
}

export const etatVide = (): Etat => ({
  profil: null,
  cours: [],
  notions: [],
  questions: [],
  revisions: {},
  tentatives: [],
  jours: {},
  examens: [],
});

/** Le jour de l'élève, au format AAAA-MM-JJ, dans son fuseau. */
export function jourDe(t: number): string {
  const d = new Date(t);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
const plusJours = (jour: string, n: number): string =>
  new Date(Date.parse(jour) + n * 86_400_000).toISOString().slice(0, 10);
const ecartJours = (a: string, b: string): number =>
  Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export const nouvelId = (): string => crypto.randomUUID();

function melanger<T>(liste: readonly T[]): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** À l'approche d'un examen, une question revient au plus tard à la moitié du temps restant. */
export function prochaineEcheance(jour: string, intervalle: number, examen: string | null): string {
  const reste = examen ? ecartJours(examen, jour) : 0;
  return plusJours(
    jour,
    reste > 0 ? Math.min(intervalle, Math.max(Math.floor(reste / 2), 1)) : intervalle,
  );
}

/** L'ordre des cases cochées n'a pas d'importance. */
export function reponseJuste(q: QuestionBase, r: ReponseBase | undefined): boolean {
  const donne = [...(r?.choisies ?? [])].sort((a, b) => a - b);
  const attendu = [...q.correctes].sort((a, b) => a - b);
  return donne.length === attendu.length && donne.every((v, i) => v === attendu[i]);
}

const jourVide = (): JourBase => ({
  xp: 0,
  reviser: false,
  decouvrir: false,
  defi: false,
  mini: false,
  defiDebut: null,
});
const stats = (e: Etat, jour: string): JourBase => (e.jours[jour] ??= jourVide());
const questionsDuCours = (e: Etat, cours: string): QuestionBase[] => {
  const notions = new Set(e.notions.filter((n) => n.cours === cours).map((n) => n.id));
  return e.questions.filter((q) => notions.has(q.notion));
};
const coursDeQuestion = (e: Etat, q: QuestionBase) =>
  e.cours.find((c) => c.id === e.notions.find((n) => n.id === q.notion)?.cours);
const faites = (e: Etat, jour: string, mission: MissionBase) =>
  e.tentatives.filter((t) => t.jour === jour && t.mission === mission).length;
const nouvelles = (e: Etat) => e.questions.filter((q) => !e.revisions[q.id]);
const dues = (e: Etat, jour: string) =>
  Object.values(e.revisions).filter((r) => r.echeance <= jour).length;
export const xpTotal = (e: Etat): number => Object.values(e.jours).reduce((s, j) => s + j.xp, 0);

/** Jours consécutifs actifs ; les gels du mois comblent les trous qui relient deux jours actifs. */
export function serieEtGels(e: Etat, aujourdhui: string): { serie: number; gels: number } {
  const actifs = new Set(
    Object.entries(e.jours)
      .filter(([j, s]) => j <= aujourdhui && (s.reviser || s.decouvrir || s.defi || s.mini))
      .map(([j]) => j),
  );
  if (actifs.size === 0) return { serie: 0, gels: REGLES.gelsParMois };
  const premier = [...actifs].sort()[0];
  const mois = (j: string) => j.slice(0, 7);
  // Une journée pas encore jouée ne casse pas la série.
  let jour = actifs.has(aujourdhui) ? aujourdhui : plusJours(aujourdhui, -1);
  let serie = 0;
  const utilises: string[] = [];
  let trou: string[] = [];
  while (jour >= premier) {
    if (actifs.has(jour)) {
      serie++;
      utilises.push(...trou);
      trou = [];
    } else {
      const pris = [...utilises, ...trou].filter((m) => mois(m) === mois(jour)).length;
      if (pris >= REGLES.gelsParMois) break;
      trou.push(jour);
    }
    jour = plusJours(jour, -1);
  }
  return {
    serie,
    gels: REGLES.gelsParMois - utilises.filter((m) => mois(m) === mois(aujourdhui)).length,
  };
}

/** Une notion est maîtrisée quand toutes ses questions sont en boîte 3 ou plus. */
function maitrisee(e: Etat, notion: string): boolean {
  const qs = e.questions.filter((q) => q.notion === notion);
  return qs.length > 0 && qs.every((q) => (e.revisions[q.id]?.boite ?? 0) >= 3);
}

/** Un bâtiment est posé une fois pour toutes, quand la notion est maîtrisée. */
function batir(e: Etat, notion: string, t: number): void {
  const n = e.notions.find((x) => x.id === notion);
  if (n && !n.batie && maitrisee(e, notion)) n.batie = new Date(t).toISOString();
}

export function missionDuJour(e: Etat, t: number) {
  const jour = jourDe(t);
  const s = e.jours[jour] ?? jourVide();
  const vues = Object.keys(e.revisions).length;
  const { serie, gels } = serieEtGels(e, jour);
  return {
    reviser: {
      questions: Math.min(dues(e, jour), Math.max(REGLES.reviserMax - faites(e, jour, 'reviser'), 0)),
      fait: s.reviser,
    },
    decouvrir: {
      questions: Math.min(
        nouvelles(e).length,
        Math.max(REGLES.decouvrirMax - faites(e, jour, 'decouvrir'), 0),
      ),
      fait: s.decouvrir,
    },
    defi: {
      // Un essai passé sans aucune réponse est perdu : le défi revient le lendemain.
      disponible:
        vues >= REGLES.defiMinVues &&
        (s.defiDebut === null ||
          faites(e, jour, 'defi') > 0 ||
          t <= s.defiDebut + REGLES.defiSecondes * 1000),
      fait: s.defi,
    },
    jour_compte: s.reviser || s.decouvrir || s.defi || s.mini,
    mini_questions: REGLES.miniQuestions,
    xp_jour: s.xp,
    plafond: REGLES.xpPlafond,
    xp_mission: REGLES.xpMission,
    xp_total: xpTotal(e),
    notions_maitrisees: e.notions.filter((n) => maitrisee(e, n.id)).length,
    serie,
    gels,
  };
}

/** Les questions telles que l'écran les montre : sans réponse ni explication. */
export function vues(e: Etat, ids: readonly string[]) {
  return ids.flatMap((id) => {
    const q = e.questions.find((x) => x.id === id);
    if (!q) return [];
    const n = e.notions.find((x) => x.id === q.notion);
    return [
      {
        id: q.id,
        type: q.type,
        enonce: q.enonce,
        presentation: { options: q.options },
        notion: n?.titre ?? '',
        cours: e.cours.find((c) => c.id === n?.cours)?.titre ?? '',
      },
    ];
  });
}

export function questionsMission(e: Etat, mission: MissionBase, t: number) {
  const jour = jourDe(t);
  const reste = (max: number) => Math.max(max - faites(e, jour, mission), 0);
  if (mission === 'reviser') {
    // Un examen à venir passe avant la règle « les plus en retard d'abord ».
    const ids = Object.entries(e.revisions)
      .filter(([, r]) => r.echeance <= jour)
      .map(([id, r]) => {
        const q = e.questions.find((x) => x.id === id);
        const examen = q ? coursDeQuestion(e, q)?.date_examen : null;
        return { id, echeance: r.echeance, prioritaire: !!examen && examen >= jour };
      })
      .sort(
        (a, b) =>
          Number(b.prioritaire) - Number(a.prioritaire) ||
          a.echeance.localeCompare(b.echeance) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, reste(REGLES.reviserMax))
      .map((x) => x.id);
    return { questions: vues(e, ids) };
  }
  if (mission === 'decouvrir') {
    // Dans l'ordre des cours, puis des notions, puis des questions.
    const rang = (q: QuestionBase) => {
      const n = e.notions.find((x) => x.id === q.notion);
      const c = e.cours.find((x) => x.id === n?.cours);
      const pad = (v: number) => String(v).padStart(4, '0');
      return `${c?.cree ?? ''}|${pad(n?.ordre ?? 0)}|${pad(q.ordre)}`;
    };
    const ids = nouvelles(e)
      .sort((a, b) => rang(a).localeCompare(rang(b)))
      .slice(0, reste(REGLES.decouvrirMax))
      .map((q) => q.id);
    return { questions: vues(e, ids) };
  }
  // Défi : le chrono démarre ici et survit à un rechargement de la page. Un essai par jour.
  if (Object.keys(e.revisions).length < REGLES.defiMinVues) return null;
  const s = stats(e, jour);
  s.defiDebut ??= t;
  const fin = s.defiDebut + REGLES.defiSecondes * 1000;
  if (s.defi || t >= fin) return { questions: [], secondes: 0 };
  const dejaVues = new Set(
    e.tentatives.filter((x) => x.jour === jour && x.mission === 'defi').map((x) => x.question),
  );
  const ids = melanger(Object.keys(e.revisions).filter((id) => !dejaVues.has(id))).slice(0, 40);
  return { questions: vues(e, ids), secondes: Math.ceil((fin - t) / 1000) };
}

/**
 * Corrige, fait avancer la révision et attribue l'XP dans la limite du plafond quotidien.
 * Une réponse qui ne compte pas ne renvoie rien d'autre que { compte: false }.
 */
export function repondre(e: Etat, id: string, mission: MissionBase, r: ReponseBase, t: number) {
  const q = e.questions.find((x) => x.id === id);
  if (!q) return { compte: false };
  const jour = jourDe(t);
  const s = stats(e, jour);
  const rev = e.revisions[id];
  const nb = faites(e, jour, mission);
  const compte =
    mission === 'reviser'
      ? !!rev && rev.echeance <= jour && nb < REGLES.reviserMax
      : mission === 'decouvrir'
        ? !rev && nb < REGLES.decouvrirMax
        : !!rev &&
          !s.defi &&
          s.defiDebut !== null &&
          t <= s.defiDebut + (REGLES.defiSecondes + REGLES.defiMargeSecondes) * 1000 &&
          !e.tentatives.some((x) => x.jour === jour && x.mission === 'defi' && x.question === id);
  if (!compte) return { compte: false };

  const juste = reponseJuste(q, r);
  const examen = coursDeQuestion(e, q)?.date_examen ?? null;
  let xp: number;
  let missionFaite = false;
  if (mission === 'reviser') {
    xp = juste ? REGLES.xpDue : 0;
    const boite = juste ? Math.min(rev.boite + 1, REGLES.intervalles.length) : 1;
    e.revisions[id] = {
      boite,
      echeance: prochaineEcheance(jour, REGLES.intervalles[boite - 1], examen),
    };
    missionFaite = !s.reviser && (nb + 1 >= REGLES.reviserMax || dues(e, jour) === 0);
  } else if (mission === 'decouvrir') {
    xp = juste ? REGLES.xpNouvelle : 0;
    e.revisions[id] = { boite: 1, echeance: prochaineEcheance(jour, REGLES.intervalles[0], examen) };
    missionFaite = !s.decouvrir && (nb + 1 >= REGLES.decouvrirMax || nouvelles(e).length === 0);
  } else {
    xp = juste ? REGLES.xpDefi : 0;
  }
  batir(e, q.notion, t);

  xp = Math.min(xp, REGLES.xpPlafond - s.xp);
  const prime = missionFaite ? Math.min(REGLES.xpMission, REGLES.xpPlafond - s.xp - xp) : 0;
  e.tentatives.push({ question: id, mission, juste, xp, jour });
  s.xp += xp + prime;
  if (missionFaite && mission === 'reviser') s.reviser = true;
  if (missionFaite && mission === 'decouvrir') s.decouvrir = true;
  if (mission !== 'defi')
    s.mini ||=
      e.tentatives.filter((x) => x.jour === jour && x.mission !== 'defi').length >=
      REGLES.miniQuestions;

  // Le défi ne montre pas la correction : elle dévoilerait la réponse d'une question à réviser.
  if (mission === 'defi') return { compte: true, juste, xp };
  return {
    compte: true,
    juste,
    xp,
    prime,
    mission_faite: missionFaite,
    reponse: { correctes: q.correctes },
    explication: q.explication,
    extrait: '',
  };
}

/** Fin du défi : il faut avoir répondu à au moins une question, et la prime n'est donnée qu'une fois. */
export function terminerDefi(e: Etat, t: number) {
  const jour = jourDe(t);
  const s = stats(e, jour);
  const defi = e.tentatives.filter((x) => x.jour === jour && x.mission === 'defi');
  let prime = 0;
  if (!s.defi && defi.length > 0) {
    prime = Math.min(REGLES.xpMission, REGLES.xpPlafond - s.xp);
    s.defi = true;
    s.xp += prime;
  }
  return {
    prime,
    justes: defi.filter((x) => x.juste).length,
    total: defi.length,
    xp: defi.reduce((n, x) => n + x.xp, 0),
  };
}

/** Un quartier par cours, dans l'ordre de création, avec l'état de chaque notion. */
export function maVille(e: Etat, t: number) {
  const jour = jourDe(t);
  return [...e.cours]
    .sort((a, b) => a.cree.localeCompare(b.cree) || a.id.localeCompare(b.id))
    .map((c) => ({
      id: c.id,
      titre: c.titre,
      notions: e.notions
        .filter((n) => n.cours === c.id)
        .sort((a, b) => a.ordre - b.ordre)
        .map((n) => {
          const revs = e.questions
            .filter((q) => q.notion === n.id)
            .map((q) => e.revisions[q.id])
            .filter(Boolean);
          const etat: 'batie' | 'chantier' | 'vide' = n.batie
            ? 'batie'
            : revs.length > 0
              ? 'chantier'
              : 'vide';
          return {
            id: n.id,
            titre: n.titre,
            ordre: n.ordre,
            etat,
            due: revs.some((r) => r.echeance <= jour),
            recent: !!n.batie && t - Date.parse(n.batie) < 86_400_000,
          };
        }),
    }));
}

/** Date d'examen : les questions prévues trop tard reviennent aussitôt à la bonne distance. */
export function fixerExamen(e: Etat, cours: string, date: string | null, t: number): boolean {
  const jour = jourDe(t);
  const c = e.cours.find((x) => x.id === cours);
  if (!c || (date !== null && (date < jour || date > plusJours(jour, 365)))) return false;
  c.date_examen = date;
  if (date === null) return true;
  for (const q of questionsDuCours(e, cours)) {
    const r = e.revisions[q.id];
    if (!r) continue;
    const plusTot = prochaineEcheance(jour, REGLES.intervalles[r.boite - 1], date);
    if (plusTot < r.echeance) r.echeance = plusTot;
  }
  return true;
}

function noter(e: Etat, x: ExamenBase): Score {
  const parNotion = new Map<string, { titre: string; ordre: number; justes: number; total: number }>();
  for (const id of x.questions) {
    const q = e.questions.find((y) => y.id === id);
    const n = q && e.notions.find((y) => y.id === q.notion);
    if (!q || !n) continue;
    const ligne = parNotion.get(n.id) ?? { titre: n.titre, ordre: n.ordre, justes: 0, total: 0 };
    ligne.total++;
    if (reponseJuste(q, x.reponses[id])) ligne.justes++;
    parNotion.set(n.id, ligne);
  }
  const notions = [...parNotion.values()]
    .sort((a, b) => a.ordre - b.ordre)
    .map(({ titre, justes, total }) => ({ titre, justes, total }));
  return {
    justes: notions.reduce((s, n) => s + n.justes, 0),
    total: notions.reduce((s, n) => s + n.total, 0),
    notions,
  };
}

export function rendreExamen(e: Etat, id: string): Score | null {
  const x = e.examens.find((y) => y.id === id);
  if (!x) return null;
  return (x.score ??= noter(e, x));
}

/** Un examen blanc par cours et par jour ; rouvrir la page reprend le même. */
export function demarrerExamen(e: Etat, cours: string, t: number) {
  const jour = jourDe(t);
  let x = e.examens.find((y) => y.cours === cours && y.jour === jour);
  if (!x) {
    const questions = melanger(questionsDuCours(e, cours).map((q) => q.id)).slice(
      0,
      REGLES.examenQuestions,
    );
    if (questions.length === 0) return null;
    x = {
      id: nouvelId(),
      cours,
      jour,
      questions,
      fin: t + questions.length * REGLES.examenSecondesParQuestion * 1000,
      reponses: {},
      score: null,
    };
    e.examens.push(x);
  }
  if (x.score || t >= x.fin) return { id: x.id, score: rendreExamen(e, x.id) ?? undefined };
  const reponses = x.reponses;
  return {
    id: x.id,
    total: x.questions.length,
    questions: vues(
      e,
      x.questions.filter((q) => !(q in reponses)),
    ),
    secondes: Math.ceil((x.fin - t) / 1000),
  };
}

export function repondreExamen(e: Etat, id: string, q: string, r: ReponseBase, t: number): boolean {
  const x = e.examens.find((y) => y.id === id);
  if (!x || x.score || !x.questions.includes(q) || t > x.fin + REGLES.defiMargeSecondes * 1000)
    return false;
  x.reponses[q] = r;
  return true;
}

/** La notion la moins réussie de l'examen : ses questions ratées reviennent aujourd'hui. */
export function reviserNotionFaible(e: Etat, id: string, t: number) {
  const x = e.examens.find((y) => y.id === id);
  if (!x?.score) return null;
  const jour = jourDe(t);
  const posees = x.questions
    .map((qid) => e.questions.find((q) => q.id === qid))
    .filter((q): q is QuestionBase => !!q);
  const ratees = posees.filter((q) => !reponseJuste(q, x.reponses[q.id]));
  const taux = (notion: string) => {
    const qs = posees.filter((q) => q.notion === notion);
    return qs.filter((q) => reponseJuste(q, x.reponses[q.id])).length / qs.length;
  };
  const notion = [...new Set(ratees.map((q) => q.notion))]
    .map((nid) => e.notions.find((n) => n.id === nid))
    .filter((n): n is NotionBase => !!n)
    .sort((a, b) => taux(a.id) - taux(b.id) || a.ordre - b.ordre)[0];
  if (!notion) return { notion: null, questions: 0 };
  let questions = 0;
  for (const q of ratees.filter((y) => y.notion === notion.id)) {
    const r = e.revisions[q.id];
    if (!r) continue;
    if (r.echeance > jour) r.echeance = jour;
    questions++;
  }
  return { notion: notion.titre, questions };
}

export type QuestionEnvoyee =
  | { enonce: string; explication: string | null; vrai: boolean }
  | { enonce: string; explication: string | null; choix: { texte: string; correcte: boolean }[] };
export interface NotionEnvoyee {
  titre: string;
  a_retenir: string;
  questions: QuestionEnvoyee[];
}

/** Crée un cours (cours nul) ou lui ajoute des notions. Les choix sont mélangés. */
export function ecrireCours(
  e: Etat,
  cours: string | null,
  titre: string | null,
  notions: readonly NotionEnvoyee[],
  t: number,
): string | null {
  let id = cours;
  if (id === null) {
    if (!titre?.trim()) return null;
    id = nouvelId();
    e.cours.push({ id, titre: titre.trim(), cree: new Date(t).toISOString(), date_examen: null });
  } else if (!e.cours.some((c) => c.id === id)) return null;
  const coursId = id;
  let ordre = e.notions.filter((n) => n.cours === coursId).reduce((m, n) => Math.max(m, n.ordre + 1), 0);
  for (const n of notions) {
    const notion = nouvelId();
    e.notions.push({
      id: notion,
      cours: coursId,
      titre: n.titre,
      ordre: ordre++,
      recto: n.titre,
      verso: n.a_retenir,
      batie: null,
    });
    n.questions.forEach((q, i) => {
      const base = { id: nouvelId(), notion, enonce: q.enonce, explication: q.explication ?? '', ordre: i };
      if ('vrai' in q) {
        e.questions.push({ ...base, type: 'vrai_faux', options: ['Vrai', 'Faux'], correctes: [q.vrai ? 0 : 1] });
        return;
      }
      const choix = melanger(q.choix);
      const correctes = choix.flatMap((c, j) => (c.correcte ? [j] : []));
      e.questions.push({
        ...base,
        type: correctes.length === 1 ? 'unique' : 'multiple',
        options: choix.map((c) => c.texte),
        correctes,
      });
    });
  }
  return coursId;
}

export function supprimerQuestion(e: Etat, id: string): void {
  e.questions = e.questions.filter((q) => q.id !== id);
  delete e.revisions[id];
}

export function supprimerCours(e: Etat, id: string): void {
  for (const q of questionsDuCours(e, id)) delete e.revisions[q.id];
  const notions = new Set(e.notions.filter((n) => n.cours === id).map((n) => n.id));
  e.questions = e.questions.filter((q) => !notions.has(q.notion));
  e.notions = e.notions.filter((n) => n.cours !== id);
  e.cours = e.cours.filter((c) => c.id !== id);
  e.examens = e.examens.filter((x) => x.cours !== id);
}
