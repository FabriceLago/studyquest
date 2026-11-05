import {
  CoursVille,
  NotionVille,
  dessinerVille,
  messageAllumage,
  placesDuQuartier,
  prochaineRecompense,
  typeBatiment,
} from './ville';

const notion = (id: string, changes: Partial<NotionVille> = {}): NotionVille => ({
  id,
  titre: `Notion ${id}`,
  ordre: Number(id.replace(/\D/g, '')) || 0,
  etat: 'vide',
  due: false,
  recent: false,
  ...changes,
});
const cours = (id: string, notions: NotionVille[]): CoursVille => ({
  id,
  titre: `Cours ${id}`,
  notions,
});

describe('dessinerVille', () => {
  const ville = [
    cours('c1', [
      notion('n1', { etat: 'batie' }),
      notion('n2', { etat: 'chantier' }),
      notion('n3'),
    ]),
    cours('c2', [notion('n4', { etat: 'batie', due: true })]),
  ];

  it('dessine toujours la même ville pour les mêmes données', () => {
    expect(dessinerVille(ville, 3)).toEqual(dessinerVille(ville, 3));
  });

  it('compte un emplacement par notion et un bâtiment par notion bâtie', () => {
    const v = dessinerVille(ville, 1);
    expect(v.emplacements).toBe(4);
    expect(v.baties).toBe(2);
  });

  it('signale une notion à revoir par un repère', () => {
    const reperes = dessinerVille(ville, 1).formes.filter(
      (f) => f.k === 'cercle' && f.fill === '#ff9682' && f.r === 7.5,
    );
    expect(reperes.length).toBe(1);
  });

  it('anime seulement un bâtiment récent', () => {
    const recent = [
      cours('c1', [notion('n1', { etat: 'batie', recent: true }), notion('n2', { recent: true })]),
    ];
    expect(dessinerVille(recent, 1).formes.some((f) => f.anime)).toBe(true);
    expect(dessinerVille(ville, 1).formes.some((f) => f.anime)).toBe(false);
  });

  it('montre la notion choisie', () => {
    const contour = (choisi?: string) =>
      dessinerVille(ville, 1, choisi).formes.filter((f) => f.stroke === '#f7f1e3').length;
    expect(contour('n2')).toBe(1);
    expect(contour()).toBe(0);
  });

  it('ajoute les décors à mesure que le niveau monte', () => {
    const troncs = (niveau: number) =>
      dessinerVille(ville, niveau).formes.filter((f) => f.k === 'ligne' && f.stroke === '#7a4a3a')
        .length;
    expect(troncs(1)).toBe(0);
    expect(troncs(2)).toBeGreaterThan(0);
  });
});

describe('placement', () => {
  it('reste le même pour un cours, change d’un cours à l’autre, sans doublon', () => {
    expect(placesDuQuartier('c1')).toEqual(placesDuQuartier('c1'));
    expect(placesDuQuartier('c1')).not.toEqual(placesDuQuartier('c2'));
    expect(new Set(placesDuQuartier('c1').map((p) => p.join())).size).toBe(12);
  });

  it('débloque les bâtiments avec le niveau sans changer de place', () => {
    const avance = Array.from({ length: 40 }, (_, i) => `n${i}`).find(
      (id) => typeBatiment(id, 6) === 'tour',
    );
    expect(avance).toBeDefined();
    expect(['maison', 'atelier', 'serre']).toContain(typeBatiment(avance!, 1));
    expect(typeBatiment(avance!, 9)).toBe('tour');
  });
});

describe('prochaineRecompense', () => {
  it('annonce le prochain bâtiment et le prochain décor', () => {
    expect(prochaineRecompense(1)).toEqual({ niveau: 2, noms: ['une école', 'des arbres'] });
    expect(prochaineRecompense(5)).toEqual({ niveau: 6, noms: ['une tour'] });
    expect(prochaineRecompense(6)).toBeNull();
  });
});

describe('messageAllumage', () => {
  it('annonce seulement les bâtiments posés pendant la session', () => {
    const avant = [cours('c1', [notion('n1', { etat: 'batie' }), notion('n2'), notion('n3')])];
    const un = [
      cours('c1', [notion('n1', { etat: 'batie' }), notion('n2', { etat: 'batie' }), notion('n3')]),
    ];
    const deux = [
      cours('c1', [
        notion('n1', { etat: 'batie' }),
        notion('n2', { etat: 'batie' }),
        notion('n3', { etat: 'batie' }),
      ]),
    ];
    expect(messageAllumage(avant, avant)).toBe('');
    expect(messageAllumage(avant, un)).toBe('« Notion n2 » s’allume dans ta ville.');
    expect(messageAllumage(avant, deux)).toBe('2 bâtiments s’allument dans ta ville.');
  });
});
