import {
  Brouillon,
  NotionEcrite,
  aujourdhuiIso,
  extraitsUniques,
  libelleExamen,
  messageCreation,
  messageEcriture,
  messageRejoindre,
  nouvelleNotion,
  validerEcriture,
  validerImport,
  versEnvoi,
} from './cours.service';

const MO = 1024 * 1024;
const pdf = (taille = MO) => ({ nom: 'c.pdf', taille, type: 'application/pdf' });
const photo = { nom: 'p.jpg', taille: MO, type: 'image/jpeg' };
const brouillon = (changes: Partial<Brouillon>): Brouillon => ({
  titre: 'Cours',
  format: 'pdf',
  fichiers: [pdf()],
  texte: '',
  ...changes,
});

describe('validerImport', () => {
  it('accepte un PDF, des photos et un texte dans les limites', () => {
    expect(validerImport(brouillon({}))).toBeNull();
    expect(
      validerImport(brouillon({ format: 'photos', fichiers: Array(30).fill(photo) })),
    ).toBeNull();
    expect(
      validerImport(brouillon({ format: 'texte', fichiers: [], texte: 'x'.repeat(200) })),
    ).toBeNull();
  });

  it('refuse un titre vide ou trop long', () => {
    expect(validerImport(brouillon({ titre: '  ' }))).toContain('titre');
    expect(validerImport(brouillon({ titre: 'x'.repeat(121) }))).toContain('titre');
  });

  it('refuse un PDF absent, trop lourd, multiple ou d’un autre type', () => {
    expect(validerImport(brouillon({ fichiers: [] }))).toContain('PDF');
    expect(validerImport(brouillon({ fichiers: [pdf(21 * MO)] }))).toContain('20 Mo');
    expect(validerImport(brouillon({ fichiers: [pdf(), pdf()] }))).toContain('seul');
    expect(validerImport(brouillon({ fichiers: [photo] }))).toContain('PDF');
  });

  it('refuse 31 photos ou un fichier qui n’est pas une image', () => {
    expect(
      validerImport(brouillon({ format: 'photos', fichiers: Array(31).fill(photo) })),
    ).toContain('30');
    expect(validerImport(brouillon({ format: 'photos', fichiers: [pdf()] }))).toContain('photos');
    expect(validerImport(brouillon({ format: 'photos', fichiers: [] }))).toContain('photo');
  });

  it('refuse un texte trop court ou trop long', () => {
    expect(validerImport(brouillon({ format: 'texte', fichiers: [], texte: 'court' }))).toContain(
      '200',
    );
    expect(
      validerImport(brouillon({ format: 'texte', fichiers: [], texte: 'x'.repeat(60_001) })),
    ).toContain('60 000');
  });
});

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
  it('explique une limite atteinte, un cours fermé et les autres erreurs', () => {
    expect(messageEcriture('SQ429')).toContain('12 notions');
    expect(messageEcriture('SQ404')).toContain('nouvelles notions');
    expect(messageEcriture(undefined)).toContain('réessaie');
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

describe('messageRejoindre', () => {
  it('explique chaque refus', () => {
    expect(messageRejoindre('SQ404')).toContain('n’existe pas');
    expect(messageRejoindre('SQ409')).toContain('déjà le tien');
    expect(messageRejoindre('SQ429')).toContain('nombre de personnes');
    expect(messageRejoindre(undefined)).toContain('Réessaie');
  });
});

describe('messageCreation', () => {
  it('explique un import en cours, un quota atteint et les autres erreurs', () => {
    expect(messageCreation('SQ409')).toContain('déjà en cours');
    expect(messageCreation('SQ429')).toContain('ce mois-ci');
    expect(messageCreation(undefined)).toContain('Réessaie');
  });
});
