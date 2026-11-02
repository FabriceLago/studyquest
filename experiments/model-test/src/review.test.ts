import assert from "node:assert/strict";
import { test } from "node:test";
import { pickForControl, renderEntree, sample, type Entree, type Verdict } from "./review.ts";
import type { Resultat } from "./run.ts";
import type { Question } from "./schema.ts";

const question = (enonce: string): Question => ({
  type: "vrai_faux",
  enonce,
  explication: "e",
  extrait: "x",
  difficulte: "facile",
  options: [
    { texte: "Vrai", correcte: true },
    { texte: "Faux", correcte: false },
  ],
  paires: [],
  etapes: [],
});

const resultat = (cours: string, modele: Resultat["modele"], n: number, statut: Resultat["statut"] = "pret"): Resultat => ({
  cours,
  modele,
  format: "pdf",
  statut,
  raison: null,
  transcription: null,
  generation: null,
  texte: null,
  coutUsd: 0,
  filtre: {
    notions: [
      { titre: "N", questions: Array.from({ length: n }, (_, i) => question(`${cours}-${modele}-${i}`)), carte: { recto: "r", verso: "v" } },
    ],
    totales: n,
    retenues: n,
    rejets: { extrait: 0, forme: 0 },
    statut: "pret",
  },
});

test("le tirage prend au plus 15 questions par couple, ignore les échecs et reste identique", () => {
  const resultats = [resultat("a", "haiku", 20), resultat("a", "opus", 5), resultat("b", "haiku", 20, "echec")];
  const entrees = sample(resultats);
  assert.equal(entrees.filter((e) => e.modele === "haiku").length, 15);
  assert.equal(entrees.filter((e) => e.modele === "opus").length, 5);
  assert.equal(entrees.filter((e) => e.cours === "b").length, 0);
  assert.deepEqual(entrees, sample(resultats));
  assert.equal(new Set(entrees.map((e) => e.id)).size, entrees.length);
});

test("les modèles sont mélangés et les identifiants ne les trahissent pas", () => {
  const modeles = sample([resultat("a", "haiku", 15), resultat("a", "opus", 15)]).map((e) => e.modele);
  assert.notDeepEqual(modeles.slice(0, 15), Array(15).fill(modeles[0]));
});

test("le rendu n'affiche jamais le modèle", () => {
  const e: Entree = { id: "q001", cours: "a", modele: "claude-opus-5-5", format: "pdf", notion: "N", question: question("Énoncé") };
  const texte = renderEntree(e);
  assert.match(texte, /q001/);
  assert.match(texte, /\[x\] Vrai/);
  assert.doesNotMatch(texte, /opus/);
});

test("le contrôle prend toutes les fausses et n justes", () => {
  const entrees = sample([resultat("a", "haiku", 15)]);
  const verdicts: Record<string, Verdict> = Object.fromEntries(entrees.map((e, i) => [e.id, { juste: i >= 2 }]));
  const choisies = pickForControl(entrees, verdicts, 5);
  assert.equal(choisies.length, 7);
  assert.equal(choisies.filter((e) => !verdicts[e.id].juste).length, 2);
});
