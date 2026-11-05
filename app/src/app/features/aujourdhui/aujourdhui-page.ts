import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Cours, CoursService, Statut, libelleExamen } from '../../core/cours/cours.service';
import {
  DuelRecent,
  Journee,
  SessionService,
  niveau,
  seuil,
} from '../../core/session/session.service';
import { CoursVille } from '../../core/ville/ville';
import { Avatar } from '../../shared/avatar';
import { CarteVille } from '../ville/carte-ville';

const ETATS: Record<Statut, string> = {
  en_attente: 'En préparation',
  transcription: 'En lecture',
  a_relire: 'À relire',
  generation: 'Questions en création',
  pret: 'Prêt',
  echec: 'Échec',
};

/** Page d'arrivée : la mission du jour et l'aperçu de la ville. */
@Component({
  selector: 'sq-aujourdhui-page',
  imports: [RouterLink, CarteVille, Avatar],
  template: `
    <div class="haut">
      <div class="salut">
        <sq-avatar [numero]="auth.profile()?.avatar ?? 0" />
        <div>
          @if (journee()) {
            <p class="sur">Niveau {{ niveauActuel() }}</p>
          }
          <h1>Salut {{ auth.profile()?.pseudo }}</h1>
        </div>
      </div>
      @if (journee(); as j) {
        <div class="serie">
          <strong>{{ j.serie }} j</strong>
          <span class="hint">de série, {{ j.gels }} {{ j.gels > 1 ? 'gels' : 'gel' }}</span>
        </div>
      }
    </div>

    @if (journee(); as j) {
      <div
        class="jauge"
        role="progressbar"
        [attr.aria-label]="'Progression vers le niveau ' + (niveauActuel() + 1)"
        [attr.aria-valuenow]="progression().pourcent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <i [style.width.%]="progression().pourcent"></i>
      </div>
      <p class="hint">
        {{ progression().acquis }} / {{ progression().requis }} XP vers le niveau
        {{ niveauActuel() + 1 }}
      </p>
      <p class="hint">
        {{ j.xp_jour }} XP aujourd’hui, {{ j.notions_maitrisees }}
        {{ j.notions_maitrisees > 1 ? 'notions maîtrisées' : 'notion maîtrisée' }}
      </p>
      @if (j.xp_jour >= j.plafond) {
        <p class="hint">
          Tu as atteint les {{ j.plafond }} XP du jour : la suite ne rapporte plus d’XP.
        </p>
      }
      @if (ville().length > 0) {
        <a class="carte-lien" routerLink="/ville">
          <sq-carte-ville [cours]="ville()" [niveau]="niveauActuel()" [decor]="true" />
          <span>Voir ma ville</span>
        </a>
      }

      @if (lignes().length > 0) {
        <h2 class="bloc">Mission du jour</h2>
        <ul class="missions">
          @for (ligne of lignes(); track ligne.titre) {
            <li>
              @if (ligne.fait) {
                <div class="mission fait">
                  <span class="puce" aria-hidden="true">✓</span>
                  <span>
                    <b>{{ ligne.titre }}</b>
                    <span class="hint">Terminée</span>
                  </span>
                  <span class="gain">+{{ j.xp_mission }} XP</span>
                </div>
              } @else {
                <a class="mission" [routerLink]="ligne.lien">
                  <span class="puce" aria-hidden="true"></span>
                  <span>
                    <b>{{ ligne.titre }}</b>
                    <span class="hint">{{ ligne.detail }}</span>
                  </span>
                  <span class="gain">+{{ j.xp_mission }} XP</span>
                </a>
              }
            </li>
          }
        </ul>
        @if (suivante(); as s) {
          <a class="btn btn-primary bloc" [routerLink]="s.lien">{{ s.appel }}</a>
        } @else {
          <p class="sur bloc">Mission terminée. À demain !</p>
        }
      }
      @if (miniPossible()) {
        <p class="bloc">
          <a routerLink="/session/mini"
            >Pas le temps ? {{ j.mini_questions }} questions gardent ta série</a
          >
        </p>
      }
    }

    @if (charge() && lignes().length === 0) {
      <p class="intro">
        {{
          cours().length === 0
            ? 'Ta ville est encore vide. Importe ton premier cours pour la lancer.'
            : 'Aucune mission pour l’instant. Importe un cours pour en débloquer.'
        }}
      </p>
    }
    <a
      class="btn bloc"
      [class.btn-primary]="lignes().length === 0"
      [class.btn-secondary]="lignes().length > 0"
      routerLink="/cours/importer"
      >Importer un cours</a
    >
    <p class="bloc"><a routerLink="/cours/rejoindre">J’ai un code de cours</a></p>
    <p class="bloc"><a routerLink="/duel/rejoindre">J’ai un code de duel</a></p>
    <p class="bloc"><a routerLink="/groupes">Mes groupes et classements</a></p>
    @if (quota(); as q) {
      <p class="hint bloc">
        {{ q.pretes }} {{ q.pretes > 1 ? 'imports' : 'import' }} sur {{ q.total }} ce mois-ci.
        <a routerLink="/abonnement">Abonnement</a>
      </p>
    }
    @if (duels().length > 0) {
      <h2 class="bloc">Mes duels</h2>
      <ul class="liste-cours">
        @for (d of duels(); track d.id) {
          <li>
            <a [routerLink]="['/duel', d.id]">{{ d.titre }}</a>
            <span class="hint"
              >{{ d.justes ?? 0 }}/{{ d.total }}, {{ d.joueurs }}
              {{ d.joueurs > 1 ? 'joueurs' : 'joueur' }}</span
            >
          </li>
        }
      </ul>
    }
    @if (cours().length > 0) {
      <h2 class="bloc">Mes cours</h2>
      <ul class="liste-cours">
        @for (c of cours(); track c.id) {
          <li>
            <a [routerLink]="['/cours', c.id]">{{ c.titre }}</a>
            <span class="hint">{{ examen(c.date_examen) || etat(c.statut) }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class AujourdhuiPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly service = inject(CoursService);
  private readonly session = inject(SessionService);
  protected readonly cours = signal<Cours[]>([]);
  protected readonly quota = signal<{ pretes: number; total: number } | null>(null);
  protected readonly journee = signal<Journee | null>(null);
  protected readonly duels = signal<DuelRecent[]>([]);
  protected readonly ville = signal<CoursVille[]>([]);
  protected readonly charge = signal(false);
  protected etat = (statut: Statut) => ETATS[statut];
  protected examen = (date: string | null) => libelleExamen(date);

  protected readonly niveauActuel = computed(() => niveau(this.journee()?.xp_total ?? 0));
  protected readonly progression = computed(() => {
    const n = this.niveauActuel();
    const acquis = (this.journee()?.xp_total ?? 0) - seuil(n);
    const requis = seuil(n + 1) - seuil(n);
    return { acquis, requis, pourcent: Math.round((acquis / requis) * 100) };
  });
  /** Spécification § 3 : une mission sans question disponible n'est pas proposée. */
  protected readonly lignes = computed(() => {
    const j = this.journee();
    if (!j) return [];
    return [
      {
        titre: 'Réviser',
        detail: `${j.reviser.questions} ${j.reviser.questions > 1 ? 'questions' : 'question'} à revoir`,
        lien: '/session/reviser',
        appel: 'Commencer ma révision',
        fait: j.reviser.fait,
        proposee: j.reviser.fait || j.reviser.questions > 0,
      },
      {
        titre: 'Découvrir',
        detail: `${j.decouvrir.questions} ${j.decouvrir.questions > 1 ? 'nouvelles questions' : 'nouvelle question'}`,
        lien: '/session/decouvrir',
        appel: 'Découvrir une notion',
        fait: j.decouvrir.fait,
        proposee: j.decouvrir.fait || j.decouvrir.questions > 0,
      },
      {
        titre: 'Défi',
        detail: '60 secondes sur ce que tu as déjà vu',
        lien: '/defi',
        appel: 'Lancer le défi',
        fait: j.defi.fait,
        proposee: j.defi.fait || j.defi.disponible,
      },
    ].filter((ligne) => ligne.proposee);
  });
  protected readonly suivante = computed(() => this.lignes().find((ligne) => !ligne.fait));
  protected readonly miniPossible = computed(() => {
    const j = this.journee();
    return !!j && !j.jour_compte && j.reviser.questions + j.decouvrir.questions >= j.mini_questions;
  });

  async ngOnInit(): Promise<void> {
    const [cours, quota, journee, duels, ville] = await Promise.all([
      this.service.liste(),
      this.service.quota(),
      this.session.journee(),
      this.session.mesDuels(),
      this.session.maVille(),
    ]);
    this.cours.set(cours);
    this.quota.set(quota);
    this.journee.set(journee);
    this.duels.set(duels);
    this.ville.set(ville);
    this.charge.set(true);
  }
}
