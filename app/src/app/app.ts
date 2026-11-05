import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'sq-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="barre">
      <a class="marque" routerLink="/">StudyQuest</a>
      @if (auth.userId()) {
        <nav aria-label="Navigation principale">
          <a
            routerLink="/"
            routerLinkActive="actif"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: true }"
            >Aujourd’hui</a
          >
          <a routerLink="/ville" routerLinkActive="actif" ariaCurrentWhenActive="page">Ma ville</a>
          <a routerLink="/profil" routerLinkActive="actif" ariaCurrentWhenActive="page">Profil</a>
        </nav>
      }
    </header>
    <main><router-outlet /></main>
    <footer class="pied">
      <a routerLink="/mentions-legales">Mentions légales</a>
      <a routerLink="/confidentialite">Confidentialité</a>
      <a routerLink="/conditions">Conditions</a>
    </footer>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
