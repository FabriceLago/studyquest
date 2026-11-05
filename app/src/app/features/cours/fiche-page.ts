import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cours, CoursService, NotionVue, extraitsUniques } from '../../core/cours/cours.service';

/** À imprimer ou à enregistrer en PDF avec le navigateur : voir @media print dans styles.css. */
@Component({
  selector: 'sq-fiche-page',
  imports: [RouterLink],
  template: `
    @if (cours(); as c) {
      <h1>Fiche : {{ c.titre }}</h1>
      <button type="button" class="btn btn-secondary bloc sans-impression" (click)="imprimer()">
        Imprimer ou enregistrer en PDF
      </button>
      @for (notion of notions(); track notion.id) {
        <section class="notion fiche" [attr.aria-labelledby]="'f-' + notion.id">
          <h2 [id]="'f-' + notion.id">{{ notion.titre }}</h2>
          <p class="carte-fiche">
            <strong>{{ notion.carte_recto }}</strong> : {{ notion.carte_verso }}
          </p>
          <ul class="extraits">
            @for (extrait of extraits(notion); track extrait) {
              <li>{{ extrait }}</li>
            }
          </ul>
        </section>
      }
      <p class="bloc sans-impression"><a [routerLink]="['/cours', id()]">Revenir au cours</a></p>
    } @else if (charge()) {
      <h1>Cours introuvable</h1>
      <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class FichePage implements OnInit {
  /** Fourni par la route. */
  readonly id = input.required<string>();

  private readonly service = inject(CoursService);
  protected readonly cours = signal<Cours | null>(null);
  protected readonly notions = signal<NotionVue[]>([]);
  protected readonly charge = signal(false);
  protected extraits = extraitsUniques;

  async ngOnInit(): Promise<void> {
    const [cours, notions] = await Promise.all([
      this.service.lire(this.id()),
      this.service.notions(this.id()),
    ]);
    this.cours.set(cours);
    this.notions.set(notions);
    this.charge.set(true);
  }

  protected imprimer(): void {
    window.print();
  }
}
