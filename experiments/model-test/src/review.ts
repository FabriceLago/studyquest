import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readResults, type Format, type Resultat } from "./run.ts";
import type { Question } from "./schema.ts";

const PAR_COUPLE = 15;
const CONTROLE = 30;

export interface Entree {
  id: string;
  cours: string;
  modele: string;
  format: Format;
  notion: string;
  question: Question;
}

export interface Verdict {
  juste: boolean;
  cause?: "generation" | "transcription";
  raison?: string;
}

const hash = (text: string) => createHash("sha256").update(`studyquest-2026|${text}`).digest("hex");
// Tri par empreinte : le tirage est aléatoire mais identique à chaque lancement.
const melange = <T>(items: readonly T[], cle: (item: T) => string): T[] =>
  [...items].sort((a, b) => hash(cle(a)).localeCompare(hash(cle(b))));

const cleEntree = (e: Omit<Entree, "id">) => `${e.cours}|${e.modele}|${e.notion}|${e.question.enonce}`;

export function sample(resultats: readonly Resultat[], parCouple = PAR_COUPLE): Entree[] {
  const tirage = resultats.flatMap((r) => {
    if (r.statut !== "pret" || !r.filtre) return [];
    const toutes = r.filtre.notions.flatMap((n) =>
      n.questions.map((question) => ({ cours: r.cours, modele: r.modele, format: r.format, notion: n.titre, question })),
    );
    return melange(toutes, cleEntree).slice(0, parCouple);
  });
  return melange(tirage, cleEntree)
    .sort((a, b) => a.cours.localeCompare(b.cours))
    .map((e, i) => ({ ...e, id: `q${String(i + 1).padStart(3, "0")}` }));
}

/** Le modèle n'apparaît jamais : la relecture se fait à l'aveugle. */
export function renderEntree(e: Entree): string {
  const q = e.question;
  const lignes = [`### ${e.id} · ${e.notion}`, "", `**${q.enonce}** (${q.type}, ${q.difficulte})`, ""];
  lignes.push(...q.options.map((o) => `- [${o.correcte ? "x" : " "}] ${o.texte}`));
  lignes.push(...q.paires.map((p) => `- ${p.gauche} → ${p.droite}`));
  lignes.push(...q.etapes.map((etape, i) => `${i + 1}. ${etape}`));
  lignes.push("", `Explication : ${q.explication}`, "", `> ${q.extrait}`, "");
  return lignes.join("\n");
}

export function pickForControl(entrees: readonly Entree[], verdicts: Record<string, Verdict>, n = CONTROLE): Entree[] {
  const fausses = entrees.filter((e) => verdicts[e.id]?.juste === false);
  const justes = entrees.filter((e) => verdicts[e.id]?.juste === true);
  return [...fausses, ...melange(justes, (e) => e.id).slice(0, n)];
}

if (import.meta.main) {
  const commande = process.argv[2];
  await mkdir("relecture", { recursive: true });
  if (commande === "preparer") {
    const entrees = sample(await readResults("resultats"));
    await writeFile(join("relecture", "cle.json"), JSON.stringify(entrees, null, 2));
    for (const cours of new Set(entrees.map((e) => e.cours))) {
      const parties = entrees.filter((e) => e.cours === cours).map(renderEntree);
      await writeFile(join("relecture", `${cours}.md`), [`# Relecture : ${cours}`, "", ...parties].join("\n"));
    }
    console.log(`${entrees.length} questions à relire. Verdicts à écrire dans relecture/verdicts.json.`);
  } else if (commande === "controle") {
    const entrees = JSON.parse(await readFile(join("relecture", "cle.json"), "utf8")) as Entree[];
    const verdicts = JSON.parse(await readFile(join("relecture", "verdicts.json"), "utf8")) as Record<string, Verdict>;
    const absentes = entrees.filter((e) => !verdicts[e.id]);
    if (absentes.length > 0) throw new Error(`Verdicts manquants : ${absentes.map((e) => e.id).join(", ")}`);
    const choisies = pickForControl(entrees, verdicts);
    const parties = choisies.map((e) => {
      const v = verdicts[e.id];
      return `${renderEntree(e)}\nVerdict proposé : **${v.juste ? "juste" : `fausse (${v.cause ?? "cause inconnue"})`}**${v.raison ? `, ${v.raison}` : ""}\n`;
    });
    await writeFile(join("relecture", "controle.md"), [`# Contrôle (${choisies.length} questions)`, "", ...parties].join("\n"));
    console.log(`${choisies.length} questions à contrôler dans relecture/controle.md.`);
  } else {
    throw new Error("Commande attendue : preparer ou controle");
  }
}
