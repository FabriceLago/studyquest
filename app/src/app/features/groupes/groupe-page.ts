import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Classement, GroupesService } from '../../core/groupes/groupes.service';
import { CONFIDENTIALITE } from './groupes-page';

/** Le classement de la semaine d'un groupe. Modération pour la personne qui l'a créé. */
@Component({
  selector: 'sq-groupe-page',
  imports: [RouterLink],
  template: `
    @if (classement(); as c) {
      <h1 tabindex="-1">{{ c.nom }}</h1>
      <p class="hint">Classement de la semaine, remis à zéro lundi.</p>
      <ol class="classement bloc">
        @for (m of c.membres; track $index) {
          <li class="rang" [class.moi]="m.moi">
            <b>{{ $index + 1 }}</b>
            <span>{{ m.pseudo }}{{ m.moi ? ' (toi)' : '' }}</span>
            <small>{{ m.serie }} j</small>
            <strong>{{ m.xp }} XP</strong>
            @if (c.createur && m.id && !m.moi) {
              <button
                type="button"
                class="lien"
                [attr.aria-label]="'Retirer ' + m.pseudo"
                (click)="retirer(m.id, m.pseudo)"
              >
                Retirer
              </button>
            }
          </li>
        }
      </ol>
      <p class="code-ligne">
        Code d’invitation : <strong class="code-partage">{{ c.code }}</strong>
      </p>
      <button type="button" class="btn btn-secondary" (click)="copier(c.code)">
        Copier le code
      </button>
      <p class="hint bloc">{{ confidentialite }}</p>
      <p class="hint" role="status">{{ message() }}</p>

      @if (c.createur) {
        <button type="button" class="lien" (click)="changerCode()">Changer le code</button>
        <p class="hint">L’ancien code ne permettra plus d’entrer. Les membres restent.</p>
      }
      <section class="bloc" aria-labelledby="sortie">
        <h2 id="sortie">{{ c.createur ? 'Supprimer le groupe' : 'Quitter le groupe' }}</h2>
        @if (confirmation()) {
          <button type="button" class="btn btn-danger" (click)="sortir(c.createur)">
            {{ c.createur ? 'Oui, supprimer le groupe' : 'Oui, quitter le groupe' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="confirmation.set(false)">
            Annuler
          </button>
        } @else {
          <button type="button" class="btn btn-danger" (click)="confirmation.set(true)">
            {{ c.createur ? 'Supprimer le groupe' : 'Quitter le groupe' }}
          </button>
        }
      </section>
    } @else if (charge()) {
      <h1>Groupe introuvable</h1>
      <p class="intro">Ce groupe n’existe plus, ou tu n’en fais plus partie.</p>
    }
    <p class="bloc"><a routerLink="/groupes">Mes groupes</a></p>
  `,
})
export class GroupePage implements OnInit {
  /** Fourni par la route. */
  readonly id = input.required<string>();

  private readonly service = inject(GroupesService);
  private readonly router = inject(Router);
  protected readonly confidentialite = CONFIDENTIALITE;
  protected readonly classement = signal<Classement | null>(null);
  protected readonly charge = signal(false);
  protected readonly message = signal('');
  protected readonly confirmation = signal(false);

  async ngOnInit(): Promise<void> {
    await this.charger();
  }

  private async charger(): Promise<void> {
    this.classement.set(await this.service.classement(this.id()));
    this.charge.set(true);
  }

  protected async copier(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.message.set('Code copié.');
    } catch {
      this.message.set('La copie n’a pas marché : recopie le code à la main.');
    }
  }

  protected async retirer(membre: string, pseudo: string): Promise<void> {
    const ok = await this.service.retirer(this.id(), membre);
    this.message.set(ok ? `${pseudo} ne fait plus partie du groupe.` : 'Le retrait a échoué.');
    await this.charger();
  }

  protected async changerCode(): Promise<void> {
    const code = await this.service.changerCode(this.id());
    this.message.set(code ? `Nouveau code : ${code}.` : 'Le changement de code a échoué.');
    await this.charger();
  }

  protected async sortir(createur: boolean): Promise<void> {
    const ok = createur
      ? await this.service.supprimer(this.id())
      : await this.service.quitter(this.id());
    if (ok) await this.router.navigateByUrl('/groupes');
    else this.message.set('La demande a échoué. Réessaie plus tard.');
  }
}
