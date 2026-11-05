import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CoursService } from '../../core/cours/cours.service';
import { SessionService } from '../../core/session/session.service';

/** Entrer un code de cours ou, avec la route de duel, un code de duel. */
@Component({
  selector: 'sq-rejoindre-page',
  imports: [RouterLink],
  template: `
    @if (duel()) {
      <h1>Rejoindre un duel</h1>
      <p class="intro">
        Entre le code du duel. Il faut avoir déjà reçu le cours sur lequel il porte.
      </p>
    } @else {
      <h1>Rejoindre un cours</h1>
      <p class="intro">
        Entre le code transmis par une personne de ta classe : tu reçois ta propre copie de ses
        questions, et ta progression reste à toi.
      </p>
    }
    <form class="form" novalidate (submit)="envoyer($event)">
      <div class="field">
        <label for="code">{{ duel() ? 'Code du duel' : 'Code du cours' }}</label>
        <input
          #codeInput
          id="code"
          type="text"
          autocomplete="off"
          maxlength="40"
          [value]="code()"
          (input)="code.set(codeInput.value)"
        />
      </div>
      @if (erreur()) {
        <p class="field-error" role="alert">{{ erreur() }}</p>
      }
      <button type="submit" class="btn btn-primary" [disabled]="envoi()">
        {{ duel() ? 'Jouer le duel' : 'Recevoir le cours' }}
      </button>
      <a routerLink="/">Revenir à ma journée</a>
    </form>
  `,
})
export class RejoindrePage {
  /** Fourni par la route. */
  readonly duel = input<boolean>();

  private readonly cours = inject(CoursService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly code = signal('');
  protected readonly erreur = signal('');
  protected readonly envoi = signal(false);

  protected async envoyer(event: Event): Promise<void> {
    event.preventDefault();
    if (this.envoi()) return;
    if (this.code().trim().length === 0) {
      this.erreur.set('Entre le code.');
      return;
    }
    this.envoi.set(true);
    const resultat = this.duel()
      ? await this.session.rejoindreDuel(this.code())
      : await this.cours.rejoindre(this.code());
    this.envoi.set(false);
    if ('id' in resultat)
      await this.router.navigate([this.duel() ? '/duel' : '/cours', resultat.id]);
    else this.erreur.set(resultat.erreur);
  }
}
