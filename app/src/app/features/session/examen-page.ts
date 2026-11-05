import {
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  QuestionMission,
  ScoreExamen,
  SessionService,
  duree,
  messageNotionFaible,
} from '../../core/session/session.service';
import { concentrerTitre } from './concentrer';
import { SaisieQuestion } from './saisie-question';

/** Un examen blanc : rien n'est corrigé avant la fin, et le résultat reste un score par notion. */
@Component({
  selector: 'sq-examen-page',
  imports: [RouterLink, SaisieQuestion],
  template: `
    @if (score(); as s) {
      <p class="sur">Examen blanc terminé</p>
      <h1 tabindex="-1">{{ s.justes }}/{{ s.total }}</h1>
      <ul class="liste-cours bloc">
        @for (notion of s.notions; track notion.titre) {
          <li>
            <span>{{ notion.titre }}</span>
            <strong>{{ notion.justes }}/{{ notion.total }}</strong>
          </li>
        }
      </ul>
      <p class="hint bloc">
        Pas de correction question par question : elle te donnerait les réponses de tes prochaines
        révisions. Un nouvel examen blanc sera possible demain.
      </p>
      @if (notionFaible()) {
        <p class="bloc" role="status">{{ notionFaible() }}</p>
      } @else if (s.justes < s.total) {
        <button type="button" class="btn btn-secondary bloc" (click)="reviserNotionFaible()">
          Réviser ma notion la plus faible
        </button>
      }
      <a class="btn btn-primary bloc" [routerLink]="['/cours', id()]">Revenir au cours</a>
    } @else if (question(); as q) {
      <div class="entete">
        <a class="fermer" [routerLink]="['/cours', id()]" aria-label="Quitter">×</a>
        <div
          class="progres"
          role="progressbar"
          aria-label="Progression"
          [attr.aria-valuenow]="position() - 1"
          aria-valuemin="0"
          [attr.aria-valuemax]="total()"
        >
          <i [style.width.%]="((position() - 1) / total()) * 100"></i>
        </div>
        <span class="compte">{{ position() }}/{{ total() }}</span>
      </div>
      <p
        class="chrono"
        [class.urgent]="reste() <= 60"
        role="timer"
        aria-label="Temps restant, en minutes et secondes"
      >
        {{ affichage() }}
      </p>
      <p class="sur bloc">{{ q.notion }}</p>
      <h1 tabindex="-1">{{ q.enonce }}</h1>
      <sq-saisie-question [question]="q" [fige]="envoi()" />
      @if (erreur()) {
        <p class="field-error bloc" role="alert">{{ erreur() }}</p>
      }
      <button
        type="button"
        class="btn btn-primary bloc"
        [disabled]="!saisie()?.reponse() || envoi()"
        (click)="valider()"
      >
        {{ i() + 1 < questions().length ? 'Question suivante' : 'Voir mon score' }}
      </button>
      <button
        type="button"
        class="btn btn-secondary bloc"
        [disabled]="envoi()"
        (click)="suivante()"
      >
        Passer cette question
      </button>
    } @else if (charge() && !occupe()) {
      <h1>Examen blanc indisponible</h1>
      <p class="intro">Ce cours n’a pas de questions à proposer pour l’instant.</p>
      <p class="bloc"><a [routerLink]="['/cours', id()]">Revenir au cours</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class ExamenPage implements OnInit {
  /** Fourni par la route. */
  readonly id = input.required<string>();

  private readonly service = inject(SessionService);
  private readonly injector = inject(Injector);
  private minuteur: ReturnType<typeof setInterval> | undefined;
  private examen = '';
  private fin = 0;
  private fini = false;

  protected readonly saisie = viewChild(SaisieQuestion);
  protected readonly questions = signal<QuestionMission[]>([]);
  protected readonly i = signal(0);
  protected readonly total = signal(0);
  protected readonly question = computed<QuestionMission | undefined>(
    () => this.questions()[this.i()],
  );
  /** Tient compte des questions déjà répondues avant une reprise. */
  protected readonly position = computed(
    () => this.total() - this.questions().length + this.i() + 1,
  );
  protected readonly reste = signal(0);
  protected readonly affichage = computed(() => duree(this.reste()));
  protected readonly score = signal<ScoreExamen | null>(null);
  protected readonly notionFaible = signal('');
  protected readonly envoi = signal(false);
  protected readonly erreur = signal('');
  protected readonly charge = signal(false);
  protected readonly occupe = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.minuteur));
  }

  async ngOnInit(): Promise<void> {
    const examen = await this.service.demarrerExamen(this.id());
    this.charge.set(true);
    if (!examen) return;
    this.examen = examen.id;
    if (examen.score) {
      this.score.set(examen.score);
      this.concentrer();
      return;
    }
    // Toutes les réponses données lors d'une visite précédente : il ne reste qu'à rendre.
    if (!examen.questions?.length) return this.rendre();
    this.questions.set(examen.questions);
    this.total.set(examen.total ?? examen.questions.length);
    this.fin = Date.now() + (examen.secondes ?? 0) * 1000;
    this.reste.set(examen.secondes ?? 0);
    this.minuteur = setInterval(() => this.battre(), 250);
    this.concentrer();
  }

  private battre(): void {
    this.reste.set(Math.max(Math.ceil((this.fin - Date.now()) / 1000), 0));
    // Une réponse en route passe d'abord : le prochain battement rendra l'examen.
    if (this.reste() === 0 && !this.envoi()) void this.rendre();
  }

  protected async valider(): Promise<void> {
    const q = this.question();
    const reponse = this.saisie()?.reponse();
    if (!q || !reponse || this.envoi() || this.fini) return;
    this.envoi.set(true);
    const gardee = await this.service.repondreExamen(this.examen, q.id, reponse);
    this.envoi.set(false);
    if (gardee === null) {
      this.erreur.set('Ta réponse n’a pas pu être envoyée. Vérifie ta connexion, puis réessaie.');
      return;
    }
    await this.suivante();
  }

  protected async suivante(): Promise<void> {
    this.erreur.set('');
    if (this.i() + 1 < this.questions().length) {
      this.i.update((i) => i + 1);
      this.concentrer();
    } else {
      await this.rendre();
    }
  }

  private async rendre(): Promise<void> {
    if (this.fini) return;
    this.fini = true;
    clearInterval(this.minuteur);
    this.occupe.set(true);
    this.score.set(await this.service.rendreExamen(this.examen));
    this.occupe.set(false);
    this.concentrer();
  }

  protected async reviserNotionFaible(): Promise<void> {
    const resultat = await this.service.reviserNotionFaible(this.examen);
    this.notionFaible.set(
      resultat ? messageNotionFaible(resultat) : 'La révision n’a pas pu être préparée.',
    );
  }

  private concentrer(): void {
    concentrerTitre(this.injector);
  }
}
