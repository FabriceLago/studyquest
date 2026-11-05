import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

// Projets de pages légales, à faire relire par un juriste avant toute mise en ligne
// (docs/questions-juriste.md). Les informations propres à l'éditeur sont marquées A_COMPLETER.

/** Mentions légales (loi pour la confiance dans l'économie numérique, article 6). */
@Component({
  selector: 'sq-mentions-page',
  imports: [RouterLink],
  template: `
    <h1>Mentions légales</h1>
    <h2 class="bloc">Éditeur</h2>
    <p>
      A_COMPLETER : nom et prénom, ou raison sociale, forme juridique et capital.<br />
      A_COMPLETER : adresse postale.<br />
      A_COMPLETER : numéro SIREN ou RCS, s’il y en a un.<br />
      Contact : A_COMPLETER : adresse e-mail.
    </p>
    <p>Direction de la publication : A_COMPLETER.</p>
    <h2 class="bloc">Hébergement</h2>
    <p>Site : A_COMPLETER : hébergeur choisi, adresse et téléphone indiqués dans son contrat.</p>
    <p>
      Comptes et base de données : Supabase Inc., A_COMPLETER : adresse indiquée dans le contrat.
      Les données sont stockées dans l’Union européenne.
    </p>
    <h2 class="bloc">Contenus</h2>
    <p>
      Les questions sont créées par une intelligence artificielle à partir des cours importés par
      chaque élève. Elles peuvent contenir des erreurs : chaque question cite le passage du cours
      dont elle vient, et peut être retirée de ses révisions.
    </p>
    <p>
      Données personnelles : voir la
      <a routerLink="/confidentialite">politique de confidentialité</a>.
    </p>
  `,
})
export class MentionsPage {}

/** Politique de confidentialité (RGPD, articles 12 à 14). */
@Component({
  selector: 'sq-confidentialite-page',
  imports: [RouterLink],
  template: `
    <h1>Confidentialité</h1>
    <p class="intro">Ce que StudyQuest enregistre, pourquoi, et comment exercer tes droits.</p>
    <h2 class="bloc">Responsable du traitement</h2>
    <p>
      L’éditeur indiqué dans les <a routerLink="/mentions-legales">mentions légales</a>. Contact
      pour toute question sur tes données : A_COMPLETER : adresse e-mail.
    </p>
    <h2 class="bloc">Ce qui est enregistré</h2>
    <ul>
      <li>
        Ton adresse e-mail et ton mot de passe (gardé sous forme d’empreinte, jamais en clair), pour
        te connecter, et ta déclaration d’avoir 15 ans ou plus.
      </li>
      <li>Ton pseudo et ton avatar, pour l’affichage.</li>
      <li>
        Les cours que tu importes : leur texte, et les questions et cartes créées à partir d’eux. Un
        fichier PDF ou une photo est effacé dès que son texte est lu.
      </li>
      <li>
        Tes réponses, tes révisions, ton XP, ta série, tes examens blancs et tes duels, pour faire
        fonctionner les révisions et le jeu.
      </li>
      <li>
        Si tu rejoins un groupe : les autres membres voient ton pseudo, ton XP de la semaine et ta
        série, jamais tes cours. La personne qui a créé le groupe peut t’en retirer.
      </li>
      <li>
        Si tu partages un cours par code : chaque personne qui utilise le code reçoit sa propre
        copie de ses questions, pas le texte du cours.
      </li>
      <li>
        Si tu actives le rappel du jour : l’heure choisie et l’adresse que ton navigateur donne pour
        recevoir les notifications.
      </li>
    </ul>
    <p>
      Base légale : l’exécution du service que tu demandes en créant un compte (RGPD, article 6,
      paragraphe 1, b). Ces données ne sont ni vendues ni utilisées pour de la publicité. Aucun
      outil de mesure d’audience ni aucun cookie publicitaire n’est utilisé.
    </p>
    <h2 class="bloc">Qui traite ces données</h2>
    <ul>
      <li>Supabase : comptes et base de données, dans l’Union européenne.</li>
      <li>A_COMPLETER : l’hébergeur du site, qui garde des journaux techniques de connexion.</li>
      <li>
        Anthropic : le texte de chaque cours importé lui est envoyé pour créer les questions.
        A_COMPLETER : conditions de conservation et cadre du transfert hors de l’Union européenne,
        d’après le contrat signé avec Anthropic.
      </li>
      <li>
        Stripe, si tu t’abonnes : il reçoit ton adresse e-mail et tes données de paiement.
        StudyQuest ne voit ni ne garde ton numéro de carte, seulement l’état de l’abonnement. Les
        factures sont gardées dix ans, comme l’exige la loi.
      </li>
      <li>
        Le service de notification de ton navigateur (Google, Mozilla, Apple ou Microsoft), si tu
        actives le rappel.
      </li>
      @if (captcha) {
        <li>
          Cloudflare, pour vérifier que les formulaires de compte sont remplis par une personne. Il
          reçoit ton adresse IP et des informations techniques sur ton navigateur.
        </li>
      }
    </ul>
    <p>
      Tout est gardé jusqu’à la suppression de ton compte, puis disparaît des sauvegardes au bout de
      A_COMPLETER : durée de conservation des sauvegardes.
    </p>
    <h2 class="bloc">Tes droits</h2>
    <ul>
      <li>Effacement : depuis ton <a routerLink="/profil">profil</a>, « Supprimer mon compte ».</li>
      <li>
        Accès, rectification, portabilité, limitation, opposition : écris à l’adresse de contact
        ci-dessus.
      </li>
    </ul>
    <p>
      Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL
      (cnil.fr).
    </p>
  `,
})
export class ConfidentialitePage {
  /** Captcha réglé (clé Turnstile) : il est mentionné. */
  protected readonly captcha = environment.turnstileSiteKey !== '';
}

/** Conditions d'utilisation et de vente. */
@Component({
  selector: 'sq-conditions-page',
  imports: [RouterLink],
  template: `
    <h1>Conditions d’utilisation et de vente</h1>
    <h2 class="bloc">Le service</h2>
    <p>
      StudyQuest transforme les cours que tu importes en questions de révision, avec une
      intelligence artificielle, et organise tes révisions sous forme de jeu. Il s’adresse aux
      personnes de 15 ans et plus.
    </p>
    <h2 class="bloc">Ton compte</h2>
    <p>
      Tu déclares avoir 15 ans ou plus en créant ton compte. Tu es responsable de ton mot de passe
      et de ce que tu fais avec ton compte. Tu peux le supprimer à tout moment depuis ton profil.
    </p>
    <h2 class="bloc">Les cours que tu importes</h2>
    <p>
      N’importe que des cours que tu as le droit d’utiliser : tes notes, ou des documents qu’on t’a
      remis pour étudier. Ne partage par code que des cours que tu as le droit de partager. Les
      questions créées par l’IA peuvent contenir des erreurs : chacune cite le passage du cours dont
      elle vient, et tu peux retirer une question fausse. StudyQuest ne remplace pas ton cours.
    </p>
    <h2 class="bloc">Groupes et duels</h2>
    <p>
      Choisis un pseudo et des noms de groupe respectueux. La personne qui crée un groupe peut en
      retirer un membre. Un compte qui ne respecte pas ces règles peut être supprimé.
    </p>
    <h2 class="bloc">Abonnement</h2>
    <p>
      Sans abonnement, tu importes 5 cours par mois. L’abonnement mensuel porte cette limite à 30.
      Son prix est affiché sur la page de paiement, avant toute validation. Il est sans engagement :
      tu le résilies à tout moment depuis la page <a routerLink="/abonnement">Abonnement</a>, et il
      s’arrête à la fin de la période payée. Le paiement est traité par Stripe.
    </p>
    <p>
      En t’abonnant, tu demandes l’accès immédiat au service et tu reconnais perdre ton droit de
      rétractation de 14 jours, en cochant la case prévue (code de la consommation, article
      L221-28).
    </p>
    <p>Médiation de la consommation : A_COMPLETER : nom et adresse du médiateur choisi.</p>
    <h2 class="bloc">Responsabilité et droit applicable</h2>
    <p>
      Le service est fourni tel quel, et peut être interrompu pour maintenance. Ces conditions sont
      soumises au droit français. A_COMPLETER : date d’entrée en vigueur.
    </p>
    <p>
      Données personnelles : voir la
      <a routerLink="/confidentialite">politique de confidentialité</a>.
    </p>
  `,
})
export class ConditionsPage {}
