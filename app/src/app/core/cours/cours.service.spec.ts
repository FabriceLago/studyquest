import {
  NotionEcrite,
  aujourdhuiIso,
  extraitsUniques,
  libelleExamen,
  messageEcriture,
  nouvelleNotion,
  validerEcriture,
  versEnvoi,
} from './cours.service';

describe('extraitsUniques', () => {
  it('ne répète pas un passage cité par plusieurs questions', () => {
    const q = (id: string, extrait: string) => ({ id, type: 'unique', enonce: 'Q', extrait });
    expect(extraitsUniques({ questions: [q('1', 'A'), q('2', 'B'), q('3', 'A')] })).toEqual([
      'A',
      'B',
    ]);
  });

  it('ignore les questions écrites à la main, qui ne citent rien', () => {
    const q = (id: string, extrait: string) => ({ id, type: 'unique', enonce: 'Q', extrait });
    expect(extraitsUniques({ questions: [q('1', ''), q('2', 'B')] })).toEqual(['B']);
  });
});

describe('validerEcriture', () => {
  /** Une notion complète : un choix unique, avec un troisième choix laissé vide. */
  const notion = (): NotionEcrite => {
    const n = nouvelleNotion();
    n.titre = 'Cellule';
    n.aRetenir = 'L’unité du vivant.';
    n.questions[0].enonce = 'Unité du vivant ?';
    n.questions[0].choix[0] = { texte: 'La cellule', correcte: true };
    n.questions[0].choix[1] = { texte: 'L’atome', correcte: false };
    return n;
  };

  it('accepte un cours complet et ignore les choix vides', () => {
    expect(validerEcriture('Biologie', [notion()])).toBeNull();
    expect(validerEcriture(null, [notion()])).toBeNull();
  });

  it('refuse un titre absent, aucune notion ou une notion incomplète', () => {
    expect(validerEcriture('  ', [notion()])).toContain('titre');
    expect(validerEcriture('B', [])).toContain('au moins une notion');
    const sansTitre = notion();
    sansTitre.titre = '';
    expect(validerEcriture('B', [notion(), sansTitre])).toBe('Notion 2 : donne-lui un titre.');
    const sansRetenir = notion();
    sansRetenir.aRetenir = ' ';
    expect(validerEcriture('B', [sansRetenir])).toContain('retenir');
  });

  it('situe chaque erreur de question', () => {
    const cas = (modifier: (n: NotionEcrite) => void) => {
      const n = notion();
      modifier(n);
      return validerEcriture('B', [n]);
    };
    expect(cas((n) => (n.questions[0].enonce = ''))).toBe(
      'Notion 1, question 1 : écris la question.',
    );
    expect(cas((n) => (n.questions[0].choix[1].texte = ''))).toContain('deux choix');
    expect(cas((n) => (n.questions[0].choix[1].texte = ' la CELLULE '))).toContain('identiques');
    expect(cas((n) => (n.questions[0].choix[0].correcte = false))).toContain('bonne réponse');
    expect(cas((n) => (n.questions[0].choix[2].correcte = true))).toContain('cochée est vide');
  });

  it('accepte un vrai/faux sans choix', () => {
    const n = notion();
    n.questions[0].vraiFaux = true;
    n.questions[0].choix = [];
    expect(validerEcriture('B', [n])).toBeNull();
  });
});

describe('versEnvoi', () => {
  it('rogne les textes, retire les choix vides et sépare le vrai/faux', () => {
    const n = nouvelleNotion();
    n.titre = ' Cellule ';
    n.aRetenir = ' Retenir ';
    n.questions[0].enonce = ' Q ';
    n.questions[0].choix[0] = { texte: ' A ', correcte: true };
    n.questions[0].choix[1] = { texte: 'B', correcte: false };
    n.questions.push({
      enonce: 'V',
      explication: ' Parce que ',
      vraiFaux: true,
      vrai: false,
      choix: [],
    });
    expect(versEnvoi([n])).toEqual([
      {
        titre: 'Cellule',
        a_retenir: 'Retenir',
        questions: [
          {
            enonce: 'Q',
            explication: null,
            choix: [
              { texte: 'A', correcte: true },
              { texte: 'B', correcte: false },
            ],
          },
          { enonce: 'V', explication: 'Parce que', vrai: false },
        ],
      },
    ]);
  });
});

describe('messageEcriture', () => {
  it('donne la limite de notions', () => {
    expect(messageEcriture()).toContain('12 notions');
  });
});

describe('libelleExamen', () => {
  const maintenant = new Date(2026, 10, 4, 22, 30);

  it('prend la date locale de l’élève', () => {
    expect(aujourdhuiIso(maintenant)).toBe('2026-11-04');
  });

  it('compte les jours et se tait une fois l’examen passé', () => {
    expect(libelleExamen(null, maintenant)).toBe('');
    expect(libelleExamen('2026-11-03', maintenant)).toBe('');
    expect(libelleExamen('2026-11-04', maintenant)).toBe('Examen aujourd’hui');
    expect(libelleExamen('2026-11-05', maintenant)).toBe('Examen demain');
    expect(libelleExamen('2026-11-14', maintenant)).toBe('Examen dans 10 jours');
  });
});

