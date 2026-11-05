import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Groupe, GroupesService } from '../../core/groupes/groupes.service';

export const CONFIDENTIALITE =
  'Le groupe voit ton pseudo, ton XP de la semaine et ta série. Jamais tes cours.';

/** Mes groupes, en rejoindre un avec son code, en créer un. */
@Component({
  selector: 'sq-groupes-page',
  imports: [RouterLink],
  template: `
    <h1>Mes groupes</h1>
    <p class="intro">
      Un classement de la semaine, avec ta classe ou tes amis. {{ confidentialite }}
    </p>
    @if (groupes().length > 0) {
      <ul class="liste-cours">
        @for (g of groupes(); track g.id) {
          <li>
            <a [routerLink]="['/groupes', g.id]">{{ g.nom }}</a>
          </li>
        }
      </ul>
    }

    <h2 class="bloc">Rejoindre un groupe</h2>
    <form class="form" novalidate (submit)="rejoindre($event)">
      <div class="field">
        <label for="code">Code du groupe</label>
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
      @if (erreurCode()) {
        <p class="field-error" role="alert">{{ erreurCode() }}</p>
      }
      <button type="submit" class="btn btn-primary" [disabled]="envoi()">Rejoindre</button>
    </form>

    <h2 class="bloc">Créer un groupe</h2>
    <form class="form" novalidate (submit)="creer($event)">
      <div class="field">
        <label for="nom">Nom du groupe</label>
        <input
          #nomInput
          id="nom"
          type="text"
          autocomplete="off"
          maxlength="60"
          [value]="nom()"
          (input)="nom.set(nomInput.value)"
        />
      </div>
      @if (erreurNom()) {
        <p class="field-error" role="alert">{{ erreurNom() }}</p>
      }
      <button type="submit" class="btn btn-secondary" [disabled]="envoi()">Créer le groupe</button>
    </form>
    <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
  `,
})
export class GroupesPage implements OnInit {
  private readonly service = inject(GroupesService);
  private readonly router = inject(Router);
  protected readonly confidentialite = CONFIDENTIALITE;
  protected readonly groupes = signal<Groupe[]>([]);
  protected readonly code = signal('');
  protected readonly nom = signal('');
  protected readonly erreurCode = signal('');
  protected readonly erreurNom = signal('');
  protected readonly envoi = signal(false);

  async ngOnInit(): Promise<void> {
    this.groupes.set(await this.service.mesGroupes());
  }

  protected async rejoindre(event: Event): Promise<void> {
    event.preventDefault();
    if (this.envoi()) return;
    if (this.code().trim().length === 0) {
      this.erreurCode.set('Entre le code.');
      return;
    }
    await this.ouvrir(() => this.service.rejoindre(this.code()), this.erreurCode);
  }

  protected async creer(event: Event): Promise<void> {
    event.preventDefault();
    if (this.envoi()) return;
    const nom = this.nom().trim();
    if (nom.length === 0 || nom.length > 60) {
      this.erreurNom.set('Donne au groupe un nom de 60 caractères au plus.');
      return;
    }
    await this.ouvrir(() => this.service.creer(nom), this.erreurNom);
  }

  private async ouvrir(
    action: () => Promise<{ id: string } | { erreur: string }>,
    erreur: typeof this.erreurCode,
  ): Promise<void> {
    this.envoi.set(true);
    const resultat = await action();
    this.envoi.set(false);
    if ('id' in resultat) await this.router.navigate(['/groupes', resultat.id]);
    else erreur.set(resultat.erreur);
  }
}
