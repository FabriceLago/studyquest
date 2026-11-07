import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  Cours,
  CoursService,
  NotionVue,
  Statut,
  aujourdhuiIso,
  libelleExamen,
} from '../../core/cours/cours.service';
import { SessionService } from '../../core/session/session.service';

const ETAPES: Partial<Record<Statut, string>> = {
  en_attente: 'Préparation de ton cours…',
  transcription: 'Lecture de ton document…',
  generation: 'Création des questions…',
};
const TYPES: Record<string, string> = {
  unique: 'Choix unique',
  multiple: 'Choix multiple',
  vrai_faux: 'Vrai ou faux',
  association: 'Association',
  classement: 'Classement',
};
const REPRISE_MS = 10 * 60 * 1000;

@Component({
  selector: 'sq-cours-page',
  imports: [RouterLink],
  template: `
    @if (cours(); as c) {
      <h1>{{ c.titre }}</h1>

      @if (etape(); as texte) {
        <p class="intro" role="status">{{ texte }}</p>
        <p class="hint">Tu peux quitter cette page : l’import continue.</p>
        @if (bloque()) {
          <button type="button" class="btn btn-secondary bloc" (click)="relancer()">
            Relancer l’import
          </button>
        }
      }

      @switch (c.statut) {
        @case ('a_relire') {
          <form class="form" (submit)="generer($event)">
            <div class="field">
              <label for="texte">Texte lu sur tes photos</label>
              <p id="texte-aide" class="hint">
                Corrige ce qui est mal lu : les questions partiront de ce texte.
              </p>
              <textarea
                #texteInput
                id="texte"
                rows="14"
                aria-describedby="texte-aide"
                [value]="texte()"
                (input)="texte.set(texteInput.value)"
              ></textarea>
            </div>
            @if (erreur()) {
              <p class="field-error" role="alert">{{ erreur() }}</p>
            }
            <button type="submit" class="btn btn-primary">Créer mes questions</button>
          </form>
        }
        @case ('echec') {
          <p class="field-error bloc" role="alert">{{ c.raison }}</p>
          <a class="btn btn-primary bloc" routerLink="/cours/importer">Importer à nouveau</a>
        }
        @case ('pret') {
          <p class="intro" role="status">
            {{ total() }} questions prêtes.{{
              c.format === 'manuel' ? '' : ' Retire celles qui te semblent fausses.'
            }}
          </p>
          @if (c.format === 'manuel' && !c.partage_de) {
            <a class="btn btn-secondary bloc" [routerLink]="['/cours', c.id, 'ecrire']">
              Ajouter des notions
            </a>
          }

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

          <section class="bloc" aria-labelledby="t-partage">
            <h2 id="t-partage">Partager avec ma classe</h2>
            @if (c.partage_de) {
              <p class="hint">Tu as reçu ce cours avec un code de partage.</p>
            } @else if (c.code_partage; as code) {
              <p>
                Code à transmettre : <strong class="code-partage">{{ code }}</strong>
              </p>
              <p class="hint">
                50 personnes au maximum. Chacune reçoit sa propre copie des questions, et garde
                cette copie si tu arrêtes le partage.
              </p>
              <button type="button" class="lien" (click)="arreterPartage()">
                Arrêter le partage
              </button>
            } @else {
              <label class="case">
                <input
                  #droit
                  type="checkbox"
                  [checked]="droitPartage()"
                  (change)="droitPartage.set(droit.checked)"
                />
                Ce cours vient de moi, ou j’ai le droit de le partager avec ma classe.
              </label>
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="!droitPartage()"
                (click)="partager()"
              >
                Obtenir un code
              </button>
            }
            @if (erreurPartage()) {
              <p class="field-error" role="alert">{{ erreurPartage() }}</p>
            }
            @if (c.code_partage || c.partage_de) {
              <p class="hint">
                Un duel : 10 questions, 30 secondes chacune, à jouer chacun quand il veut.
              </p>
              <button type="button" class="btn btn-secondary" (click)="creerDuel()">
                Défier un ami sur ce cours
              </button>
            }
          </section>

          @for (notion of notions(); track notion.id) {
            <section class="notion" [attr.aria-labelledby]="'n-' + notion.id">
              <h2 [id]="'n-' + notion.id">{{ notion.titre }}</h2>
              <ul class="questions">
                @for (question of notion.questions; track question.id) {
                  <li>
                    <p class="hint">{{ libelle(question.type) }}</p>
                    <p>{{ question.enonce }}</p>
                    @if (question.extrait) {
                      <blockquote>{{ question.extrait }}</blockquote>
                    }
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
        }
      }

      @if (c.statut === 'a_relire' || c.statut === 'echec' || c.statut === 'pret') {
        <button type="button" class="btn btn-danger bloc" (click)="supprimer()">
          Supprimer ce cours
        </button>
      }
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
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private minuteur: ReturnType<typeof setTimeout> | undefined;

  protected readonly cours = signal<Cours | null>(null);
  protected readonly notions = signal<NotionVue[]>([]);
  protected readonly texte = signal('');
  protected readonly erreur = signal('');
  protected readonly charge = signal(false);
  protected readonly etape = computed(() => ETAPES[this.cours()?.statut ?? 'pret']);
  protected readonly total = computed(() =>
    this.notions().reduce((n, x) => n + x.questions.length, 0),
  );
  protected readonly bloque = computed(() => {
    const c = this.cours();
    return (
      !!c &&
      !!ETAPES[c.statut] &&
      Date.now() - Date.parse(c.updated_at) > (c.statut === 'en_attente' ? 30_000 : REPRISE_MS)
    );
  });
  protected libelle = (type: string) => TYPES[type] ?? type;
  protected readonly aujourdhui = aujourdhuiIso();
  protected readonly examen = computed(() => libelleExamen(this.cours()?.date_examen ?? null));
  protected readonly erreurExamen = signal('');
  protected readonly droitPartage = signal(false);
  protected readonly erreurPartage = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.minuteur));
  }

  ngOnInit(): void {
    void this.actualiser();
  }

  private async actualiser(): Promise<void> {
    const precedent = this.cours()?.statut;
    const cours = await this.service.lire(this.id());
    this.cours.set(cours);
    this.charge.set(true);
    if (cours?.statut === 'a_relire' && precedent !== 'a_relire') this.texte.set(cours.texte ?? '');
    if (cours?.statut === 'pret' && precedent !== 'pret')
      this.notions.set(await this.service.notions(this.id()));
    // Le statut est relu tant que le serveur travaille.
    if (cours && ETAPES[cours.statut])
      this.minuteur = setTimeout(() => void this.actualiser(), 2000);
  }

  protected async relancer(): Promise<void> {
    await this.service.lancer(this.id());
    clearTimeout(this.minuteur);
    await this.actualiser();
  }

  protected async generer(event: Event): Promise<void> {
    event.preventDefault();
    const texte = this.texte();
    if (texte.trim().length === 0 || !(await this.service.corriger(this.id(), texte))) {
      this.erreur.set('Ce texte n’a pas pu être enregistré. Vérifie qu’il n’est pas vide.');
      return;
    }
    this.erreur.set('');
    await this.relancer();
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

  protected async partager(): Promise<void> {
    const reussi = this.droitPartage() && (await this.service.partager(this.id()));
    this.erreurPartage.set(reussi ? '' : 'Le code n’a pas pu être créé. Réessaie plus tard.');
    if (reussi) await this.actualiser();
  }

  protected async creerDuel(): Promise<void> {
    const resultat = await this.session.creerDuel(this.id());
    if ('id' in resultat) await this.router.navigate(['/duel', resultat.id]);
    else this.erreurPartage.set(resultat.erreur);
  }

  protected async arreterPartage(): Promise<void> {
    if (await this.service.arreterPartage(this.id())) {
      this.droitPartage.set(false);
      await this.actualiser();
    }
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
