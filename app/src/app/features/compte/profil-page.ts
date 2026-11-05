import { Component, OnInit, computed, inject, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AVATARS } from '../../core/avatars';
import { SessionService, niveau } from '../../core/session/session.service';
import { Avatar } from '../../shared/avatar';

@Component({
  selector: 'sq-profil-page',
  imports: [Avatar],
  template: `
    <h1>Mon profil</h1>
    <p class="intro">{{ auth.user()?.email }}</p>

    <form class="form" novalidate (submit)="enregistrer($event)">
      <div class="field">
        <label for="pseudo">Pseudo</label>
        <input
          #champ
          id="pseudo"
          type="text"
          maxlength="30"
          autocomplete="nickname"
          [value]="pseudo()"
          (input)="pseudo.set(champ.value)"
        />
      </div>
      <button type="submit" class="btn btn-secondary">Enregistrer</button>
      <p role="status" class="hint">{{ message() }}</p>
    </form>

    <fieldset class="bloc avatars">
      <legend>Ton avatar</legend>
      <p class="hint">Visible par toi seulement. Un nouveau à chaque niveau, jusqu’au niveau 6.</p>
      @for (a of avatars; track a.nom; let i = $index) {
        <label class="avatar-choix">
          <input
            type="radio"
            name="avatar"
            [checked]="auth.profile()?.avatar === i"
            [disabled]="a.niveau > niveauActuel()"
            (change)="choisir(i)"
          />
          <sq-avatar [numero]="i" [class.verrou]="a.niveau > niveauActuel()" />
          <span class="avatar-nom">
            {{ a.nom }}
            @if (a.niveau > niveauActuel()) {
              <small>Niveau {{ a.niveau }}</small>
            }
          </span>
        </label>
      }
    </fieldset>
    <p role="status" class="hint">{{ messageAvatar() }}</p>

    <section class="bloc" aria-labelledby="session">
      <h2 id="session">Session</h2>
      <button type="button" class="btn btn-secondary" (click)="deconnecter()">
        Me déconnecter
      </button>
    </section>

    <section class="bloc" aria-labelledby="suppression">
      <h2 id="suppression">Supprimer mon compte</h2>
      <p class="hint">Ton compte et tout ce qui s’y rattache sont effacés définitivement.</p>
      @if (confirmation()) {
        <button type="button" class="btn btn-danger" (click)="supprimer()">
          Oui, tout supprimer
        </button>
        <button type="button" class="btn btn-secondary" (click)="confirmation.set(false)">
          Annuler
        </button>
      } @else {
        <button type="button" class="btn btn-danger" (click)="confirmation.set(true)">
          Supprimer mon compte
        </button>
      }
      <p role="alert" class="field-error">{{ erreur() }}</p>
    </section>
  `,
})
export class ProfilPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  protected readonly avatars = AVATARS;
  private readonly xp = signal(0);
  protected readonly niveauActuel = computed(() => niveau(this.xp()));
  protected readonly messageAvatar = signal('');

  async ngOnInit(): Promise<void> {
    this.xp.set((await this.session.journee())?.xp_total ?? 0);
  }

  protected async choisir(avatar: number): Promise<void> {
    const ok = await this.auth.choisirAvatar(avatar);
    this.messageAvatar.set(ok ? 'Avatar enregistré.' : 'Cet avatar n’a pas pu être choisi.');
  }
  protected readonly pseudo = linkedSignal(() => this.auth.profile()?.pseudo ?? '');
  protected readonly message = signal('');
  protected readonly erreur = signal('');
  protected readonly confirmation = signal(false);

  protected async enregistrer(event: Event): Promise<void> {
    event.preventDefault();
    const pseudo = this.pseudo().trim();
    if (pseudo.length === 0 || pseudo.length > 30) {
      this.message.set('Choisis un pseudo (30 caractères au plus).');
      return;
    }
    const result = await this.auth.updatePseudo(pseudo);
    this.message.set(result.ok ? 'Pseudo enregistré.' : result.message);
  }

  protected async deconnecter(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/connexion');
  }

  protected async supprimer(): Promise<void> {
    const result = await this.auth.deleteAccount();
    if (result.ok) await this.router.navigateByUrl('/inscription');
    else this.erreur.set(result.message);
  }
}
