import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallRecord } from "./claude.ts";
import { renderReport, summarize } from "./report.ts";
import type { Entree, Verdict } from "./review.ts";
import type { Resultat } from "./run.ts";

const appel = (dureeS: number, repli = false): CallRecord => ({
  dureeMs: dureeS * 1000,
  stopReason: "end_turn",
  categorieRefus: null,
  repli,
  tokensEntree: 1,
  tokensSortie: 1,
  tokensReflexion: 0,
  coutUsd: 0,
});

const resultat = (changes: Partial<Resultat>): Resultat => ({
  cours: "a",
  modele: "haiku",
  format: "pdf",
  statut: "pret",
  raison: null,
  transcription: appel(100),
  generation: appel(200),
  texte: "t",
  coutUsd: 1,
  filtre: { notions: [], totales: 40, retenues: 30, rejets: { extrait: 10, forme: 0 }, statut: "pret" },
  ...changes,
});

const entree = (id: string, format: Entree["format"], modele = "haiku"): Entree => ({
  id,
  cours: "a",
  modele,
  format,
  notion: "N",
  question: {} as Entree["question"],
});

const cours = [
  { id: "a", matiere: "SVT", pages: 10 },
  { id: "b", matiere: "Histoire", pages: 30 },
];

test("le coût pour 10 pages compte toute la dépense, échecs compris", () => {
  const [l] = summarize(cours, [resultat({ coutUsd: 1 }), resultat({ cours: "b", statut: "echec", coutUsd: 3, filtre: null })], [], {});
  assert.equal(l.coutPour10Pages, 1);
  assert.equal(l.reussis, 1);
  assert.equal(l.imports, 2);
  assert.equal(l.coutMaxCours, 3);
});

test("les durées sont comparées aux limites de Supabase, appel par appel", () => {
  const [l] = summarize(cours, [resultat({ transcription: appel(100, true), generation: appel(500) })], [], {});
  assert.equal(l.dureeMedianeS, 300);
  assert.equal(l.dureeMaxS, 500);
  assert.equal(l.au150, 1);
  assert.equal(l.au400, 1);
  assert.equal(l.replis, 1);
});

test("les extraits rejetés sont rapportés aux questions générées", () => {
  assert.equal(summarize(cours, [resultat({})], [], {})[0].extraitsRejetes, 0.25);
});

test("les questions fausses sont comptées par modèle et par format, et le seuil est appliqué", () => {
  const entrees = [entree("q1", "pdf"), entree("q2", "photos"), entree("q3", "photos"), entree("q4", "pdf", "opus")];
  const verdicts: Record<string, Verdict> = {
    q1: { juste: true },
    q2: { juste: false, cause: "transcription" },
    q3: { juste: true },
    q4: { juste: false },
  };
  const [l] = summarize(cours, [resultat({})], entrees, verdicts);
  assert.deepEqual(l.total, { relues: 3, fausses: 1 });
  assert.deepEqual(l.pdf, { relues: 1, fausses: 0 });
  assert.deepEqual(l.photos, { relues: 2, fausses: 1 });
  assert.equal(l.causeTranscription, 1);
  assert.equal(l.seuilRespecte, false);
});

test("sans relecture, le seuil reste non déterminé", () => {
  const lignes = summarize(cours, [resultat({})], [], {});
  assert.equal(lignes[0].seuilRespecte, null);
  assert.match(renderReport(lignes), /Seuil de 5 % respecté \| n\/d/);
});

test("le rapport a une colonne par modèle testé", () => {
  const rapport = renderReport(summarize(cours, [resultat({}), resultat({ modele: "opus" })], [], {}));
  assert.match(rapport, /\| Mesure \| opus \| haiku \|/);
  assert.match(rapport, /Coût pour 10 pages \| 1\.000 \$ \| 1\.000 \$/);
});
