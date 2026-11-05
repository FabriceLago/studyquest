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
  PartieDuel,
  QuestionMission,
  SessionService,
  duree,
} from '../../core/session/session.service';
import { concentrerTitre } from './concentrer';
import { SaisieQuestion } from './saisie-question';

/** Un duel en différé : mêmes questions, chacun joue quand il veut. Rien n'est corrigé. */
@Component({
  selector: 'sq-duel-page',
  imports: [RouterLink, SaisieQuestion],
  template: `
    @if (resultat(); as r) {
      <p class="sur">Duel terminé</p>
      <h1 tabindex="-1">{{ monScore() }}/{{ r.total }}</h1>
      <ol class="liste-cours bloc">
        @for (ligne of r.classement; track $index) {
          <li>
            <span>{{ $index + 1 }}. {{ ligne.pseudo }}{{ ligne.moi ? ' (toi)' : '' }}</span>
            <strong>{{ ligne.justes }}/{{ r.total }}</strong>
          </li>
        }
      </ol>
      <p class="code-ligne">
        Code à transmettre : <strong class="code-partage">{{ r.code }}</strong>
      </p>
      <p class="hint">
        Seules les personnes qui ont déjà reçu ce cours peuvent jouer. Le classement se met à jour à
        chaque partie. Ni correction ni XP dans un duel.
      </p>
      <a class="btn btn-primary bloc" routerLink="/">Retour à ma journée</a>
    } @else if (question(); as q) {
      <div class="entete">
        <a class="fermer" routerLink="/" aria-label="Quitter">×</a>
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
        [class.urgent]="reste() <= 30"
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
        {{ i() + 1 < questions().length ? 'Question suivante' : 'Voir le classement' }}
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
      <h1>Duel indisponible</h1>
      <p class="intro">Pour jouer, il faut d’abord avoir reçu ce cours avec son code de partage.</p>
      <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class DuelPage implements OnInit {
  /** Fourni par la route. */
  readonly id = input.required<string>();

  private readonly service = inject(SessionService);
  private readonly injector = inject(Injector);
  private minuteur: ReturnType<typeof setInterval> | undefined;
  private fin = 0;
  private fini = false;

  protected readonly saisie = viewChild(SaisieQuestion);
  protected readonly questions = signal<QuestionMission[]>([]);
  protected readonly i = signal(0);
  protected readonly total = signal(0);
  protected readonly question = computed<QuestionMission | undefined>(
    () => this.questions()[this.i()],
  );
  protected readonly position = computed(
    () => this.total() - this.questions().length + this.i() + 1,
  );
  protected readonly reste = signal(0);
  protected readonly affichage = computed(() => duree(this.reste()));
  protected readonly resultat = signal<PartieDuel | null>(null);
  protected readonly monScore = computed(
    () => this.resultat()?.classement?.find((ligne) => ligne.moi)?.justes ?? 0,
  );
  protected readonly envoi = signal(false);
  protected readonly erreur = signal('');
  protected readonly charge = signal(false);
  protected readonly occupe = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.minuteur));
  }

  async ngOnInit(): Promise<void> {
    const partie = await this.service.jouerDuel(this.id());
    this.charge.set(true);
    if (!partie) return;
    if (partie.classement) {
      this.resultat.set(partie);
      concentrerTitre(this.injector);
      return;
    }
    // Toutes les réponses données lors d'une visite précédente : il ne reste qu'à terminer.
    if (!partie.questions?.length) return this.terminer();
    this.questions.set(partie.questions);
    this.total.set(partie.total);
    this.fin = Date.now() + (partie.secondes ?? 0) * 1000;
    this.reste.set(partie.secondes ?? 0);
    this.minuteur = setInterval(() => this.battre(), 250);
    concentrerTitre(this.injector);
  }

  private battre(): void {
    this.reste.set(Math.max(Math.ceil((this.fin - Date.now()) / 1000), 0));
    // Une réponse en route passe d'abord : le prochain battement terminera la partie.
    if (this.reste() === 0 && !this.envoi()) void this.terminer();
  }

  protected async valider(): Promise<void> {
    const q = this.question();
    const reponse = this.saisie()?.reponse();
    if (!q || !reponse || this.envoi() || this.fini) return;
    this.envoi.set(true);
    const gardee = await this.service.repondreDuel(this.id(), q.id, reponse);
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
      concentrerTitre(this.injector);
    } else {
      await this.terminer();
    }
  }

  private async terminer(): Promise<void> {
    if (this.fini) return;
    this.fini = true;
    clearInterval(this.minuteur);
    this.occupe.set(true);
    this.resultat.set(await this.service.terminerDuel(this.id()));
    this.occupe.set(false);
    concentrerTitre(this.injector);
  }
}
