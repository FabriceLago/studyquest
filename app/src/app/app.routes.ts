import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

/** Le contenu de l'élève demande un compte : sans session, direction la connexion. */
const compteRequis: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady;
  return auth.userId() ? true : router.parseUrl('/connexion');
};

const authPage = () => import('./features/compte/auth-page').then((m) => m.AuthPage);
const sessionPage = () => import('./features/session/session-page').then((m) => m.SessionPage);

export const routes: Routes = [
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
    title: 'Conditions d’utilisation et de vente, StudyQuest',
    loadComponent: () => import('./features/legal/pages-legales').then((m) => m.ConditionsPage),
  },
  {
    path: 'abonnement',
    title: 'Abonnement, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () =>
      import('./features/abonnement/abonnement-page').then((m) => m.AbonnementPage),
  },
  {
    path: 'groupes',
    title: 'Mes groupes, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/groupes/groupes-page').then((m) => m.GroupesPage),
  },
  {
    path: 'groupes/:id',
    title: 'Classement du groupe, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/groupes/groupe-page').then((m) => m.GroupePage),
  },
  {
    path: 'cours/importer',
    title: 'Importer un cours, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/cours/importer-page').then((m) => m.ImporterPage),
  },
  {
    path: 'cours/rejoindre',
    title: 'Rejoindre un cours, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/cours/rejoindre-page').then((m) => m.RejoindrePage),
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
    path: 'duel/rejoindre',
    title: 'Rejoindre un duel, StudyQuest',
    canActivate: [compteRequis],
    data: { duel: true },
    loadComponent: () => import('./features/cours/rejoindre-page').then((m) => m.RejoindrePage),
  },
  {
    path: 'duel/:id',
    title: 'Duel, StudyQuest',
    canActivate: [compteRequis],
    loadComponent: () => import('./features/session/duel-page').then((m) => m.DuelPage),
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
    path: 'connexion',
    title: 'Connexion, StudyQuest',
    data: { mode: 'connexion' },
    loadComponent: authPage,
  },
  {
    path: 'inscription',
    title: 'Inscription, StudyQuest',
    data: { mode: 'inscription' },
    loadComponent: authPage,
  },
  { path: '**', redirectTo: '' },
];
