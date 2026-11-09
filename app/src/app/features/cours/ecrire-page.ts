import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CoursService,
  ECRITURE,
  NotionEcrite,
  QuestionEcrite,
  nouvelleNotion,
  nouvelleQuestion,
  validerEcriture,
} from '../../core/cours/cours.service';

/** Un cours écrit à la main, ou des notions ajoutées à l'un d'eux (route cours/:id/ecrire). Ni IA ni quota. */
@Component({
  selector: 'sq-ecrire-page',
  imports: [RouterLink],
  template: `
    @if (!charge()) {
      <h1>Chargement…</h1>
    } @else if (id() && place() <= 0) {
      <h1>Ajouter des notions</h1>
      <p class="intro">
        Ce cours ne peut plus recevoir de notions : {{ max.notions }} au plus, et seulement sur un
        cours que tu as écrit à la main.
      </p>
      <p class="bloc"><a [routerLink]="['/cours', id()]">Revenir au cours</a></p>
    } @else {
      <h1>{{ id() ? 'Ajouter des notions' : 'Écrire mes questions' }}</h1>
      @if (titreCours()) {
        <p class="intro">{{ titreCours() }}</p>
      }
      <p class="hint bloc">
        Sans IA : tes questions sont enregistrées telles que tu les écris et ne comptent pas dans
        tes imports du mois.
      </p>
      <form class="form" novalidate (submit)="enregistrer($event)">
        @if (!id()) {
          <div class="field">
            <label for="titre">Titre du cours</label>
            <input
              #titreInput
              id="titre"
              type="text"
              maxlength="120"
              [value]="titre()"
              (input)="titre.set(titreInput.value)"
            />
          </div>
        }

        @for (notion of notions(); track notion; let n = $index) {
          <fieldset class="ecrite">
            <legend>Notion {{ n + 1 }}</legend>
            <div class="field">
              <label [for]="'n' + n">Titre de la notion</label>
              <input
                [id]="'n' + n"
                type="text"
                maxlength="120"
                [value]="notion.titre"
                (input)="notion.titre = valeur($event)"
              />
            </div>
            <div class="field">
              <label [for]="'n' + n + '-retenir'">À retenir</label>
              <p class="hint" [id]="'n' + n + '-aide'">
                Une ou deux phrases : elles forment la carte de cette notion.
              </p>
              <textarea
                [id]="'n' + n + '-retenir'"
                rows="2"
                [maxLength]="max.texte"
                [attr.aria-describedby]="'n' + n + '-aide'"
                [value]="notion.aRetenir"
                (input)="notion.aRetenir = valeur($event)"
              ></textarea>
            </div>

            @for (question of notion.questions; track question; let q = $index) {
              @let base = 'n' + n + 'q' + q;
              <fieldset class="ecrite">
                <legend>Question {{ q + 1 }}</legend>
                <div class="field">
                  <label [for]="base">Énoncé</label>
                  <textarea
                    [id]="base"
                    rows="2"
                    [maxLength]="max.enonce"
                    [value]="question.enonce"
                    (input)="question.enonce = valeur($event)"
                  ></textarea>
                </div>
                <label class="case">
                  <input
                    type="checkbox"
                    [checked]="question.vraiFaux"
                    (change)="basculer(question, $event)"
                  />
                  Question vrai ou faux
                </label>

                @if (question.vraiFaux) {
                  <fieldset class="choix-format">
                    <legend>La bonne réponse</legend>
                    <label class="case">
                      <input
                        type="radio"
                        [name]="base + '-vf'"
                        [checked]="question.vrai"
                        (change)="question.vrai = true"
                      />
                      Vrai
                    </label>
                    <label class="case">
                      <input
                        type="radio"
                        [name]="base + '-vf'"
                        [checked]="!question.vrai"
                        (change)="question.vrai = false"
                      />
                      Faux
                    </label>
                  </fieldset>
                } @else {
                  <p class="hint">
                    Coche la ou les bonnes réponses. Un choix laissé vide est ignoré.
                  </p>
                  @for (choix of question.choix; track choix; let c = $index) {
                    <div class="choix-ecrit">
                      <div class="field">
                        <label [for]="base + 'c' + c">Choix {{ c + 1 }}</label>
                        <input
                          [id]="base + 'c' + c"
                          type="text"
                          [maxLength]="max.choixLongueur"
                          [value]="choix.texte"
                          (input)="choix.texte = valeur($event)"
                        />
                      </div>
                      <label class="case">
                        <input
                          type="checkbox"
                          [checked]="choix.correcte"
                          (change)="choix.correcte = coche($event)"
                        />
                        <span
                          >Bonne réponse<span class="cache"> (choix {{ c + 1 }})</span></span
                        >
                      </label>
                      @if (question.choix.length > 2) {
                        <button
                          type="button"
                          class="lien"
                          [attr.aria-label]="'Retirer le choix ' + (c + 1)"
                          (click)="retirerChoix(question, c)"
                        >
                          Retirer
                        </button>
                      }
                    </div>
                  }
                  @if (question.choix.length < max.choix) {
                    <button type="button" class="lien" (click)="ajouterChoix(question)">
                      Ajouter un choix
                    </button>
                  }
                }

                <div class="field">
                  <label [for]="base + '-explication'">Explication (facultative)</label>
                  <textarea
                    [id]="base + '-explication'"
                    rows="2"
                    [maxLength]="max.texte"
                    [value]="question.explication"
                    (input)="question.explication = valeur($event)"
                  ></textarea>
                </div>
                @if (notion.questions.length > 1) {
                  <button type="button" class="lien" (click)="retirerQuestion(notion, q)">
                    Retirer la question {{ q + 1 }}
                  </button>
                }
              </fieldset>
            }

            @if (notion.questions.length < max.questions) {
              <button type="button" class="btn btn-secondary" (click)="ajouterQuestion(notion)">
                Ajouter une question
              </button>
            }
            @if (notions().length > 1) {
              <button type="button" class="lien" (click)="retirerNotion(n)">
                Retirer la notion {{ n + 1 }}
              </button>
            }
          </fieldset>
        }

        @if (notions().length < place()) {
          <button type="button" class="btn btn-secondary" (click)="ajouterNotion()">
            Ajouter une notion
          </button>
        }
        @if (erreur()) {
          <p class="field-error" role="alert">{{ erreur() }}</p>
        }
        <button type="submit" class="btn btn-primary" [disabled]="envoi()">
          {{ envoi() ? 'Enregistrement…' : 'Enregistrer le cours' }}
        </button>
        @if (id(); as cours) {
          <a [routerLink]="['/cours', cours]">Revenir au cours</a>
        } @else {
          <a routerLink="/">Revenir à ma journée</a>
        }
      </form>
    }
  `,
})
export class EcrirePage implements OnInit {
  /** Fourni par la route cours/:id/ecrire ; absent pour un nouveau cours. */
  readonly id = input<string>();

  private readonly cours = inject(CoursService);
  private readonly router = inject(Router);
  protected readonly max = ECRITURE;
  protected readonly titre = signal('');
  protected readonly titreCours = signal('');
  /** Notions encore permises dans ce cours. */
  protected readonly place = signal<number>(ECRITURE.notions);
  protected readonly notions = signal<NotionEcrite[]>([nouvelleNotion()]);
  protected readonly erreur = signal('');
  protected readonly envoi = signal(false);
  protected readonly charge = signal(false);

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (id) {
      const [cours, notions] = await Promise.all([this.cours.lire(id), this.cours.notions(id)]);
      // Seul l'auteur d'un cours écrit à la main y ajoute des notions, pas une copie reçue.
      const permis = !!cours;
      this.titreCours.set(cours?.titre ?? '');
      this.place.set(permis ? ECRITURE.notions - notions.length : 0);
    }
    this.charge.set(true);
  }

  protected valeur(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected coche(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** Le formulaire modifie ses objets sur place : un nouveau tableau redessine la page. */
  private maj(): void {
    this.notions.update((liste) => [...liste]);
  }

  protected ajouterNotion(): void {
    this.notions.update((liste) => [...liste, nouvelleNotion()]);
  }

  protected retirerNotion(i: number): void {
    this.notions.update((liste) => liste.filter((_, j) => j !== i));
  }

  protected ajouterQuestion(notion: NotionEcrite): void {
    notion.questions.push(nouvelleQuestion());
    this.maj();
  }

  protected retirerQuestion(notion: NotionEcrite, i: number): void {
    notion.questions.splice(i, 1);
    this.maj();
  }

  protected ajouterChoix(question: QuestionEcrite): void {
    question.choix.push({ texte: '', correcte: false });
    this.maj();
  }

  protected retirerChoix(question: QuestionEcrite, i: number): void {
    question.choix.splice(i, 1);
    this.maj();
  }

  protected basculer(question: QuestionEcrite, event: Event): void {
    question.vraiFaux = this.coche(event);
    this.maj();
  }

  protected async enregistrer(event: Event): Promise<void> {
    event.preventDefault();
    if (this.envoi()) return;
    const id = this.id() ?? null;
    const titre = id ? null : this.titre();
    const probleme = validerEcriture(titre, this.notions());
    this.erreur.set(probleme ?? '');
    if (probleme) return;

    this.envoi.set(true);
    const resultat = await this.cours.ecrire(id, titre, this.notions());
    this.envoi.set(false);
    if ('id' in resultat) await this.router.navigate(['/cours', resultat.id]);
    else this.erreur.set(resultat.erreur);
  }
}
