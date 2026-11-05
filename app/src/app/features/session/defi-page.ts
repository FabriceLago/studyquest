import {
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuestionMission, SessionService } from '../../core/session/session.service';
import { Bilan } from './bilan';
import { concentrerTitre } from './concentrer';
import { SaisieQuestion } from './saisie-question';

/** Le chrono affiché vient du serveur, qui seul décide si une réponse arrive à temps. */
@Component({
  selector: 'sq-defi-page',
  imports: [RouterLink, Bilan, SaisieQuestion],
  template: `
    @if (bilan(); as b) {
      <sq-bilan
        sur="Défi terminé"
        [titre]="b.total === 0 ? 'Temps écoulé' : 'Bien joué'"
        [justes]="b.justes"
        [total]="b.total"
        [gain]="b.gain"
        [serie]="b.serie"
        [note]="
          b.total === 0
            ? 'Sans réponse, ce défi ne compte pas. Il reviendra demain.'
            : 'Le défi ne porte que sur des questions déjà vues.'
        "
      />
    } @else if (question(); as q) {
      <div class="entete">
        <a class="fermer" routerLink="/" aria-label="Quitter">×</a>
        <div class="progres" aria-hidden="true">
          <i [style.width.%]="(i() / questions().length) * 100"></i>
        </div>
        <span class="compte">{{ justes() }} juste{{ justes() > 1 ? 's' : '' }}</span>
      </div>
      <p
        class="chrono"
        [class.urgent]="reste() <= 10"
        role="timer"
        aria-label="Temps restant en secondes"
      >
        {{ reste() }}
      </p>
      <h1 tabindex="-1">{{ q.enonce }}</h1>
      <sq-saisie-question [question]="q" [fige]="envoi()" (choisi)="valider()" />
      @if (q.type !== 'unique' && q.type !== 'vrai_faux') {
        <button
          type="button"
          class="btn btn-primary bloc"
          [disabled]="!saisie()?.reponse() || envoi()"
          (click)="valider()"
        >
          Valider
        </button>
      }
      <p class="flash" role="status">{{ flash() }}</p>
    } @else if (charge() && !occupe()) {
      <h1>Le défi n’est pas encore disponible</h1>
      <p class="intro">Il demande au moins 5 questions déjà vues.</p>
      <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class DefiPage implements OnInit {
  private readonly service = inject(SessionService);
  private readonly injector = inject(Injector);
  private minuteur: ReturnType<typeof setInterval> | undefined;
  private fin = 0;
  private fini = false;

  protected readonly saisie = viewChild(SaisieQuestion);
  protected readonly questions = signal<QuestionMission[]>([]);
  protected readonly i = signal(0);
  protected readonly question = computed<QuestionMission | undefined>(
    () => this.questions()[this.i()],
  );
  protected readonly reste = signal(0);
  protected readonly justes = signal(0);
  protected readonly flash = signal('');
  protected readonly envoi = signal(false);
  protected readonly charge = signal(false);
  protected readonly occupe = signal(false);
  protected readonly bilan = signal<{
    justes: number;
    total: number;
    gain: number;
    serie: number;
  } | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.minuteur));
  }

  async ngOnInit(): Promise<void> {
    const defi = await this.service.questions('defi');
    this.charge.set(true);
    if (!defi) return;
    // Essai déjà joué, ou temps écoulé pendant une absence : direction le bilan.
    if (!defi.secondes || defi.questions.length === 0) return this.terminer();
    this.questions.set(defi.questions);
    this.fin = Date.now() + defi.secondes * 1000;
    this.reste.set(defi.secondes);
    this.minuteur = setInterval(() => this.battre(), 250);
    this.concentrer();
  }

  private battre(): void {
    this.reste.set(Math.max(Math.ceil((this.fin - Date.now()) / 1000), 0));
    // Une réponse en route passe d'abord : le prochain battement terminera le défi.
    if (this.reste() === 0 && !this.envoi()) void this.terminer();
  }

  protected async valider(): Promise<void> {
    const q = this.question();
    const reponse = this.saisie()?.reponse();
    if (!q || !reponse || this.envoi() || this.fini) return;
    this.envoi.set(true);
    const resultat = await this.service.repondre(q.id, 'defi', reponse);
    this.envoi.set(false);
    if (!resultat) {
      this.flash.set('Réponse non envoyée. Vérifie ta connexion.');
      return;
    }
    if (resultat.juste) this.justes.update((n) => n + 1);
    this.flash.set(resultat.juste ? `Juste, +${resultat.xp} XP` : 'Pas cette fois');
    if (this.i() + 1 < this.questions().length) {
      this.i.update((i) => i + 1);
      this.concentrer();
    } else {
      await this.terminer();
    }
  }

  private async terminer(): Promise<void> {
    if (this.fini) return;
    this.fini = true;
    clearInterval(this.minuteur);
    this.occupe.set(true);
    const bilan = await this.service.terminerDefi();
    const journee = await this.service.journee();
    this.bilan.set({
      justes: bilan?.justes ?? 0,
      total: bilan?.total ?? 0,
      gain: (bilan?.xp ?? 0) + (bilan?.prime ?? 0),
      serie: journee?.serie ?? 0,
    });
    this.concentrer();
  }

  private concentrer(): void {
    concentrerTitre(this.injector);
  }
}
