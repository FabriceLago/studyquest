import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  Cle,
  QuestionMission,
  Reponse,
  reponseDonnee,
  texteALire,
} from '../../core/session/session.service';

/** Les cinq façons de répondre, et l'affichage de la correction une fois renvoyée par le serveur. */
@Component({
  selector: 'sq-saisie-question',
  template: `
    @let q = question();
    @let cle = correction();
    @if (lecturePossible) {
      <button type="button" class="lien" (click)="ecouter()">Écouter la question</button>
    }
    @if (q.presentation.options; as options) {
      @if (q.type === 'multiple') {
        <p class="hint aide-saisie">Plusieurs réponses possibles.</p>
      }
      @for (option of options; track $index; let i = $index) {
        <button
          type="button"
          class="choix"
          [class.vrai]="cle?.correctes?.includes(i)"
          [class.faux]="cle && !cle.correctes?.includes(i) && choisies().includes(i)"
          [attr.aria-pressed]="choisies().includes(i)"
          [disabled]="fige()"
          (click)="choisir(i)"
        >
          {{ option }}
          @if (cle?.correctes?.includes(i)) {
            <em>Bonne réponse</em>
          } @else if (cle && choisies().includes(i)) {
            <em>Ta réponse</em>
          }
        </button>
      }
    } @else if (q.presentation.gauche; as gauche) {
      @for (libelle of gauche; track $index; let i = $index) {
        <label
          class="assoc"
          [class.vrai]="cle && associations()[i] === cle.associations?.[i]"
          [class.faux]="cle && associations()[i] !== cle.associations?.[i]"
        >
          {{ libelle }}
          <select #liste [disabled]="fige()" (change)="associer(i, liste.value)">
            <option value="">Choisir</option>
            @for (droite of q.presentation.droite; track $index; let j = $index) {
              <option [value]="j" [selected]="associations()[i] === j">{{ droite }}</option>
            }
          </select>
          @if (cle && associations()[i] !== cle.associations?.[i]) {
            <small>Bonne réponse : {{ q.presentation.droite?.[cle.associations?.[i] ?? 0] }}</small>
          }
        </label>
      }
    } @else {
      <ol class="ordre">
        @for (etape of ordre(); track $index; let i = $index) {
          <li
            [class.vrai]="cle && etape === cle.ordre?.[i]"
            [class.faux]="cle && etape !== cle.ordre?.[i]"
          >
            <span>{{ q.presentation.etapes?.[etape] }}</span>
            @if (!fige()) {
              <button
                type="button"
                [attr.aria-label]="'Monter : ' + q.presentation.etapes?.[etape]"
                [attr.aria-disabled]="i === 0"
                (click)="deplacer(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                [attr.aria-label]="'Descendre : ' + q.presentation.etapes?.[etape]"
                [attr.aria-disabled]="i === ordre().length - 1"
                (click)="deplacer(i, 1)"
              >
                ↓
              </button>
            }
          </li>
        }
      </ol>
      @if (cle) {
        <p class="hint aide-saisie">
          Ordre attendu :
          @for (etape of cle.ordre; track $index) {
            {{ $index + 1 }}. {{ q.presentation.etapes?.[etape] }}
          }
        </p>
      }
    }
  `,
})
export class SaisieQuestion {
  readonly question = input.required<QuestionMission>();
  readonly correction = input<Cle>();
  readonly fige = input(false);
  /** Un choix unique vient d'être fait : le défi y répond aussitôt, sans bouton Valider. */
  readonly choisi = output<void>();

  protected readonly choisies = linkedSignal<QuestionMission, readonly number[]>({
    source: this.question,
    computation: () => [],
  });
  protected readonly associations = linkedSignal<QuestionMission, readonly (number | null)[]>({
    source: this.question,
    computation: (q) => (q.presentation.gauche ?? []).map(() => null),
  });
  protected readonly ordre = linkedSignal<QuestionMission, readonly number[]>({
    source: this.question,
    computation: (q) => (q.presentation.etapes ?? []).map((_, i) => i),
  });

  readonly reponse = computed<Reponse | null>(() =>
    reponseDonnee(this.question(), this.choisies(), this.associations(), this.ordre()),
  );

  /** Synthèse vocale du navigateur : gratuite, mais dépendante des voix de l'appareil. */
  protected readonly lecturePossible = typeof speechSynthesis !== 'undefined';

  constructor() {
    if (!this.lecturePossible) return;
    // Une question ne continue pas à être lue une fois passée à la suivante.
    effect(() => {
      this.question();
      speechSynthesis.cancel();
    });
    inject(DestroyRef).onDestroy(() => speechSynthesis.cancel());
  }

  protected ecouter(): void {
    speechSynthesis.cancel();
    const lecture = new SpeechSynthesisUtterance(texteALire(this.question()));
    lecture.lang = 'fr-FR';
    speechSynthesis.speak(lecture);
  }

  protected choisir(i: number): void {
    if (this.question().type === 'multiple') {
      this.choisies.update((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
      return;
    }
    this.choisies.set([i]);
    this.choisi.emit();
  }

  protected associer(i: number, valeur: string): void {
    this.associations.update((a) =>
      a.map((x, j) => (j === i ? (valeur === '' ? null : Number(valeur)) : x)),
    );
  }

  protected deplacer(i: number, sens: -1 | 1): void {
    const ordre = [...this.ordre()];
    const cible = i + sens;
    if (cible < 0 || cible >= ordre.length) return;
    [ordre[i], ordre[cible]] = [ordre[cible], ordre[i]];
    this.ordre.set(ordre);
  }
}
