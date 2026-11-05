/**
 * Les 8 avatars, uniquement décoratifs (spécification § 3). Les niveaux doivent rester ceux de
 * regles().avatars_niveaux : c'est le serveur qui refuse un avatar pas encore débloqué.
 * Tracés dans un carré de 24 × 24.
 */
export const AVATARS: readonly {
  readonly nom: string;
  readonly niveau: number;
  readonly d: string;
}[] = [
  { nom: 'Lune', niveau: 1, d: 'M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z' },
  {
    nom: 'Étoile',
    niveau: 1,
    d: 'M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6l-6.3 3.5 1.5-7L2 9.3l7-.8z',
  },
  { nom: 'Feuille', niveau: 1, d: 'M20 4C9 4 4 10 4 20c10 0 16-5 16-16z' },
  {
    nom: 'Flamme',
    niveau: 2,
    d: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 0-5 1-8z',
  },
  { nom: 'Goutte', niveau: 3, d: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13z' },
  { nom: 'Éclair', niveau: 4, d: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  { nom: 'Montagne', niveau: 5, d: 'M2 20l7-12 4 6 3-4 6 10z' },
  { nom: 'Couronne', niveau: 6, d: 'M3 18L2 7l6 4 4-7 4 7 6-4-1 11z' },
];
