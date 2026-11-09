import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Journee, SessionService, niveau } from '../../core/session/session.service';
import { CoursVille, NotionVille, prochaineRecompense } from '../../core/ville/ville';
import { CarteVille } from './carte-ville';

const ETATS = { batie: 'Bâtiment construit', chantier: 'En chantier', vide: 'À découvrir' };

/** Spécification § 3 : la carte, et une liste textuelle qui en donne tout le contenu. */
@Component({
  selector: 'sq-ville-page',
  imports: [RouterLink, CarteVille],
  template: `
    <h1 tabindex="-1">Ta ville</h1>
    @if (cours().length > 0) {
      <sq-carte-ville [cours]="cours()" [niveau]="niveauActuel()" [choisi]="choisi()?.id" />
      <div class="legende">
        <span><i class="pastille batie"></i>Bâtiment construit</span>
        <span><i class="pastille chantier"></i>En chantier</span>
        <span><i class="pastille vide"></i>À découvrir</span>
        <span><i class="pastille due"></i>À revoir</span>
      </div>
      <p class="hint statut-ville" role="status">
        @if (choisi(); as n) {
          {{ n.titre }} : {{ libelle(n) }}
        }
      </p>
      @if (journee(); as j) {
        <p class="hint">
          Niveau {{ niveauActuel() }}, série de {{ j.serie }} j, {{ j.gels }}
          {{ j.gels > 1 ? 'gels' : 'gel' }} ce mois-ci.
          @if (recompense(); as r) {
            Au niveau {{ r.niveau }} : {{ r.noms.join(' et ') }}.
          } @else {
            Toute la ville est débloquée.
          }
        </p>
      }
      @for (c of cours(); track c.id) {
        <h2 class="bloc">{{ c.titre }}</h2>
        <ul class="notions-ville">
          @for (n of c.notions; track n.id) {
            <li>
              <button
                type="button"
                class="notion-ville"
                [attr.aria-pressed]="choisi()?.id === n.id"
                (click)="choisi.set(n)"
              >
                <span
                  class="pastille"
                  [class.batie]="n.etat === 'batie'"
                  [class.chantier]="n.etat === 'chantier'"
                  [class.vide]="n.etat === 'vide'"
                  aria-hidden="true"
                ></span>
                {{ n.titre }}
                <small>{{ libelle(n) }}</small>
              </button>
            </li>
          }
        </ul>
      }
    } @else if (charge()) {
      <p class="intro">Ta ville est encore vide. Importe un cours pour poser ton premier quartier.</p>
      <a class="btn btn-primary bloc" routerLink="/cours/ecrire">Écrire un cours</a>
    }
  `,
})
export class VillePage implements OnInit {
  private readonly service = inject(SessionService);
  protected readonly cours = signal<CoursVille[]>([]);
  protected readonly journee = signal<Journee | null>(null);
  protected readonly choisi = signal<NotionVille | null>(null);
  protected readonly charge = signal(false);
  protected readonly niveauActuel = computed(() => niveau(this.journee()?.xp_total ?? 0));
  protected readonly recompense = computed(() => prochaineRecompense(this.niveauActuel()));
  protected libelle = (n: NotionVille) => ETATS[n.etat] + (n.due ? ', à revoir' : '');

  async ngOnInit(): Promise<void> {
    const [cours, journee] = await Promise.all([this.service.maVille(), this.service.journee()]);
    this.cours.set(cours);
    this.journee.set(journee);
    this.charge.set(true);
  }
}
