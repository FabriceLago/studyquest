import type { Generation, Question } from "./schema.ts";

const MIN_EXTRAIT = 15;
const MIN_QUESTIONS = 10;

export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’ʼ‘]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isWellFormed(q: Question): boolean {
  if (!q.enonce.trim() || !q.explication.trim()) return false;
  const correctes = q.options.filter((o) => o.correcte).length;
  switch (q.type) {
    case "unique":
      return q.options.length >= 2 && correctes === 1;
    case "multiple":
      return q.options.length >= 2 && correctes >= 1;
    case "vrai_faux":
      return q.options.length === 2 && correctes === 1;
    case "association":
      return q.paires.length >= 2 && new Set(q.paires.map((p) => p.gauche)).size === q.paires.length;
    case "classement":
      return q.etapes.length >= 2 && new Set(q.etapes).size === q.etapes.length;
  }
}

export interface Filtered {
  notions: Generation["notions"];
  totales: number;
  retenues: number;
  rejets: { extrait: number; forme: number };
  statut: "pret" | "echec";
}

export function filterGeneration(generation: Generation, texte: string): Filtered {
  const source = normalize(texte);
  const rejets = { extrait: 0, forme: 0 };
  const keep = (q: Question): boolean => {
    if (!isWellFormed(q)) {
      rejets.forme++;
      return false;
    }
    const extrait = normalize(q.extrait);
    if (extrait.length < MIN_EXTRAIT || !source.includes(extrait)) {
      rejets.extrait++;
      return false;
    }
    return true;
  };
  const notions = generation.notions
    .map((n) => ({ ...n, questions: n.questions.filter(keep) }))
    .filter((n) => n.questions.length > 0);
  const totales = generation.notions.reduce((sum, n) => sum + n.questions.length, 0);
  const retenues = notions.reduce((sum, n) => sum + n.questions.length, 0);
  return { notions, totales, retenues, rejets, statut: retenues >= MIN_QUESTIONS ? "pret" : "echec" };
}
