import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/** Ni compte ni e-mail : une déclaration d'âge, puis tout reste dans ce navigateur. */
@Component({
  selector: 'sq-bienvenue-page',
  imports: [RouterLink],
  template: `
    <h1>Bienvenue sur StudyQuest</h1>
    <p class="intro">
      Tes cours deviennent une ville à construire, une révision à la fois. Sans compte ni adresse
      e-mail.
    </p>
    <form class="form" novalidate (submit)="commencer($event)">
      <label class="case">
        <input
          #caseAge
          type="checkbox"
          [checked]="age()"
          [attr.aria-describedby]="erreur() ? 'erreur' : null"
          (change)="age.set(caseAge.checked)"
        />
        J’ai 15 ans ou plus
      </label>
      <p class="hint">
        Ta progression est gardée pour ce navigateur, sur cet appareil. Si tu effaces les données du
        navigateur ou changes d’appareil, tu repars de zéro.
      </p>
      @if (erreur()) {
        <p id="erreur" class="field-error" role="alert">{{ erreur() }}</p>
      }
      <button type="submit" class="btn btn-primary" [disabled]="envoi()">
        {{ envoi() ? 'Un instant…' : 'Commencer' }}
      </button>
      <p class="hint">
        En commençant, tu acceptes les
        <a routerLink="/conditions">conditions d’utilisation</a>. Ce que deviennent tes données :
        <a routerLink="/confidentialite">confidentialité</a>.
      </p>
    </form>
  `,
})
export class BienvenuePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly age = signal(false);
  protected readonly erreur = signal('');
  protected readonly envoi = signal(false);

  /** Une session déjà ouverte dans ce navigateur mène directement à la journée. */
  async ngOnInit(): Promise<void> {
    await this.auth.whenReady;
    if (this.auth.userId()) await this.router.navigateByUrl('/');
  }

  protected async commencer(event: Event): Promise<void> {
    event.preventDefault();
    if (this.envoi()) return;
    if (!this.age()) {
      this.erreur.set('StudyQuest est réservé aux personnes de 15 ans et plus.');
      return;
    }
    this.envoi.set(true);
    const resultat = await this.auth.commencer();
    this.envoi.set(false);
    if (resultat.ok) await this.router.navigateByUrl('/');
    else this.erreur.set(resultat.message);
  }
}
