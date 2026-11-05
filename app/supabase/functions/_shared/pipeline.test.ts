import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MESSAGES,
  traiter,
  versLignes,
  type CoursATraiter,
  type IA,
  type NotionLigne,
} from './pipeline.ts';
import type { Question } from './schema.ts';

const TEXTE = 'La mitochondrie produit l’énergie de la cellule.';

const question = (changes: Partial<Question> = {}): Question => ({
  type: 'unique',
  enonce: 'Que produit la mitochondrie ?',
  explication: 'Le cours le dit.',
  extrait: TEXTE,
  difficulte: 'facile',
  options: [
    { texte: 'De l’énergie', correcte: true },
    { texte: 'De l’ADN', correcte: false },
  ],
  paires: [],
  etapes: [],
  ...changes,
});

const generation = (n = 10) =>
  JSON.stringify({
    notions: [
      {
        titre: 'Énergie',
        carte: { recto: 'r', verso: 'v' },
        questions: Array.from({ length: n }, () => question()),
      },
    ],
  });

function doublures(reponses: Partial<IA> = {}) {
  const journal: string[] = [];
  const maj: { statut: string; raison?: string; texte?: string; cout_usd: number }[] = [];
  const enregistre: { notions: NotionLigne[]; cout: number }[] = [];
  const ia: IA = {
    tropLong: async () => false,
    transcrire: async () => ({ texte: TEXTE, stopReason: 'end_turn', coutUsd: 0.1 }),
    generer: async () => ({ texte: generation(), stopReason: 'end_turn', coutUsd: 0.2 }),
    ...reponses,
  };
  const depot = {
    lireFichiers: async () => (journal.push('lire'), [{ type: 'document' }]),
    supprimerFichiers: async () => void journal.push('supprimer'),
    majCours: async (c: (typeof maj)[number]) => void maj.push(c),
    enregistrer: async (notions: NotionLigne[], cout: number) =>
      void enregistre.push({ notions, cout }),
  };
  return { ia, depot, journal, maj, enregistre };
}

const cours = (changes: Partial<CoursATraiter> = {}): CoursATraiter => ({
  statut: 'transcription',
  format: 'pdf',
  texte: null,
  cout_usd: 0,
  ...changes,
});

test('un PDF est transcrit, son fichier supprimé, puis les questions enregistrées', async () => {
  const d = doublures();
  await traiter(cours(), d.ia, d.depot);
  assert.deepEqual(d.journal, ['lire', 'supprimer']);
  assert.equal(d.maj[0].statut, 'generation');
  assert.equal(d.maj[0].texte, TEXTE);
  assert.equal(d.enregistre.length, 1);
  assert.ok(Math.abs(d.enregistre[0].cout - 0.3) < 1e-9);
});

test('des photos s’arrêtent à la relecture, sans génération', async () => {
  const d = doublures({ generer: async () => assert.fail('pas de génération avant la relecture') });
  await traiter(cours({ format: 'photos' }), d.ia, d.depot);
  assert.deepEqual(d.maj, [{ statut: 'a_relire', texte: TEXTE, cout_usd: 0.1 }]);
  assert.deepEqual(d.journal, ['lire', 'supprimer']);
});

test('un texte collé ou relu va directement à la génération', async () => {
  const d = doublures({ transcrire: async () => assert.fail('pas de transcription') });
  await traiter(
    cours({ statut: 'generation', format: 'texte', texte: TEXTE, cout_usd: 0.1 }),
    d.ia,
    d.depot,
  );
  assert.equal(d.enregistre.length, 1);
  assert.deepEqual(d.journal, []);
  assert.ok(Math.abs(d.enregistre[0].cout - 0.3) < 1e-9);
});

const echecs: [string, Partial<IA>, string][] = [
  ['document trop long', { tropLong: async () => true }, MESSAGES.tropLong],
  [
    'refus à la transcription',
    { transcrire: async () => ({ texte: '', stopReason: 'refusal', coutUsd: 0 }) },
    MESSAGES.refus,
  ],
  [
    'réponse coupée',
    { transcrire: async () => ({ texte: 'x', stopReason: 'max_tokens', coutUsd: 0.1 }) },
    MESSAGES.coupe,
  ],
  [
    'transcription vide',
    { transcrire: async () => ({ texte: '  ', stopReason: 'end_turn', coutUsd: 0 }) },
    MESSAGES.vide,
  ],
  [
    'refus à la génération',
    { generer: async () => ({ texte: '', stopReason: 'refusal', coutUsd: 0 }) },
    MESSAGES.refus,
  ],
  [
    'JSON hors schéma',
    { generer: async () => ({ texte: '{"notions":"non"}', stopReason: 'end_turn', coutUsd: 0 }) },
    MESSAGES.peuFiable,
  ],
  [
    'trop peu de questions',
    { generer: async () => ({ texte: generation(9), stopReason: 'end_turn', coutUsd: 0 }) },
    MESSAGES.peuFiable,
  ],
  [
    'réponse non JSON',
    { generer: async () => ({ texte: 'pas du json', stopReason: 'end_turn', coutUsd: 0 }) },
    MESSAGES.panne,
  ],
  [
    'panne de l’API',
    {
      transcrire: async () => {
        throw new Error('panne');
      },
    },
    MESSAGES.panne,
  ],
];
for (const [nom, reponses, raison] of echecs) {
  test(`${nom} : échec expliqué, fichier supprimé, rien d’enregistré`, async () => {
    const d = doublures(reponses);
    const erreur = console.error;
    console.error = () => {};
    await traiter(cours(), d.ia, d.depot);
    console.error = erreur;
    const dernier = d.maj.at(-1);
    assert.equal(dernier?.statut, 'echec');
    assert.equal(dernier?.raison, raison);
    assert.ok(d.journal.includes('supprimer'));
    assert.equal(d.enregistre.length, 0);
  });
}

test('le coût déjà engagé reste compté après un échec', async () => {
  const d = doublures({
    generer: async () => ({ texte: '', stopReason: 'refusal', coutUsd: 0.05 }),
  });
  await traiter(cours(), d.ia, d.depot);
  assert.ok(Math.abs((d.maj.at(-1)?.cout_usd ?? 0) - 0.15) < 1e-9);
});

const filtre = (questions: Question[]) => ({
  notions: [{ titre: 'N', carte: { recto: 'r', verso: 'v' }, questions }],
  totales: questions.length,
  retenues: questions.length,
  rejets: { extrait: 0, forme: 0 },
  statut: 'pret' as const,
});

test('la présentation ne révèle jamais la réponse et la réponse suit le mélange', () => {
  const [ligne] = versLignes(filtre([question()]), () => 0)[0].questions;
  assert.doesNotMatch(JSON.stringify(ligne.presentation), /correcte|true/);
  const options = ligne.presentation['options'];
  assert.equal(options[ligne.reponse['correctes'][0]], 'De l’énergie');
});

test('un vrai ou faux garde son ordre', () => {
  const q = question({
    type: 'vrai_faux',
    options: [
      { texte: 'Vrai', correcte: false },
      { texte: 'Faux', correcte: true },
    ],
  });
  const [ligne] = versLignes(filtre([q]), () => 0)[0].questions;
  assert.deepEqual(ligne.presentation['options'], ['Vrai', 'Faux']);
  assert.deepEqual(ligne.reponse['correctes'], [1]);
});

test('une association mélangée pointe vers les bonnes réponses', () => {
  const paires = [
    { gauche: 'a', droite: '1' },
    { gauche: 'b', droite: '2' },
    { gauche: 'c', droite: '3' },
  ];
  const [ligne] = versLignes(
    filtre([question({ type: 'association', options: [], paires })]),
    () => 0,
  )[0].questions;
  const { gauche, droite } = ligne.presentation;
  ligne.reponse['associations'].forEach((idx, i) =>
    assert.equal(droite[idx], paires.find((p) => p.gauche === gauche[i])?.droite),
  );
});

test('un classement ne commence jamais dans le bon ordre, même si le mélange ne change rien', () => {
  const etapes = ['a', 'b', 'c'];
  const [ligne] = versLignes(
    filtre([question({ type: 'classement', options: [], etapes })]),
    () => 0.999,
  )[0].questions;
  assert.notDeepEqual(ligne.presentation['etapes'], etapes);
  assert.deepEqual(
    ligne.reponse['ordre'].map((i) => ligne.presentation['etapes'][i]),
    etapes,
  );
});
