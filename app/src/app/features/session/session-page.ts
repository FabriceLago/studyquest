import {
  Component,
  Injector,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoursService } from '../../core/cours/cours.service';
import { QuestionMission, Resultat, SessionService } from '../../core/session/session.service';
import { CoursVille, messageAllumage } from '../../core/ville/ville';
import { Bilan } from './bilan';
import { concentrerTitre } from './concentrer';
import { SaisieQuestion } from './saisie-question';

type MissionSession = 'reviser' | 'decouvrir';
type QuestionSession = QuestionMission & { readonly mission: MissionSession };

/** Une session Réviser, Découvrir ou la mini-mission. La correction n'arrive qu'après la réponse. */
@Component({
  selector: 'sq-session-page',
  imports: [RouterLink, Bilan, SaisieQuestion],
  template: `
    @if (bilan(); as b) {
      <sq-bilan
        [sur]="sur()"
        [titre]="b.justes === b.total ? 'Sans faute' : 'Bien joué'"
        [justes]="b.justes"
        [total]="b.total"
        [gain]="b.gain"
        [serie]="b.serie"
        [note]="b.note"
      />
    } @else if (question(); as q) {
      <div class="entete">
        <a class="fermer" routerLink="/" aria-label="Quitter">×</a>
        <div
          class="progres"
          role="progressbar"
          aria-label="Progression"
          [attr.aria-valuenow]="i() + (resultat() ? 1 : 0)"
          aria-valuemin="0"
          [attr.aria-valuemax]="questions().length"
        >
          <i [style.width.%]="((i() + (resultat() ? 1 : 0)) / questions().length) * 100"></i>
        </div>
        <span class="compte">{{ i() + 1 }}/{{ questions().length }}</span>
      </div>
      <p class="sur">{{ q.notion }}</p>
      <h1 tabindex="-1">{{ q.enonce }}</h1>
      <sq-saisie-question [question]="q" [correction]="resultat()?.reponse" [fige]="!!resultat()" />
      @if (erreur()) {
        <p class="field-error bloc" role="alert">{{ erreur() }}</p>
      }
      @if (resultat(); as r) {
        <div class="retour" [class.non]="!r.juste" role="status">
          @if (r.compte) {
            <strong>
              @if (r.juste) {
                Juste{{ r.xp ? ', +' + r.xp + ' XP' : '' }}
              } @else {
                À revoir, elle reviendra demain
              }
            </strong>
            @if (r.explication) {
              <p>{{ r.explication }}</p>
            }
            <!-- Une question écrite à la main ne cite aucun extrait. -->
            @if (r.extrait) {
              <blockquote>
                <cite>Dans ton cours, {{ q.cours }}</cite>
                {{ r.extrait }}
              </blockquote>
            }
            <button type="button" class="lien" [disabled]="retiree()" (click)="retirer(q.id)">
              {{ retiree() ? 'Question retirée de tes révisions' : 'Cette question est fausse' }}
            </button>
          } @else {
            <strong>Cette question a déjà été traitée.</strong>
          }
        </div>
        <button type="button" class="btn btn-primary bloc" (click)="suivant()">
          {{ i() + 1 < questions().length ? 'Question suivante' : 'Voir le résultat' }}
        </button>
      } @else {
        <button
          type="button"
          class="btn btn-primary bloc"
          [disabled]="!saisie()?.reponse() || envoi()"
          (click)="valider()"
        >
          Valider
        </button>
      }
    } @else if (charge()) {
      <h1>Rien à faire ici pour l’instant</h1>
      <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
    } @else {
      <h1>Chargement…</h1>
    }
  `,
})
export class SessionPage implements OnInit {
  /** Fournis par la route. */
  readonly mission = input<MissionSession>();
  readonly mini = input<boolean>();

  private readonly service = inject(SessionService);
  private readonly cours = inject(CoursService);
  private readonly injector = inject(Injector);

  protected readonly saisie = viewChild(SaisieQuestion);
  protected readonly questions = signal<QuestionSession[]>([]);
  protected readonly i = signal(0);
  protected readonly question = computed<QuestionSession | undefined>(
    () => this.questions()[this.i()],
  );
  protected readonly sur = computed(() =>
    this.mini()
      ? 'Mini-mission terminée'
      : this.mission() === 'reviser'
        ? 'Révision terminée'
        : 'Découverte terminée',
  );
  protected readonly resultat = signal<Resultat | null>(null);
  protected readonly retiree = signal(false);
  protected readonly envoi = signal(false);
  protected readonly erreur = signal('');
  protected readonly charge = signal(false);
  protected readonly bilan = signal<{
    justes: number;
    total: number;
    gain: number;
    serie: number;
    note: string;
  } | null>(null);
  private justes = 0;
  private gain = 0;
  /** La ville avant la session, pour annoncer dans le bilan les bâtiments qui s'allument. */
  private villeAvant: CoursVille[] = [];

  async ngOnInit(): Promise<void> {
    const [questions, ville] = await Promise.all([
      this.mini() ? this.fileMini() : this.file(this.mission()),
      this.service.maVille(),
    ]);
    this.questions.set(questions);
    this.villeAvant = ville;
    this.charge.set(true);
    this.concentrer();
  }

  private async file(mission: MissionSession = 'reviser'): Promise<QuestionSession[]> {
    const session = await this.service.questions(mission);
    return (session?.questions ?? []).map((q) => ({ ...q, mission }));
  }

  /** Réviser d'abord, puis découvrir, jusqu'au nombre de réponses qui garde la série. */
  private async fileMini(): Promise<QuestionSession[]> {
    const [journee, dues, nouvelles] = await Promise.all([
      this.service.journee(),
      this.file('reviser'),
      this.file('decouvrir'),
    ]);
    return [...dues, ...nouvelles].slice(0, journee?.mini_questions ?? 0);
  }

  protected async valider(): Promise<void> {
    const q = this.question();
    const reponse = this.saisie()?.reponse();
    if (!q || !reponse) return;
    this.envoi.set(true);
    const resultat = await this.service.repondre(q.id, q.mission, reponse);
    this.envoi.set(false);
    if (!resultat) {
      this.erreur.set('Ta réponse n’a pas pu être envoyée. Vérifie ta connexion, puis réessaie.');
      return;
    }
    this.erreur.set('');
    this.resultat.set(resultat);
    if (resultat.juste) this.justes++;
    this.gain += (resultat.xp ?? 0) + (resultat.prime ?? 0);
  }

  protected async retirer(id: string): Promise<void> {
    if (await this.cours.supprimerQuestion(id)) this.retiree.set(true);
  }

  protected async suivant(): Promise<void> {
    this.resultat.set(null);
    this.retiree.set(false);
    if (this.i() + 1 < this.questions().length) {
      this.i.update((i) => i + 1);
    } else {
      const [journee, ville] = await Promise.all([this.service.journee(), this.service.maVille()]);
      const serie =
        this.mini() && journee?.jour_compte ? 'Ta série est gardée pour aujourd’hui.' : '';
      this.bilan.set({
        justes: this.justes,
        total: this.questions().length,
        gain: this.gain,
        serie: journee?.serie ?? 0,
        note: [serie, messageAllumage(this.villeAvant, ville)].filter(Boolean).join(' '),
      });
    }
    this.concentrer();
  }

  private concentrer(): void {
    concentrerTitre(this.injector);
  }
}
