import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ApiResult, CallRecord } from "./claude.ts";
import { loadCourse, processCourse, runAll, type Api } from "./run.ts";

const TEXTE = "La mitochondrie produit l'énergie de la cellule.";

const appel = (changes: Partial<CallRecord> = {}): CallRecord => ({
  dureeMs: 1000,
  stopReason: "end_turn",
  categorieRefus: null,
  repli: false,
  tokensEntree: 100,
  tokensSortie: 100,
  tokensReflexion: 0,
  coutUsd: 1,
  ...changes,
});

const questions = Array.from({ length: 10 }, () => ({
  type: "vrai_faux",
  enonce: "La mitochondrie produit-elle de l'énergie ?",
  explication: "Le cours le dit.",
  extrait: TEXTE,
  difficulte: "facile",
  options: [
    { texte: "Vrai", correcte: true },
    { texte: "Faux", correcte: false },
  ],
  paires: [],
  etapes: [],
}));
const JSON_OK = JSON.stringify({ notions: [{ titre: "Énergie", questions, carte: { recto: "r", verso: "v" } }] });

const api = (transcription: Partial<ApiResult> = {}, generation: Partial<ApiResult> = {}): Api => ({
  transcribe: async () => ({ texte: TEXTE, appel: appel(), ...transcription }),
  generate: async () => ({ texte: JSON_OK, appel: appel(), ...generation }),
});

const run = (a: Api) => processCourse("c1", "haiku", "pdf", [], a);

test("un cours valide donne pret et additionne le coût des deux appels", async () => {
  const r = await run(api());
  assert.equal(r.statut, "pret");
  assert.equal(r.filtre?.retenues, 10);
  assert.equal(r.coutUsd, 2);
});

test("un refus à la transcription s'arrête sans génération", async () => {
  let generations = 0;
  const a = api({ appel: appel({ stopReason: "refusal", categorieRefus: "bio" }) });
  const r = await run({ ...a, generate: async (k, t) => (generations++, a.generate(k, t)) });
  assert.equal(r.statut, "refus");
  assert.match(r.raison ?? "", /bio/);
  assert.equal(generations, 0);
  assert.equal(r.coutUsd, 1);
});

test("une génération coupée par la limite de tokens donne coupe", async () => {
  assert.equal((await run(api({}, { appel: appel({ stopReason: "max_tokens" }) }))).statut, "coupe");
});

test("une réponse non JSON ou hors schéma donne un échec", async () => {
  assert.equal((await run(api({}, { texte: "pas du json" }))).statut, "echec");
  assert.equal((await run(api({}, { texte: '{"notions":"non"}' }))).statut, "echec");
});

test("trop peu de questions retenues donne un échec", async () => {
  const peu = JSON.stringify({ notions: [{ titre: "E", questions: questions.slice(0, 9), carte: { recto: "r", verso: "v" } }] });
  assert.equal((await run(api({}, { texte: peu }))).statut, "echec");
});

test("une erreur d'API est enregistrée, une clé invalide arrête tout", async () => {
  const erreur = (e: Error): Api => ({ ...api(), transcribe: async () => Promise.reject(e) });
  const corps = { error: { message: "x" } };
  const r = await run(erreur(new Anthropic.BadRequestError(400, corps, "x", new Headers())));
  assert.equal(r.statut, "erreur");
  assert.match(r.raison ?? "", /400/);
  await assert.rejects(
    run(erreur(new Anthropic.AuthenticationError(401, corps, "x", new Headers()))),
    Anthropic.AuthenticationError,
  );
});

async function dossierCours(...ids: string[]): Promise<{ cours: string; resultats: string }> {
  const racine = await mkdtemp(join(tmpdir(), "model-test-"));
  const cours = join(racine, "cours");
  await mkdir(cours);
  await Promise.all(ids.map((id) => writeFile(join(cours, `${id}.pdf`), "%PDF")));
  return { cours, resultats: join(racine, "resultats") };
}

test("loadCourse lit un PDF ou un dossier de photos triées, et refuse le reste", async () => {
  const { cours } = await dossierCours("a");
  assert.equal((await loadCourse(cours, "a")).format, "pdf");

  await mkdir(join(cours, "b"));
  await writeFile(join(cours, "b", "2.jpg"), "deux");
  await writeFile(join(cours, "b", "1.PNG"), "un");
  await writeFile(join(cours, "b", "note.txt"), "ignoré");
  const b = await loadCourse(cours, "b");
  assert.equal(b.format, "photos");
  assert.deepEqual(
    b.blocs.map((bloc) => (bloc.type === "image" && bloc.source.type === "base64" ? bloc.source.media_type : "")),
    ["image/png", "image/jpeg"],
  );

  await assert.rejects(loadCourse(cours, "absent"), /introuvable/);
  await mkdir(join(cours, "vide"));
  await assert.rejects(loadCourse(cours, "vide"), /photos/);
});

test("runAll vérifie tous les cours avant de dépenser", async () => {
  const { cours, resultats } = await dossierCours("a");
  let appels = 0;
  const compteur: Api = { ...api(), transcribe: async (k, b) => (appels++, api().transcribe(k, b)) };
  await assert.rejects(
    runAll({ dossierCours: cours, dossierResultats: resultats, cours: [{ id: "a" }, { id: "absent" }], modeles: ["haiku"], budgetUsd: 100, api: compteur }),
    /introuvable/,
  );
  assert.equal(appels, 0);
});

test("runAll s'arrête quand le budget est atteint", async () => {
  const { cours, resultats } = await dossierCours("a", "b", "c");
  const fin = await runAll({
    dossierCours: cours,
    dossierResultats: resultats,
    cours: [{ id: "a" }, { id: "b" }, { id: "c" }],
    modeles: ["haiku"],
    budgetUsd: 4,
    api: api(),
  });
  assert.deepEqual(fin, { arretBudget: true, depense: 4 });
});

test("runAll reprend sans refaire un cours terminé, et refait une erreur", async () => {
  const { cours, resultats } = await dossierCours("a");
  const options = { dossierCours: cours, dossierResultats: resultats, cours: [{ id: "a" }], modeles: ["haiku", "opus"] as const, budgetUsd: 100 };
  await runAll({ ...options, api: api() });

  const fichier = join(resultats, "a", "opus.json");
  const r = JSON.parse(await readFile(fichier, "utf8"));
  await writeFile(fichier, JSON.stringify({ ...r, statut: "erreur", coutUsd: 0 }));

  const refaits: string[] = [];
  await runAll({ ...options, api: { ...api(), transcribe: async (k, b) => (refaits.push(k), api().transcribe(k, b)) } });
  assert.deepEqual(refaits, ["opus"]);
});
