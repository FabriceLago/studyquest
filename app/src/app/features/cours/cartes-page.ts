import { Component, Injector, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoursService, NotionVue } from '../../core/cours/cours.service';
import { concentrerTitre } from '../session/concentrer';

/** Spécification § 3 : révision libre, sans XP ni effet sur les missions. Rien ne part au serveur. */
@Component({
  selector: 'sq-cartes-page',
  imports: [RouterLink],
  template: `
    @if (carte(); as c) {
      <div class="entete">
        <a class="fermer" [routerLink]="['/cours', id()]" aria-label="Quitter">×</a>
        <div class="progres" aria-hidden="true">
          <i [style.width.%]="((i() + 1) / notions().length) * 100"></i>
        </div>
        <span class="compte">{{ i() + 1 }}/{{ notions().length }}</span>
      </div>
      <p class="sur">{{ c.titre }}</p>
      <h1 tabindex="-1">{{ c.carte_recto }}</h1>
      @if (retournee()) {
        <p class="verso" role="status">{{ c.carte_verso }}</p>
        <button type="button" class="btn btn-primary bloc" (click)="aller(i() + 1)">
          {{ i() + 1 < notions().length ? 'Carte suivante' : 'Recommencer' }}
        </button>
      } @else {
        <button type="button" class="btn btn-primary bloc" (click)="retournee.set(true)">
          Voir le verso
        </button>
      }
      @if (i() > 0) {
        <button type="button" class="btn btn-secondary bloc" (click)="aller(i() - 1)">
          Carte précédente
        </button>
      }
      <p class="hint bloc">Révision libre : les cartes ne rapportent pas d’XP.</p>
    } @else if (charge()) {
      <h1>Aucune carte pour ce cours</h1>
      <p class="bloc"><a [routerLink]="['/cours', id()]">Revenir au cours</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class CartesPage implements OnInit {
  /** Fourni par la route. */
  readonly id = input.required<string>();

  private readonly service = inject(CoursService);
  private readonly injector = inject(Injector);
  protected readonly notions = signal<NotionVue[]>([]);
  protected readonly i = signal(0);
  protected readonly carte = computed<NotionVue | undefined>(() => this.notions()[this.i()]);
  protected readonly retournee = signal(false);
  protected readonly charge = signal(false);

  async ngOnInit(): Promise<void> {
    this.notions.set(await this.service.notions(this.id()));
    this.charge.set(true);
    concentrerTitre(this.injector);
  }

  protected aller(i: number): void {
    this.i.set(i < this.notions().length ? i : 0);
    this.retournee.set(false);
    concentrerTitre(this.injector);
  }
}
