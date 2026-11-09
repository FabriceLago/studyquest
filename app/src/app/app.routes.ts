import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

/** Le contenu de l'élève demande une session : sans elle, direction Bienvenue. */
const compteRequis: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady;
  return auth.userId() ? true : router.parseUrl('/bienvenue');
};

const sessionPage = () => import('./features/session/session-page').then((m) => m.SessionPage);
const ecrirePage = () => import('./features/cours/ecrire-page').then((m) => m.EcrirePage);

export const routes: Routes = [
  // Ancienne adresse d'import, avant cours/:id qui la prendrait pour un identifiant.
  { path: 'cours/importer', redirectTo: 'cours/ecrire' },
  {
    path: '',
    pathMatch: 'full',
    title: 'Aujourd’hui, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () =>
      import('./features/aujourdhui/aujourdhui-page').then((m) => m.AujourdhuiPage),
  },
  {
    path: 'profil',
    title: 'Profil, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/compte/profil-page').then((m) => m.ProfilPage),
  },
  {
    path: 'ville',
    title: 'Ma ville, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/ville/ville-page').then((m) => m.VillePage),
  },
  // Pages légales : lisibles sans compte.
  {
    path: 'mentions-legales',
    title: 'Mentions légales, StudyQuest',
    loadComponent: () => import('./features/legal/pages-legales').then((m) => m.MentionsPage),
  },
  {
    path: 'confidentialite',
    title: 'Confidentialité, StudyQuest',
    loadComponent: () =>
      import('./features/legal/pages-legales').then((m) => m.ConfidentialitePage),
  },
  {
    path: 'conditions',
    title: 'Conditions d’utilisation, StudyQuest',
    loadComponent: () => import('./features/legal/pages-legales').then((m) => m.ConditionsPage),
  },
  {
    path: 'cours/ecrire',
    title: 'Écrire mes questions, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: ecrirePage,
  },
  {
    path: 'cours/:id/ecrire',
    title: 'Ajouter des notions, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: ecrirePage,
  },
  {
    path: 'cours/:id/examen',
    title: 'Examen blanc, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/session/examen-page').then((m) => m.ExamenPage),
  },
  {
    path: 'cours/:id/cartes',
    title: 'Cartes de révision, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/cours/cartes-page').then((m) => m.CartesPage),
  },
  {
    path: 'cours/:id/fiche',
    title: 'Fiche de révision, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/cours/fiche-page').then((m) => m.FichePage),
  },
  {
    path: 'cours/:id',
    title: 'Mon cours, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/cours/cours-page').then((m) => m.CoursPage),
  },
  {
    path: 'session/reviser',
    title: 'Réviser, StudyQuest',
    canActivate: [compteRequis],
    data: { mission: 'reviser' },
    loadComponent: sessionPage,
  },
  {
    path: 'session/decouvrir',
    title: 'Découvrir, StudyQuest',
    canActivate: [compteRequis],
    data: { mission: 'decouvrir' },
    loadComponent: sessionPage,
  },
  {
    path: 'session/mini',
    title: 'Mini-mission, StudyQuest',
    canActivate: [compteRequis],
    data: { mini: true },
    loadComponent: sessionPage,
  },
  {
    path: 'defi',
    title: 'Défi, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/session/defi-page').then((m) => m.DefiPage),
  },
  {
    path: 'bienvenue',
    title: 'Bienvenue, StudyQuest',
    loadComponent: () => import('./features/compte/bienvenue-page').then((m) => m.BienvenuePage),
  },
  // Anciennes adresses : il n'y a ni inscription, ni connexion, ni import.
  { path: 'connexion', redirectTo: 'bienvenue' },
  { path: 'inscription', redirectTo: 'bienvenue' },
  { path: '**', redirectTo: '' },
];
