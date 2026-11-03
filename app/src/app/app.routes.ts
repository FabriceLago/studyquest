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
