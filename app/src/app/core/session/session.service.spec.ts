import {
  QuestionMission,
  duree,
  messageNotionFaible,
  niveau,
  reponseDonnee,
  seuil,
  texteALire,
} from './session.service';

const question = (presentation: QuestionMission['presentation']): QuestionMission => ({
  id: 'q',
  type: 'unique',
  enonce: 'Question ?',
  presentation,
  notion: 'Notion',
  cours: 'Cours',
});

describe('niveau', () => {
  it('suit la formule de la spécification', () => {
    expect([0, 99, 100, 399, 400, 899, 900].map(niveau)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });

  it('donne le seuil de chaque niveau', () => {
    expect([1, 2, 3, 4].map(seuil)).toEqual([0, 100, 400, 900]);
    for (const n of [1, 2, 3, 4, 17]) expect(niveau(seuil(n))).toBe(n);
  });
});

describe('texteALire', () => {
  it('lit l’énoncé et les choix de chaque type de question', () => {
    expect(texteALire(question({ options: ['a', 'b'] }))).toBe(
      'Question ? Réponse 1 : a. Réponse 2 : b.',
    );
    expect(texteALire(question({ gauche: ['a', 'b'], droite: ['1', '2'] }))).toBe(
      'Question ? À associer : a, b. Avec : 1, 2.',
    );
    expect(texteALire(question({ etapes: ['a', 'b'] }))).toBe(
      'Question ? À remettre dans l’ordre : a, b.',
    );
  });
});

describe('messageNotionFaible', () => {
  it('dit ce qui a changé dans les révisions', () => {
    expect(messageNotionFaible({ notion: null, questions: 0 })).toContain('tout est juste');
    expect(messageNotionFaible({ notion: 'N', questions: 0 })).toContain('lance Découvrir');
    expect(messageNotionFaible({ notion: 'N', questions: 1 })).toContain('1 question de « N » est');
    expect(messageNotionFaible({ notion: 'N', questions: 4 })).toContain(
      '4 questions de « N » sont',
    );
  });
});

describe('duree', () => {
  it('affiche les minutes et les secondes', () => {
    expect([1200, 61, 59, 0].map(duree)).toEqual(['20:00', '1:01', '0:59', '0:00']);
  });
});

describe('reponseDonnee', () => {
  it('attend au moins un choix', () => {
    const q = question({ options: ['a', 'b'] });
    expect(reponseDonnee(q, [], [], [])).toBeNull();
    expect(reponseDonnee(q, [1], [], [])).toEqual({ choisies: [1] });
  });

  it('attend toutes les associations, y compris la valeur 0', () => {
    const q = question({ gauche: ['a', 'b'], droite: ['1', '2'] });
    expect(reponseDonnee(q, [], [1, null], [])).toBeNull();
    expect(reponseDonnee(q, [], [1, 0], [])).toEqual({ associations: [1, 0] });
  });

  it('accepte un classement tel quel', () => {
    const q = question({ etapes: ['a', 'b'] });
    expect(reponseDonnee(q, [], [], [1, 0])).toEqual({ ordre: [1, 0] });
  });
});
