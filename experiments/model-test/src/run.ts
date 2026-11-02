import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";
import { filterGeneration, type Filtered } from "./check.ts";
import type { ApiResult, Bloc, CallRecord } from "./claude.ts";
import { MODELS, type ModelKey } from "./cost.ts";
import { Generation } from "./schema.ts";

export interface Cours {
  id: string;
  matiere: string;
  pages: number;
}

export interface Api {
  transcribe(key: ModelKey, blocs: Bloc[]): Promise<ApiResult>;
  generate(key: ModelKey, texte: string): Promise<ApiResult>;
}

export type Format = "pdf" | "photos";

export interface Resultat {
  cours: string;
  modele: ModelKey;
  format: Format;
  statut: "pret" | "echec" | "refus" | "coupe" | "erreur";
  raison: string | null;
  transcription: CallRecord | null;
  generation: CallRecord | null;
  texte: string | null;
  filtre: Filtered | null;
  coutUsd: number;
}

const PDF_MAX_OCTETS = 20 * 1024 * 1024;
const PHOTOS_MAX = 30;
const IMAGES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function loadCourse(dossier: string, id: string): Promise<{ format: Format; blocs: Bloc[] }> {
  const pdf = join(dossier, `${id}.pdf`);
  if (existsSync(pdf)) {
    if ((await stat(pdf)).size > PDF_MAX_OCTETS) throw new Error(`PDF de plus de 20 Mo : ${id}`);
    const data = (await readFile(pdf)).toString("base64");
    return { format: "pdf", blocs: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }] };
  }
  const photos = join(dossier, id);
  if (!existsSync(photos)) throw new Error(`Cours introuvable : ${id}`);
  const fichiers = (await readdir(photos)).filter((f) => extname(f).toLowerCase() in IMAGES).sort();
  if (fichiers.length === 0 || fichiers.length > PHOTOS_MAX) {
    throw new Error(`Il faut de 1 à ${PHOTOS_MAX} photos : ${id} en a ${fichiers.length}`);
  }
  const blocs = await Promise.all(
    fichiers.map(async (f): Promise<Bloc> => ({
      type: "image",
      source: {
        type: "base64",
        media_type: IMAGES[extname(f).toLowerCase()],
        data: (await readFile(join(photos, f))).toString("base64"),
      },
    })),
  );
  return { format: "photos", blocs };
}

function arret(appel: CallRecord): { statut: "refus" | "coupe"; raison: string } | null {
  if (appel.stopReason === "refusal") return { statut: "refus", raison: `Refus : ${appel.categorieRefus ?? "sans catégorie"}` };
  if (appel.stopReason === "max_tokens") return { statut: "coupe", raison: "Limite de tokens atteinte" };
  return null;
}

export async function processCourse(id: string, key: ModelKey, format: Format, blocs: Bloc[], api: Api): Promise<Resultat> {
  const r: Resultat = {
    cours: id,
    modele: key,
    format,
    statut: "erreur",
    raison: null,
    transcription: null,
    generation: null,
    texte: null,
    filtre: null,
    coutUsd: 0,
  };
  const fin = (changes: Partial<Resultat>): Resultat => ({
    ...r,
    ...changes,
    coutUsd: (r.transcription?.coutUsd ?? 0) + (r.generation?.coutUsd ?? 0),
  });
  try {
    const transcription = await api.transcribe(key, blocs);
    r.transcription = transcription.appel;
    const stopT = arret(transcription.appel);
    if (stopT) return fin(stopT);
    r.texte = transcription.texte;

    const generation = await api.generate(key, transcription.texte);
    r.generation = generation.appel;
    const stopG = arret(generation.appel);
    if (stopG) return fin(stopG);

    let lu: unknown;
    try {
      lu = JSON.parse(generation.texte);
    } catch {
      return fin({ statut: "echec", raison: "Réponse non JSON" });
    }
    const parsed = Generation.safeParse(lu);
    if (!parsed.success) return fin({ statut: "echec", raison: "JSON non conforme au schéma" });

    const filtre = filterGeneration(parsed.data, transcription.texte);
    return fin({ statut: filtre.statut, filtre, raison: filtre.statut === "echec" ? "Moins de 10 questions retenues" : null });
  } catch (e) {
    // Une clé invalide doit tout arrêter : inutile de répéter l'erreur sur chaque cours.
    if (e instanceof Anthropic.AuthenticationError) throw e;
    if (e instanceof Anthropic.APIError) return fin({ statut: "erreur", raison: `${e.status} ${e.message}` });
    throw e;
  }
}

export async function readResults(dossier: string): Promise<Resultat[]> {
  if (!existsSync(dossier)) return [];
  const fichiers = (await readdir(dossier, { recursive: true })).filter((f) => f.endsWith(".json"));
  return Promise.all(fichiers.map(async (f) => JSON.parse(await readFile(join(dossier, f), "utf8")) as Resultat));
}

export async function runAll(options: {
  dossierCours: string;
  dossierResultats: string;
  cours: readonly Pick<Cours, "id">[];
  modeles: readonly ModelKey[];
  budgetUsd: number;
  api: Api;
  log?: (message: string) => void;
}): Promise<{ arretBudget: boolean; depense: number }> {
  const { dossierCours, dossierResultats, cours, modeles, budgetUsd, api, log = () => {} } = options;
  // Tout vérifier avant la première dépense.
  for (const c of cours) await loadCourse(dossierCours, c.id);

  const depense = async () => (await readResults(dossierResultats)).reduce((sum, r) => sum + r.coutUsd, 0);
  for (const c of cours) {
    const total = await depense();
    if (total >= budgetUsd) {
      log(`Budget atteint : ${total.toFixed(2)} $ sur ${budgetUsd} $. Arrêt avant ${c.id}.`);
      return { arretBudget: true, depense: total };
    }
    const { format, blocs } = await loadCourse(dossierCours, c.id);
    await mkdir(join(dossierResultats, c.id), { recursive: true });
    await Promise.all(
      modeles.map(async (key) => {
        const fichier = join(dossierResultats, c.id, `${key}.json`);
        if (existsSync(fichier) && (JSON.parse(await readFile(fichier, "utf8")) as Resultat).statut !== "erreur") {
          log(`${c.id} / ${key} : déjà fait`);
          return;
        }
        const r = await processCourse(c.id, key, format, blocs, api);
        await writeFile(fichier, JSON.stringify(r, null, 2));
        log(`${c.id} / ${key} : ${r.statut}, ${r.coutUsd.toFixed(3)} $${r.raison ? ` (${r.raison})` : ""}`);
      }),
    );
  }
  return { arretBudget: false, depense: await depense() };
}

export async function readManifest(dossier: string): Promise<Cours[]> {
  return JSON.parse(await readFile(join(dossier, "cours.json"), "utf8")) as Cours[];
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      cours: { type: "string" },
      modeles: { type: "string", default: Object.keys(MODELS).join(",") },
      budget: { type: "string" },
    },
  });
  if (!values.budget) throw new Error("Indique le budget maximum, par exemple --budget 15");
  const tous = await readManifest("cours");
  const choisis = values.cours?.split(",");
  const api = await import("./claude.ts");
  const { arretBudget, depense } = await runAll({
    dossierCours: "cours",
    dossierResultats: "resultats",
    cours: choisis ? tous.filter((c) => choisis.includes(c.id)) : tous,
    modeles: values.modeles.split(",") as ModelKey[],
    budgetUsd: Number(values.budget),
    api,
    log: console.log,
  });
  console.log(`${arretBudget ? "Arrêté" : "Terminé"} : ${depense.toFixed(2)} $ dépensés au total.`);
}
