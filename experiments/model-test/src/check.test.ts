import assert from "node:assert/strict";
import { test } from "node:test";
import { filterGeneration, normalize } from "./check.ts";
import type { Generation, Question } from "./schema.ts";

const COURS = "La mitochondrie produit l’énergie de la cellule.\nElle possède  sa propre membrane interne.";

const question = (changes: Partial<Question> = {}): Question => ({
  type: "unique",
  enonce: "Que produit la mitochondrie ?",
  explication: "Le cours le dit.",
  extrait: "La mitochondrie produit l'énergie de la cellule.",
  difficulte: "facile",
  options: [
    { texte: "De l'énergie", correcte: true },
    { texte: "De l'ADN", correcte: false },
  ],
  paires: [],
  etapes: [],
  ...changes,
});

const generation = (...lots: Question[][]): Generation => ({
  notions: lots.map((questions, i) => ({ titre: `Notion ${i}`, questions, carte: { recto: "r", verso: "v" } })),
});

test("normalize ignore la casse, les espaces et les apostrophes typographiques", () => {
  assert.equal(normalize("  L’Énergie\n de   la  CELLULE "), "l'énergie de la cellule");
});

test("normalize ignore les espaces parasites des PDF autour des apostrophes et des traits d'union", () => {
  assert.equal(normalize("molécules d' ADN"), normalize("molécules d'ADN"));
  assert.equal(normalize("c'est- à-dire"), normalize("c'est-à-dire"));
});

test("un extrait présent malgré les différences de forme est retenu", () => {
  const f = filterGeneration(generation([question()]), COURS);
  assert.equal(f.retenues, 1);
  assert.deepEqual(f.rejets, { extrait: 0, forme: 0 });
});

test("un extrait réparti sur un retour à la ligne est retenu", () => {
  const f = filterGeneration(generation([question({ extrait: "de la cellule. Elle possède sa propre membrane" })]), COURS);
  assert.equal(f.retenues, 1);
});

test("un extrait absent ou trop court est rejeté", () => {
  const f = filterGeneration(
    generation([question({ extrait: "La mitochondrie stocke l'ADN du noyau." }), question({ extrait: "cellule" })]),
    COURS,
  );
  assert.equal(f.retenues, 0);
  assert.equal(f.rejets.extrait, 2);
});

test("une question mal formée est rejetée pour chaque type", () => {
  const ok = { texte: "a", correcte: true };
  const non = { texte: "b", correcte: false };
  const invalides = [
    question({ options: [ok, ok] }),
    question({ type: "multiple", options: [non, non] }),
    question({ type: "vrai_faux", options: [ok, non, non] }),
    question({ type: "association", options: [], paires: [{ gauche: "a", droite: "b" }] }),
    question({ type: "classement", options: [], etapes: ["a", "a"] }),
    question({ enonce: " " }),
  ];
  const f = filterGeneration(generation(invalides), COURS);
  assert.equal(f.retenues, 0);
  assert.equal(f.rejets.forme, invalides.length);
});

test("une question de chaque type bien formée est retenue", () => {
  const ok = { texte: "a", correcte: true };
  const non = { texte: "b", correcte: false };
  const valides = [
    question(),
    question({ type: "multiple", options: [ok, ok, non] }),
    question({ type: "vrai_faux", options: [ok, non] }),
    question({ type: "association", options: [], paires: [{ gauche: "a", droite: "1" }, { gauche: "b", droite: "2" }] }),
    question({ type: "classement", options: [], etapes: ["a", "b"] }),
  ];
  assert.equal(filterGeneration(generation(valides), COURS).retenues, valides.length);
});

test("une notion sans question restante est écartée", () => {
  const f = filterGeneration(generation([question()], [question({ extrait: "absent du cours, vraiment" })]), COURS);
  assert.equal(f.notions.length, 1);
  assert.equal(f.totales, 2);
});

test("moins de 10 questions retenues donne un échec, 10 donnent pret", () => {
  const dix = Array.from({ length: 10 }, () => question());
  assert.equal(filterGeneration(generation(dix), COURS).statut, "pret");
  assert.equal(filterGeneration(generation(dix.slice(1)), COURS).statut, "echec");
});
