import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CallRecord } from "./claude.ts";
import { MODELS, type ModelKey } from "./cost.ts";
import type { Entree, Verdict } from "./review.ts";
import { readManifest, readResults, type Cours, type Resultat } from "./run.ts";

const SEUIL_FAUSSES = 0.05;
const LIMITE_GRATUIT_S = 150;
const LIMITE_PAYANT_S = 400;

export interface Taux {
  fausses: number;
  relues: number;
}

export interface Ligne {
  modele: ModelKey;
  imports: number;
  reussis: number;
  refus: number;
  replis: number;
  coutPour10Pages: number | null;
  coutMaxCours: number;
  dureeMedianeS: number | null;
  dureeMaxS: number | null;
  au150: number;
  au400: number;
  extraitsRejetes: number | null;
  total: Taux;
  pdf: Taux;
  photos: Taux;
  causeTranscription: number;
  seuilRespecte: boolean | null;
}

const taux = (t: Taux) => (t.relues === 0 ? null : t.fausses / t.relues);

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const tri = [...values].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 === 1 ? tri[milieu] : (tri[milieu - 1] + tri[milieu]) / 2;
}

export function summarize(
  cours: readonly Cours[],
  resultats: readonly Resultat[],
  entrees: readonly Entree[],
  verdicts: Record<string, Verdict>,
): Ligne[] {
  const pages = new Map(cours.map((c) => [c.id, c.pages]));
  return (Object.keys(MODELS) as ModelKey[]).flatMap((modele) => {
    const lignes = resultats.filter((r) => r.modele === modele);
    if (lignes.length === 0) return [];
    const appels = lignes.flatMap((r) => [r.transcription, r.generation]).filter((a): a is CallRecord => a !== null);
    const dureesS = appels.map((a) => a.dureeMs / 1000);
    const pagesTotal = lignes.reduce((sum, r) => sum + (pages.get(r.cours) ?? 0), 0);
    const coutTotal = lignes.reduce((sum, r) => sum + r.coutUsd, 0);
    const totales = lignes.reduce((sum, r) => sum + (r.filtre?.totales ?? 0), 0);
    const rejetees = lignes.reduce((sum, r) => sum + (r.filtre?.rejets.extrait ?? 0), 0);

    const relues = entrees.filter((e) => e.modele === modele && verdicts[e.id]);
    const compte = (subset: readonly Entree[]): Taux => ({
      relues: subset.length,
      fausses: subset.filter((e) => !verdicts[e.id].juste).length,
    });
    const total = compte(relues);
    const tauxTotal = taux(total);

    return [
      {
        modele,
        imports: lignes.length,
        reussis: lignes.filter((r) => r.statut === "pret").length,
        refus: lignes.filter((r) => r.statut === "refus").length,
        replis: appels.filter((a) => a.repli).length,
        coutPour10Pages: pagesTotal === 0 ? null : (coutTotal / pagesTotal) * 10,
        coutMaxCours: Math.max(...lignes.map((r) => r.coutUsd)),
        dureeMedianeS: median(dureesS),
        dureeMaxS: dureesS.length === 0 ? null : Math.max(...dureesS),
        au150: dureesS.filter((d) => d > LIMITE_GRATUIT_S).length,
        au400: dureesS.filter((d) => d > LIMITE_PAYANT_S).length,
        extraitsRejetes: totales === 0 ? null : rejetees / totales,
        total,
        pdf: compte(relues.filter((e) => e.format === "pdf")),
        photos: compte(relues.filter((e) => e.format === "photos")),
        causeTranscription: relues.filter((e) => verdicts[e.id].cause === "transcription").length,
        seuilRespecte: tauxTotal === null ? null : tauxTotal <= SEUIL_FAUSSES,
      },
    ];
  });
}

const pct = (v: number | null) => (v === null ? "n/d" : `${(v * 100).toFixed(1)} %`);
const usd = (v: number | null) => (v === null ? "n/d" : `${v.toFixed(3)} $`);
const sec = (v: number | null) => (v === null ? "n/d" : `${Math.round(v)} s`);
const part = (t: Taux) => `${pct(taux(t))} (${t.fausses}/${t.relues})`;

export function renderReport(lignes: readonly Ligne[]): string {
  const rangees: [string, (l: Ligne) => string][] = [
    ["Imports réussis", (l) => `${l.reussis}/${l.imports}`],
    ["Refus", (l) => String(l.refus)],
    ["Appels servis par un repli", (l) => String(l.replis)],
    ["Coût pour 10 pages", (l) => usd(l.coutPour10Pages)],
    ["Élève à 8 cours de 10 pages par mois", (l) => usd(l.coutPour10Pages === null ? null : l.coutPour10Pages * 8)],
    ["Cours le plus cher", (l) => usd(l.coutMaxCours)],
    ["Durée médiane d'un appel", (l) => sec(l.dureeMedianeS)],
    ["Durée maximale d'un appel", (l) => sec(l.dureeMaxS)],
    [`Appels de plus de ${LIMITE_GRATUIT_S} s`, (l) => String(l.au150)],
    [`Appels de plus de ${LIMITE_PAYANT_S} s`, (l) => String(l.au400)],
    ["Extraits rejetés", (l) => pct(l.extraitsRejetes)],
    ["Questions fausses", (l) => part(l.total)],
    ["Questions fausses, PDF", (l) => part(l.pdf)],
    ["Questions fausses, photos", (l) => part(l.photos)],
    ["Fausses à cause de la transcription", (l) => String(l.causeTranscription)],
    ["Seuil de 5 % respecté", (l) => (l.seuilRespecte === null ? "n/d" : l.seuilRespecte ? "oui" : "non")],
  ];
  return [
    "# Test des modèles : résultats",
    "",
    `| Mesure | ${lignes.map((l) => l.modele).join(" | ")} |`,
    `|---|${lignes.map(() => "---:").join("|")}|`,
    ...rangees.map(([nom, valeur]) => `| ${nom} | ${lignes.map(valeur).join(" | ")} |`),
    "",
  ].join("\n");
}

if (import.meta.main) {
  const lire = async <T>(chemin: string, defaut: T) =>
    existsSync(chemin) ? (JSON.parse(await readFile(chemin, "utf8")) as T) : defaut;
  const entrees = await lire<Entree[]>(join("relecture", "cle.json"), []);
  // Les corrections de la personne qui contrôle l'emportent sur les verdicts proposés.
  const verdicts = {
    ...(await lire<Record<string, Verdict>>(join("relecture", "verdicts.json"), {})),
    ...(await lire<Record<string, Verdict>>(join("relecture", "corrections.json"), {})),
  };
  const lignes = summarize(await readManifest("cours"), await readResults("resultats"), entrees, verdicts);
  await writeFile(join("resultats", "rapport.md"), renderReport(lignes));
  console.log("Rapport écrit dans resultats/rapport.md");
}
