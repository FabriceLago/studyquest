import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  Cours,
  CoursService,
  NotionVue,
  aujourdhuiIso,
  libelleExamen,
} from '../../core/cours/cours.service';

const TYPES: Record<string, string> = {
  unique: 'Choix unique',
  multiple: 'Choix multiple',
  vrai_faux: 'Vrai ou faux',
};

@Component({
  selector: 'sq-cours-page',
  imports: [RouterLink],
  template: `
    @if (cours(); as c) {
      <h1>{{ c.titre }}</h1>
      <p class="intro" role="status">{{ total() }} questions prêtes.</p>
      <a class="btn btn-secondary bloc" [routerLink]="['/cours', c.id, 'ecrire']">
        Ajouter des notions
      </a>

      <section class="bloc" aria-labelledby="t-examen">
        <h2 id="t-examen">Date d’examen</h2>
        <p class="hint">
          Tant qu’elle est à venir, ce cours passe en premier et ses questions reviennent plus
          souvent.
        </p>
        <form class="bloc" novalidate (submit)="enregistrerExamen($event, dateInput.value)">
          <div class="field">
            <label for="date-examen">Mon examen a lieu le</label>
            <input
              #dateInput
              id="date-examen"
              type="date"
              [min]="aujourdhui"
              [value]="c.date_examen ?? ''"
            />
          </div>
          <button type="submit" class="btn btn-secondary">Enregistrer la date</button>
        </form>
        @if (examen(); as libelle) {
          <p role="status">{{ libelle }}</p>
          <button type="button" class="lien" (click)="retirerExamen()">Retirer la date</button>
        }
        @if (erreurExamen()) {
          <p class="field-error" role="alert">{{ erreurExamen() }}</p>
        }
      </section>

      <section class="bloc" aria-labelledby="t-blanc">
        <h2 id="t-blanc">Examen blanc</h2>
        <p class="hint">
          20 questions au maximum, 1 minute par question, une fois par jour. Le chrono démarre à
          l’ouverture. Tu obtiens un score par notion, sans XP.
        </p>
        <a class="btn btn-secondary" [routerLink]="['/cours', c.id, 'examen']">
          Passer un examen blanc
        </a>
      </section>

      <section class="bloc" aria-labelledby="t-autres">
        <h2 id="t-autres">Réviser autrement</h2>
        <a class="btn btn-secondary" [routerLink]="['/cours', c.id, 'cartes']">
          Réviser avec les cartes
        </a>
        <a class="btn btn-secondary" [routerLink]="['/cours', c.id, 'fiche']">
          Voir la fiche à imprimer
        </a>
      </section>

      @for (notion of notions(); track notion.id) {
        <section class="notion" [attr.aria-labelledby]="'n-' + notion.id">
          <h2 [id]="'n-' + notion.id">{{ notion.titre }}</h2>
          <ul class="questions">
            @for (question of notion.questions; track question.id) {
              <li>
                <p class="hint">{{ libelle(question.type) }}</p>
                <p>{{ question.enonce }}</p>
                <button
                  type="button"
                  class="lien"
                  [attr.aria-label]="'Retirer : ' + question.enonce"
                  (click)="retirer(question.id)"
                >
                  Retirer
                </button>
              </li>
            }
          </ul>
          <p class="hint">Carte : {{ notion.carte_recto }} → {{ notion.carte_verso }}</p>
        </section>
      }

      <button type="button" class="btn btn-danger bloc" (click)="supprimer()">
        Supprimer ce cours
      </button>
      <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
    } @else if (charge()) {
      <h1>Cours introuvable</h1>
      <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class CoursPage implements OnInit {
  /** Fourni par la route. */
  readonly id = input.required<string>();

  private readonly service = inject(CoursService);
  private readonly router = inject(Router);

  protected readonly cours = signal<Cours | null>(null);
  protected readonly notions = signal<NotionVue[]>([]);
  protected readonly charge = signal(false);
  protected readonly total = computed(() =>
    this.notions().reduce((n, x) => n + x.questions.length, 0),
  );
  protected libelle = (type: string) => TYPES[type] ?? type;
  protected readonly aujourdhui = aujourdhuiIso();
  protected readonly examen = computed(() => libelleExamen(this.cours()?.date_examen ?? null));
  protected readonly erreurExamen = signal('');

  ngOnInit(): void {
    void this.actualiser();
  }

  private async actualiser(): Promise<void> {
    const [cours, notions] = await Promise.all([
      this.service.lire(this.id()),
      this.service.notions(this.id()),
    ]);
    this.cours.set(cours);
    this.notions.set(notions);
    this.charge.set(true);
  }

  protected async enregistrerExamen(event: Event, date: string): Promise<void> {
    event.preventDefault();
    if (!date || !(await this.service.fixerExamen(this.id(), date))) {
      this.erreurExamen.set('Choisis une date à venir, dans moins d’un an.');
      return;
    }
    this.erreurExamen.set('');
    await this.actualiser();
  }

  protected async retirerExamen(): Promise<void> {
    if (await this.service.fixerExamen(this.id(), null)) await this.actualiser();
  }

  protected async retirer(id: string): Promise<void> {
    if (await this.service.supprimerQuestion(id)) {
      this.notions.update((notions) =>
        notions.map((n) => ({ ...n, questions: n.questions.filter((q) => q.id !== id) })),
      );
    }
  }

  protected async supprimer(): Promise<void> {
    if (await this.service.supprimerCours(this.id())) await this.router.navigateByUrl('/');
  }
}
