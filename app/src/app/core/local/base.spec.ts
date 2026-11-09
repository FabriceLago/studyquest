import * as base from './base';

const JOUR = 86_400_000;
const T0 = Date.parse('2026-11-09T10:00:00');

/** Un cours d'une notion et de n questions vrai/faux, toutes « Vrai ». */
function avecCours(questions = 3) {
  const e = base.etatVide();
  const id = base.ecrireCours(
    e,
    null,
    'Histoire',
    [
      {
        titre: 'Révolution',
        a_retenir: '1789',
        questions: Array.from({ length: questions }, (_, i) => ({
          enonce: `Q${i}`,
          explication: null,
          vrai: true,
        })),
      },
    ],
    T0,
  );
  return { e, id: id as string };
}
const VRAI = { choisies: [0] };
const FAUX = { choisies: [1] };

function decouvrirTout(e: base.Etat, t: number) {
  for (const q of base.questionsMission(e, 'decouvrir', t)!.questions)
    base.repondre(e, q.id, 'decouvrir', VRAI, t);
}

describe('base locale', () => {
  it('crée un cours et mélange les choix sans perdre la bonne réponse', () => {
    const e = base.etatVide();
    base.ecrireCours(
      e,
      null,
      'Maths',
      [
        {
          titre: 'Nombres',
          a_retenir: 'x',
          questions: [
            {
              enonce: 'Pair ?',
              explication: null,
              choix: [
                { texte: '2', correcte: true },
                { texte: '3', correcte: false },
                { texte: '4', correcte: true },
              ],
            },
          ],
        },
      ],
      T0,
    );
    const q = e.questions[0];
    expect(q.type).toBe('multiple');
    expect(q.correctes.map((i) => q.options[i]).sort()).toEqual(['2', '4']);
  });

  it('Découvrir puis Réviser font avancer les boîtes et bâtissent la notion', () => {
    const { e } = avecCours();
    expect(base.missionDuJour(e, T0).decouvrir.questions).toBe(3);
    for (const q of base.questionsMission(e, 'decouvrir', T0)!.questions)
      expect(base.repondre(e, q.id, 'decouvrir', VRAI, T0)).toMatchObject({
        compte: true,
        juste: true,
        xp: 5,
      });
    const j0 = base.missionDuJour(e, T0);
    expect(j0.decouvrir.fait).toBe(true);
    // 3 × 5 XP, plus 20 de prime de mission.
    expect(j0.xp_jour).toBe(35);
    expect(j0.jour_compte).toBe(true);
    // Une réponse déjà comptée ne compte plus.
    expect(base.repondre(e, e.questions[0].id, 'decouvrir', VRAI, T0)).toEqual({ compte: false });

    // Lendemain : boîte 1 → 2 ; trois jours plus tard : 2 → 3, la notion est bâtie.
    let t = T0 + JOUR;
    for (const q of base.questionsMission(e, 'reviser', t)!.questions)
      base.repondre(e, q.id, 'reviser', VRAI, t);
    t += 3 * JOUR;
    for (const q of base.questionsMission(e, 'reviser', t)!.questions)
      base.repondre(e, q.id, 'reviser', VRAI, t);
    expect(Object.values(e.revisions).every((r) => r.boite === 3)).toBe(true);
    expect(base.maVille(e, t)[0].notions[0].etat).toBe('batie');
    expect(base.missionDuJour(e, t).notions_maitrisees).toBe(1);

    // Une erreur renvoie en boîte 1, mais le bâtiment reste.
    t += 7 * JOUR;
    const [q] = base.questionsMission(e, 'reviser', t)!.questions;
    expect(base.repondre(e, q.id, 'reviser', FAUX, t)).toMatchObject({ juste: false, xp: 0 });
    expect(e.revisions[q.id].boite).toBe(1);
    expect(base.maVille(e, t)[0].notions[0].etat).toBe('batie');
  });

  it('plafonne l’XP du jour', () => {
    const { e } = avecCours(1);
    e.jours[base.jourDe(T0)] = {
      xp: 298,
      reviser: false,
      decouvrir: false,
      defi: false,
      mini: false,
      defiDebut: null,
    };
    base.repondre(e, e.questions[0].id, 'decouvrir', VRAI, T0);
    expect(base.missionDuJour(e, T0).xp_jour).toBe(base.REGLES.xpPlafond);
  });

  it('compte la série, comble un trou avec un gel, la casse au-delà', () => {
    const e = base.etatVide();
    for (const j of ['2026-11-05', '2026-11-07', '2026-11-08'])
      e.jours[j] = {
        xp: 0,
        reviser: true,
        decouvrir: false,
        defi: false,
        mini: false,
        defiDebut: null,
      };
    // Aujourd'hui (le 9) pas encore joué ne casse rien ; le 6 est comblé par un gel.
    expect(base.serieEtGels(e, '2026-11-09')).toEqual({ serie: 3, gels: 1 });
    expect(base.serieEtGels(e, '2026-11-12')).toEqual({ serie: 0, gels: 2 });
  });

  it('défi : 60 secondes, un essai par jour, prime une seule fois', () => {
    const { e } = avecCours(5);
    expect(base.questionsMission(e, 'defi', T0)).toBeNull();
    decouvrirTout(e, T0);
    const t = T0 + JOUR;
    const defi = base.questionsMission(e, 'defi', t)!;
    expect(defi.secondes).toBe(60);
    expect(base.repondre(e, defi.questions[0].id, 'defi', VRAI, t + 1000)).toEqual({
      compte: true,
      juste: true,
      xp: 2,
    });
    // Hors délai : refusée.
    expect(base.repondre(e, defi.questions[1].id, 'defi', VRAI, t + 70_000)).toEqual({
      compte: false,
    });
    expect(base.terminerDefi(e, t + 70_000)).toEqual({ prime: 20, justes: 1, total: 1, xp: 2 });
    expect(base.terminerDefi(e, t + 80_000).prime).toBe(0);
    expect(base.questionsMission(e, 'defi', t + 90_000)).toEqual({ questions: [], secondes: 0 });
  });

  it('examen blanc : même examen dans la journée, score par notion, notion faible à revoir', () => {
    const { e, id } = avecCours(2);
    decouvrirTout(e, T0);
    const debut = base.demarrerExamen(e, id, T0)!;
    expect(debut.total).toBe(2);
    expect(base.demarrerExamen(e, id, T0 + 1000)!.id).toBe(debut.id);
    const [a, b] = debut.questions!;
    expect(base.repondreExamen(e, debut.id, a.id, VRAI, T0)).toBe(true);
    expect(base.repondreExamen(e, debut.id, b.id, FAUX, T0)).toBe(true);
    expect(base.rendreExamen(e, debut.id)).toEqual({
      justes: 1,
      total: 2,
      notions: [{ titre: 'Révolution', justes: 1, total: 2 }],
    });
    expect(base.reviserNotionFaible(e, debut.id, T0)).toEqual({
      notion: 'Révolution',
      questions: 1,
    });
    expect(e.revisions[b.id].echeance).toBe(base.jourDe(T0));
  });

  it('une date d’examen rapproche les révisions', () => {
    const { e, id } = avecCours(1);
    e.revisions[e.questions[0].id] = { boite: 5, echeance: '2026-12-09' };
    expect(base.fixerExamen(e, id, '2026-11-13', T0)).toBe(true);
    expect(e.revisions[e.questions[0].id].echeance).toBe('2026-11-11');
    expect(base.fixerExamen(e, id, '2026-11-01', T0)).toBe(false);
  });
});
