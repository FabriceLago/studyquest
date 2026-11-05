import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Abonnement, AbonnementService, estActif } from '../../core/abonnement/abonnement.service';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Spécification § 8 : un quota gratuit d'imports, et un abonnement qui le relève. */
@Component({
  selector: 'sq-abonnement-page',
  imports: [RouterLink],
  template: `
    <h1>Abonnement</h1>
    <p class="intro">
      Sans abonnement, tu importes 5 cours par mois. Avec, 30 par mois. Tout le reste est identique,
      et rien d’autre n’est vendu.
    </p>

    @if (statut() === 'merci' && !actif()) {
      <div class="retour" role="status">
        <strong>Merci !</strong>
        <p>Ton abonnement s’active dans quelques secondes.</p>
        <button type="button" class="btn btn-secondary" (click)="charger()">Actualiser</button>
      </div>
    }

    @if (actif()) {
      @let a = abonnement();
      @if (a?.status === 'past_due') {
        <p class="bloc">
          <strong>Le dernier paiement a été refusé.</strong> Tes imports restent ouverts pendant que
          Stripe retente le prélèvement : mets à jour ton moyen de paiement.
        </p>
      } @else {
        <p class="bloc">
          <strong>Ton abonnement est actif.</strong>
          @if (a?.currentPeriodEnd; as fin) {
            {{ a?.cancelAtPeriodEnd ? 'Il prendra fin le' : 'Prochain renouvellement le' }}
            {{ date(fin) }}.
          }
        </p>
      }
      <p class="hint">Moyen de paiement, factures ou résiliation :</p>
      <button type="button" class="btn btn-secondary" [disabled]="envoi()" (click)="gerer()">
        Gérer mon abonnement
      </button>
    } @else if (charge()) {
      <label class="case bloc">
        <input
          type="checkbox"
          [checked]="renonciation()"
          (change)="renonciation.set(!renonciation())"
        />
        Je demande l’accès immédiat à l’abonnement et je reconnais perdre mon droit de rétractation
        de 14 jours.
      </label>
      <button
        type="button"
        class="btn btn-primary bloc"
        [attr.aria-describedby]="renonciation() ? null : 'renonciation-aide'"
        [disabled]="!renonciation() || envoi()"
        (click)="payer()"
      >
        S’abonner
      </button>
      <p id="renonciation-aide" class="hint">
        Coche la case pour t’abonner. Le prix s’affiche sur la page de paiement sécurisée de Stripe,
        avant toute validation. L’abonnement se résilie à tout moment, depuis cette page.
      </p>
    }
    <p class="hint" role="status">{{ message() }}</p>
    <p class="bloc"><a routerLink="/">Revenir à ma journée</a></p>
  `,
})
export class AbonnementPage implements OnInit {
  /** « merci » au retour de Stripe après le paiement (paramètre de l'adresse). */
  readonly statut = input<string>();

  private readonly service = inject(AbonnementService);
  protected readonly date = date;
  protected readonly abonnement = signal<Abonnement | null>(null);
  protected readonly actif = computed(() => estActif(this.abonnement(), new Date()));
  protected readonly charge = signal(false);
  protected readonly renonciation = signal(false);
  protected readonly envoi = signal(false);
  protected readonly message = signal('');

  async ngOnInit(): Promise<void> {
    if (this.statut() === 'merci') await this.service.synchroniser();
    await this.charger();
  }

  protected async charger(): Promise<void> {
    this.abonnement.set(await this.service.charger());
    this.charge.set(true);
  }

  protected payer(): Promise<void> {
    return this.lancer(() => this.service.payer());
  }

  protected gerer(): Promise<void> {
    return this.lancer(() => this.service.gerer());
  }

  private async lancer(action: () => Promise<string | null>): Promise<void> {
    if (this.envoi()) return;
    this.envoi.set(true);
    this.message.set('');
    const erreur = await action();
    this.envoi.set(false);
    if (erreur) this.message.set(erreur);
  }
}
