import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Projets de pages légales, à faire relire par un juriste avant toute mise en ligne
// (docs/questions-juriste.md). Les informations propres à l'éditeur sont marquées A_COMPLETER.
// Depuis le 9 novembre 2026, aucune donnée de l'élève ne quitte son navigateur.

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
    <p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com).</p>
    <h2 class="bloc">Contenus</h2>
    <p>
      Les cours et les questions sont écrits par chaque élève, et restent sur son appareil.
      StudyQuest ne les voit pas et n’en vérifie pas l’exactitude.
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
    <p class="intro">
      StudyQuest n’a pas de serveur pour tes données : tout reste dans ton navigateur.
    </p>
    <h2 class="bloc">Ce qui est gardé, et où</h2>
    <p>
      Ton pseudo, ton avatar, tes cours, tes questions, tes révisions, ton XP, ta série et tes
      examens blancs sont enregistrés dans le stockage local de ton navigateur, sur ton appareil.
      Rien de tout cela n’est envoyé à StudyQuest ni à personne d’autre. Aucune adresse e-mail ni
      aucun mot de passe ne te sont demandés.
    </p>
    <p>
      Aucun outil de mesure d’audience, aucun cookie publicitaire et aucun service tiers n’est
      utilisé.
    </p>
    <h2 class="bloc">L’hébergeur</h2>
    <p>
      Pour t’envoyer les pages du site, l’hébergeur (Vercel) reçoit, comme pour tout site web, ton
      adresse IP et des informations techniques sur ton navigateur. Il les garde quelque temps dans
      ses journaux techniques. Contact pour toute question : A_COMPLETER : adresse e-mail.
    </p>
    <h2 class="bloc">Tes droits</h2>
    <p>
      Tes données sont sur ton appareil : tu les effaces quand tu veux depuis ton
      <a routerLink="/profil">profil</a>, « Supprimer mes données », ou en effaçant les données du
      site dans ton navigateur. Tu peux adresser une réclamation à la CNIL (cnil.fr).
    </p>
  `,
})
export class ConfidentialitePage {}

/** Conditions d'utilisation. */
@Component({
  selector: 'sq-conditions-page',
  imports: [RouterLink],
  template: `
    <h1>Conditions d’utilisation</h1>
    <h2 class="bloc">Le service</h2>
    <p>
      StudyQuest t’aide à réviser les cours que tu écris toi-même, sous forme de jeu. Il est gratuit,
      ne vend rien, et s’adresse aux personnes de 15 ans et plus.
    </p>
    <h2 class="bloc">Ton utilisation</h2>
    <p>
      Tu déclares avoir 15 ans ou plus en cliquant sur « Commencer ». Il n’y a pas de compte : ta
      progression est gardée par ce navigateur, sur cet appareil. Elle est perdue si tu effaces les
      données du navigateur ou changes d’appareil, et StudyQuest ne peut pas la récupérer.
    </p>
    <h2 class="bloc">Tes cours</h2>
    <p>
      Tu es responsable de ce que tu écris. StudyQuest ne remplace pas ton cours ni tes professeurs.
    </p>
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
