// La ville de la maquette validée (maquettes/index.html), dessinée à partir des vraies données.
// Tout est calculé ici, sans bibliothèque : le composant ne fait qu'afficher ces formes.

export type EtatNotion = 'batie' | 'chantier' | 'vide';

export interface NotionVille {
  readonly id: string;
  readonly titre: string;
  readonly ordre: number;
  readonly etat: EtatNotion;
  readonly due: boolean;
  readonly recent: boolean;
}

export interface CoursVille {
  readonly id: string;
  readonly titre: string;
  readonly notions: readonly NotionVille[];
}

export interface Forme {
  readonly k: 'poly' | 'ligne' | 'cercle' | 'chemin' | 'ellipse' | 'texte';
  readonly points?: string;
  readonly d?: string;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly r?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly x?: number;
  readonly y?: number;
  readonly texte?: string;
  readonly taille?: number;
  readonly fill?: string;
  readonly stroke?: string;
  readonly sw?: number;
  readonly dash?: string;
  readonly opacite?: number;
  /** Bâtiment apparu dans les dernières 24 h : il monte, sauf en mouvement réduit. */
  readonly anime?: boolean;
}

export interface Ville {
  readonly formes: readonly Forme[];
  readonly viewBox: string;
  readonly emplacements: number;
  readonly baties: number;
}

export type TypeBatiment =
  'maison' | 'atelier' | 'serre' | 'ecole' | 'biblio' | 'observatoire' | 'horloge' | 'tour';

/** Trois bâtiments de base, puis un nouveau à chaque niveau. */
export const BATIMENTS: readonly { type: TypeBatiment; niveau: number; nom: string }[] = [
  { type: 'maison', niveau: 1, nom: 'une maison' },
  { type: 'atelier', niveau: 1, nom: 'un atelier' },
  { type: 'serre', niveau: 1, nom: 'une serre' },
  { type: 'ecole', niveau: 2, nom: 'une école' },
  { type: 'biblio', niveau: 3, nom: 'une bibliothèque' },
  { type: 'observatoire', niveau: 4, nom: 'un observatoire' },
  { type: 'horloge', niveau: 5, nom: 'une tour de l’horloge' },
  { type: 'tour', niveau: 6, nom: 'une tour' },
];

export const DECORS: readonly { niveau: number; nom: string }[] = [
  { niveau: 2, nom: 'des arbres' },
  { niveau: 3, nom: 'des lampadaires' },
  { niveau: 4, nom: 'une fontaine' },
  { niveau: 5, nom: 'un jardin public' },
];

/** La prochaine récompense décorative, bâtiment ou décor, ou null quand tout est débloqué. */
export function prochaineRecompense(niveau: number): { niveau: number; noms: string[] } | null {
  const toutes = [...BATIMENTS, ...DECORS].filter((r) => r.niveau > niveau);
  if (toutes.length === 0) return null;
  const prochain = Math.min(...toutes.map((r) => r.niveau));
  return { niveau: prochain, noms: toutes.filter((r) => r.niveau === prochain).map((r) => r.nom) };
}

/** Empreinte FNV-1a : la même chaîne donne toujours le même nombre. */
export function empreinte(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Suite pseudo-aléatoire stable (mulberry32), pour placer les notions toujours au même endroit. */
function aleatoire(graine: number): () => number {
  let a = graine;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function typeBatiment(notionId: string, niveau: number): TypeBatiment {
  const h = empreinte(notionId);
  const choix = BATIMENTS[h % BATIMENTS.length];
  return choix.niveau <= niveau ? choix.type : BATIMENTS[h % 3].type;
}

/** Un quartier fait 4 × 3 emplacements : la génération demande 12 notions au plus. */
const COLONNES = 4;
const RANGEES = 3;
const PLACES: readonly (readonly [number, number])[] = Array.from(
  { length: COLONNES * RANGEES },
  (_, i) => [i % COLONNES, Math.floor(i / COLONNES)] as const,
);

export function placesDuQuartier(coursId: string): (readonly [number, number])[] {
  const tirage = aleatoire(empreinte(coursId));
  const places = [...PLACES];
  for (let i = places.length - 1; i > 0; i--) {
    const j = Math.floor(tirage() * (i + 1));
    [places[i], places[j]] = [places[j], places[i]];
  }
  return places;
}

/* ---------- Dessin isométrique, repris de la maquette ---------- */

type Point = readonly [number, number];
type Palette = readonly [string, string, string];
const TW = 44;
const TH = 22;
const pt = (x: number, y: number, z = 0): Point => [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z];
const arrondi = (n: number) => Math.round(n * 10) / 10;
const poly = (pts: readonly Point[], fill: string, extra: Partial<Forme> = {}): Forme => ({
  k: 'poly',
  points: pts.map(([a, b]) => `${arrondi(a)},${arrondi(b)}`).join(' '),
  fill,
  ...extra,
});
const trait = (a: Point, b: Point, stroke = '#c2c6dc', sw = 1): Forme => ({
  k: 'ligne',
  x1: arrondi(a[0]),
  y1: arrondi(a[1]),
  x2: arrondi(b[0]),
  y2: arrondi(b[1]),
  stroke,
  sw,
});

const P: Record<string, Palette> = {
  bleu: ['#6a72ad', '#4c5390', '#383e72'],
  prune: ['#8a6aa0', '#684c82', '#503a66'],
  brique: ['#c08066', '#9c604c', '#7a4a3a'],
  pierre: ['#b6b3b8', '#8d8b98', '#6e6c7c'],
  ardoise: ['#5f6f92', '#47566f', '#364358'],
  vert: ['#5f9e7c', '#477c60', '#37624c'],
  toit: ['#000', '#a7544a', '#843f39'],
  chantier: ['#5a5f80', '#454a68', '#373b55'],
  verre: ['#bff3df', '#7fdcbd88', '#5fc2a388'],
  sol: ['#1b2040', '#23284a', '#1b2040'],
};
const SOLS = ['#27405a', '#45324f', '#2f3a63', '#2a4a4c'];
const ROUTE = '#1b2040';
const TRONC = '#7a4a3a';
const HAUTEUR: Record<TypeBatiment, number> = {
  tour: 74,
  maison: 36,
  ecole: 50,
  biblio: 36,
  observatoire: 42,
  atelier: 32,
  horloge: 68,
  serre: 24,
};

function boite(x: number, y: number, l: number, p: number, h: number, c: Palette, z = 0): Forme[] {
  const A = pt(x, y + p, z);
  const B = pt(x + l, y + p, z);
  const C = pt(x + l, y, z);
  const D = pt(x, y, z);
  const T = (a: Point): Point => [a[0], a[1] - h];
  return [
    poly([T(A), T(B), T(C), T(D)], c[0]),
    poly([A, B, T(B), T(A)], c[1]),
    poly([B, C, T(C), T(B)], c[2]),
  ];
}

function fenetres(
  x: number,
  y: number,
  l: number,
  p: number,
  h: number,
  z0: number,
  cols: number,
  rangs: number,
  graine: number,
): Forme[] {
  const formes: Forme[] = [];
  for (let r = 0; r < rangs; r++)
    for (let c = 0; c < cols; c++) {
      const z1 = z0 + ((r + 0.28) * h) / rangs;
      const z2 = z0 + ((r + 0.72) * h) / rangs;
      const on = (c * 3 + r * 5 + graine) % 5 !== 0;
      const a = x + ((c + 0.25) * l) / cols;
      const b = x + ((c + 0.75) * l) / cols;
      const d = y + ((c + 0.25) * p) / cols;
      const f = y + ((c + 0.75) * p) / cols;
      formes.push(
        poly(
          [pt(a, y + p, z1), pt(b, y + p, z1), pt(b, y + p, z2), pt(a, y + p, z2)],
          on ? '#ffc35c' : '#2e3360',
        ),
        poly(
          [pt(x + l, d, z1), pt(x + l, f, z1), pt(x + l, f, z2), pt(x + l, d, z2)],
          on ? '#f0a945' : '#262a52',
        ),
      );
    }
  return formes;
}

function toit(x: number, y: number, l: number, p: number, z: number, h: number, c: Palette) {
  const S = pt(x + l / 2, y + p / 2, z + h);
  return [
    poly([pt(x, y + p, z), pt(x + l, y + p, z), S], c[1]),
    poly([pt(x + l, y + p, z), pt(x + l, y, z), S], c[2]),
  ];
}

function batiment(type: TypeBatiment, x: number, y: number, g: number): Forme[] {
  const m = 0.15;
  const X = x + m;
  const Y = y + m;
  const L = 1 - 2 * m;
  switch (type) {
    case 'tour':
      return [
        ...boite(X, Y, L, L, 60, P['bleu']),
        ...fenetres(X, Y, L, L, 60, 0, 2, 6, g),
        trait(pt(x + 0.5, y + 0.5, 60), pt(x + 0.5, y + 0.5, 74)),
      ];
    case 'maison':
      return [
        ...boite(X, Y, L, L, 20, P['brique']),
        ...fenetres(X, Y, L, L, 20, 0, 2, 1, g),
        ...toit(X, Y, L, L, 20, 15, P['toit']),
      ];
    case 'ecole': {
      const a = pt(x + 0.5, y + 0.5, 40);
      const b = pt(x + 0.5, y + 0.5, 52);
      return [
        ...boite(x + 0.08, y + 0.2, 0.84, 0.6, 26, P['prune']),
        ...fenetres(x + 0.08, y + 0.2, 0.84, 0.6, 26, 0, 3, 2, g),
        ...boite(x + 0.35, y + 0.35, 0.3, 0.3, 14, P['prune'], 26),
        trait(a, b),
        poly([b, [b[0] + 9, b[1] + 3], [b[0], b[1] + 6]], '#ff9682'),
      ];
    }
    case 'biblio':
      return [
        ...boite(X - 0.04, Y - 0.04, L + 0.08, L + 0.08, 6, P['pierre']),
        ...boite(X, Y, L, L, 24, P['ardoise'], 6),
        ...fenetres(X, Y, L, L, 24, 6, 3, 1, g),
        ...boite(X - 0.05, Y - 0.05, L + 0.1, L + 0.1, 4, P['pierre'], 30),
      ];
    case 'observatoire': {
      const c = pt(x + 0.5, y + 0.5, 24);
      return [
        ...boite(X, Y, L, L, 24, P['ardoise']),
        ...fenetres(X, Y, L, L, 24, 0, 2, 1, g),
        {
          k: 'chemin',
          d: `M${arrondi(c[0] - 13)} ${arrondi(c[1])}a13 13 0 0 1 26 0z`,
          fill: '#5fdcb5',
        },
        trait([c[0] + 2, c[1] - 13], [c[0] + 6, c[1] - 2], '#12162a', 2),
      ];
    }
    case 'atelier': {
      const formes = [
        ...boite(x + 0.1, y + 0.12, 0.8, 0.76, 18, P['brique']),
        ...fenetres(x + 0.1, y + 0.12, 0.8, 0.76, 18, 0, 3, 1, g),
      ];
      for (let i = 0; i < 3; i++) {
        const u = x + 0.1 + (i * 0.8) / 3;
        const v = u + 0.8 / 3;
        formes.push(
          poly([pt(u, y + 0.88, 18), pt(v, y + 0.88, 18), pt(v, y + 0.88, 30)], P['toit'][1]),
        );
      }
      return formes;
    }
    case 'horloge': {
      const c = pt(x + 0.5, y + 0.7, 42);
      return [
        ...boite(x + 0.3, y + 0.3, 0.4, 0.4, 50, P['pierre']),
        ...fenetres(x + 0.3, y + 0.3, 0.4, 0.4, 32, 0, 1, 3, g),
        {
          k: 'cercle',
          cx: arrondi(c[0]),
          cy: arrondi(c[1]),
          r: 5,
          fill: '#ffc35c',
          stroke: '#12162a',
        },
        ...toit(x + 0.3, y + 0.3, 0.4, 0.4, 50, 16, P['prune']),
      ];
    }
    case 'serre':
      return [
        ...boite(X, Y, L, L, 8, P['vert']),
        ...boite(X, Y, L, L, 14, P['verre'], 8),
        ...fenetres(X, Y, L, L, 14, 8, 2, 1, 1),
      ];
  }
}

function chantier(x: number, y: number): Forme[] {
  const m = 0.15;
  const X = x + m;
  const Y = y + m;
  const L = 1 - 2 * m;
  const H = 24;
  const coins: [number, number][] = [
    [X, Y + L],
    [X + L, Y + L],
    [X + L, Y],
  ];
  return [
    ...boite(X, Y, L, L, 7, P['chantier']),
    ...coins.map(([a, b]) => trait(pt(a, b, 7), pt(a, b, H), '#5fdcb5')),
    trait(pt(X, Y + L, H), pt(X + L, Y + L, H), '#5fdcb5'),
    trait(pt(X + L, Y + L, H), pt(X + L, Y, H), '#5fdcb5'),
  ];
}

function decor(x: number, y: number, niveau: number, W: number, H: number): Forme[] {
  const c = pt(x + 0.5, y + 0.5);
  if (niveau >= 4 && x === 0 && y === 0)
    return [
      {
        k: 'ellipse',
        cx: arrondi(c[0]),
        cy: arrondi(c[1]),
        rx: 13,
        ry: 6.5,
        fill: '#5fdcb5',
        opacite: 0.85,
      },
      trait(c, [c[0], c[1] - 9], '#bff3df', 2),
    ];
  if (niveau >= 5 && x === W - 1 && y === H - 1)
    return [
      poly(
        [pt(x + 0.1, y + 0.1), pt(x + 0.9, y + 0.1), pt(x + 0.9, y + 0.9), pt(x + 0.1, y + 0.9)],
        '#37624c',
      ),
      { k: 'cercle', cx: arrondi(c[0] - 6), cy: arrondi(c[1]), r: 2, fill: '#ff9682' },
      { k: 'cercle', cx: arrondi(c[0] + 5), cy: arrondi(c[1] - 2), r: 2, fill: '#ffc35c' },
      { k: 'cercle', cx: arrondi(c[0]), cy: arrondi(c[1] + 3), r: 2, fill: '#f7f1e3' },
    ];
  const motif = (x * 7 + y * 3) % 5;
  if (niveau >= 2 && motif === 0)
    return [
      trait(c, [c[0], c[1] - 7], TRONC, 2),
      poly(
        [
          [c[0] - 6, c[1] - 6],
          [c[0] + 6, c[1] - 6],
          [c[0], c[1] - 22],
        ],
        '#5f9e7c',
      ),
    ];
  if (niveau >= 3 && motif === 2)
    return [
      trait(c, [c[0], c[1] - 18], '#c2c6dc', 1.5),
      { k: 'cercle', cx: arrondi(c[0]), cy: arrondi(c[1] - 19), r: 2.5, fill: '#ffc35c' },
    ];
  return [];
}

const abreger = (texte: string) => (texte.length > 22 ? `${texte.slice(0, 21)}…` : texte);

/** Toute la ville : sol et routes, puis décors et emplacements de l'arrière vers l'avant. */
export function dessinerVille(
  cours: readonly CoursVille[],
  niveau: number,
  choisi?: string,
): Ville {
  const colonnes = Math.min(Math.max(cours.length, 1), 2);
  const rangees = Math.max(1, Math.ceil(cours.length / 2));
  // Une route fait le tour de chaque quartier.
  const W = 1 + colonnes * (COLONNES + 1);
  const H = 1 + rangees * (RANGEES + 1);
  const origine = (i: number): [number, number] => [
    1 + (i % 2) * (COLONNES + 1),
    1 + Math.floor(i / 2) * (RANGEES + 1),
  ];

  const sols = new Map<string, string>();
  cours.forEach((_, i) => {
    const [ox, oy] = origine(i);
    for (const [c, r] of PLACES) sols.set(`${ox + c},${oy + r}`, SOLS[i % SOLS.length]);
  });

  const formes: Forme[] = [...boite(0, 0, W, H, 8, P['sol'], -8)];
  const scene: { profondeur: number; formes: Forme[] }[] = [];
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const sol = sols.get(`${x},${y}`);
      formes.push(
        poly([pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)], sol ?? ROUTE, {
          stroke: '#12162a',
          sw: 0.6,
        }),
      );
      if (!sol) scene.push({ profondeur: x + y, formes: decor(x, y, niveau, W, H) });
    }

  const lots = cours.flatMap((c, i) => {
    const [ox, oy] = origine(i);
    const places = placesDuQuartier(c.id);
    // ponytail: 12 emplacements par quartier ; au-delà, la notion n'apparaît que dans la liste.
    return [...c.notions]
      .sort((a, b) => a.ordre - b.ordre)
      .slice(0, places.length)
      .map((n, k) => ({ n, x: ox + places[k][0], y: oy + places[k][1] }));
  });

  for (const { n, x, y } of lots) {
    const sol = [
      pt(x + 0.06, y + 0.06),
      pt(x + 0.94, y + 0.06),
      pt(x + 0.94, y + 0.94),
      pt(x + 0.06, y + 0.94),
    ];
    const c = pt(x + 0.5, y + 0.5);
    const type = typeBatiment(n.id, niveau);
    const lot: Forme[] = [
      poly(sol, 'transparent', n.etat === 'vide' ? { stroke: '#c2c6dc', sw: 1, dash: '3 3' } : {}),
    ];
    if (n.etat === 'batie')
      lot.push(
        {
          k: 'ellipse',
          cx: arrondi(c[0]),
          cy: arrondi(c[1]),
          rx: 24,
          ry: 12,
          fill: '#ffc35c',
          opacite: 0.16,
        },
        ...batiment(type, x, y, x * 7 + y * 3),
      );
    if (n.etat === 'chantier') lot.push(...chantier(x, y));
    if (n.due) {
      const b = pt(x + 0.5, y + 0.5, (n.etat === 'batie' ? HAUTEUR[type] : 24) + 11);
      lot.push(
        {
          k: 'cercle',
          cx: arrondi(b[0]),
          cy: arrondi(b[1]),
          r: 7.5,
          fill: '#ff9682',
          stroke: '#12162a',
        },
        {
          k: 'texte',
          x: arrondi(b[0]),
          y: arrondi(b[1] + 4),
          texte: '!',
          taille: 11,
          fill: '#12162a',
        },
      );
    }
    if (n.id === choisi) lot.push(poly(sol, 'none', { stroke: '#f7f1e3', sw: 2 }));
    const anime = n.recent && n.etat === 'batie';
    scene.push({ profondeur: x + y, formes: anime ? lot.map((f) => ({ ...f, anime })) : lot });
  }

  // Tri stable : à profondeur égale, l'ordre d'ajout reste.
  scene.sort((a, b) => a.profondeur - b.profondeur);
  formes.push(...scene.flatMap((s) => s.formes));

  cours.forEach((c, i) => {
    const [ox, oy] = origine(i);
    const [x, y] = pt(ox + COLONNES / 2, oy - 0.5);
    formes.push({
      k: 'texte',
      x: arrondi(x),
      y: arrondi(y + 4),
      texte: abreger(c.titre),
      taille: 11,
      fill: '#c2c6dc',
      // Contour sombre : le nom reste lisible quand il passe devant un bâtiment.
      stroke: '#12162a',
      sw: 3,
    });
  });

  // Cadrage sur le contenu réel : une petite ville n'a pas de vide au-dessus d'elle.
  const ys = formes.flatMap((f) =>
    f.points
      ? f.points.split(' ').map((p) => Number(p.split(',')[1]))
      : [
          f.y1,
          f.y2,
          f.cy === undefined ? undefined : f.cy - (f.r ?? f.ry ?? 0),
          f.y === undefined ? undefined : f.y - (f.taille ?? 0),
        ].filter((y): y is number => y !== undefined),
  );
  const haut = Math.floor(Math.min(...ys)) - 6;
  const gauche = -H * (TW / 2) - 4;
  const largeur = (W + H) * (TW / 2) + 8;
  return {
    formes,
    viewBox: `${gauche} ${haut} ${largeur} ${Math.ceil(Math.max(...ys)) + 6 - haut}`,
    emplacements: lots.length,
    baties: lots.filter((l) => l.n.etat === 'batie').length,
  };
}

/** Le bilan d'une session annonce les bâtiments posés pendant celle-ci. */
export function messageAllumage(
  avant: readonly CoursVille[],
  apres: readonly CoursVille[],
): string {
  const baties = (ville: readonly CoursVille[]) =>
    ville.flatMap((c) => c.notions.filter((n) => n.etat === 'batie'));
  const deja = new Set(baties(avant).map((n) => n.id));
  const nouveaux = baties(apres).filter((n) => !deja.has(n.id));
  if (nouveaux.length === 0) return '';
  return nouveaux.length === 1
    ? `« ${nouveaux[0].titre} » s’allume dans ta ville.`
    : `${nouveaux.length} bâtiments s’allument dans ta ville.`;
}
