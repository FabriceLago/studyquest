# StudyQuest : questions pour un juriste

Préparé le 5 novembre 2026, avant toute mise en ligne. Les projets de pages légales sont dans l'application, aux adresses `/mentions-legales`, `/confidentialite` et `/conditions` (fichier `app/src/app/features/legal/pages-legales.ts`). Les passages marqués A_COMPLETER attendent les informations de l'éditeur.

## Le service en bref

- **Ce que c'est :** une application web de révision, pour les personnes de 15 ans et plus. L'élève importe ses cours (texte, PDF ou photos), et une IA (Claude, d'Anthropic) en tire des questions et des cartes.
- **Âge :** il est seulement déclaré à l'inscription, sans date de naissance et sans vérification.
- **Partage :** un élève peut transmettre une copie de ses questions par code, à 50 personnes au plus, après avoir déclaré en avoir le droit.
- **Social :** groupes par code, avec un classement de la semaine (pseudo, XP de la semaine, série), et des duels.
- **Abonnement :** mensuel, sans engagement, par Stripe. Il relève le nombre d'imports de cours par mois.
- **Rappels :** une notification par jour au plus, seulement si l'élève l'a activée.
- **Mesure et publicité :** aucune mesure d'audience, aucune publicité.

## Questions

1. **Âge du consentement numérique :** la limite de 15 ans suffit-elle pour la France ? Et pour la Belgique, où il serait de 13 ans (non vérifié sur les textes) ? Une simple déclaration de l'âge est-elle acceptable ?
2. **Achat par un mineur :** un élève de 15 à 17 ans peut-il souscrire seul l'abonnement mensuel ? Faut-il l'accord d'un parent, ou une mention particulière dans les conditions de vente ?
3. **Droit de rétractation :** la case « Je demande l'accès immédiat […] et je reconnais perdre mon droit de rétractation de 14 jours » (article L221-28 du code de la consommation) est-elle valable pour un abonnement à un service numérique ? Et pour un mineur ?
4. **Anthropic, sous-traitant :** le texte des cours est envoyé à Anthropic pour créer les questions. Quel contrat signer (accord de traitement des données) ? Comment encadrer le transfert hors de l'Union européenne ? Que faut-il écrire dans la politique de confidentialité ?
5. **Droit d'auteur des cours importés :** un élève importe souvent un cours écrit par son professeur. L'usage personnel de révision pose-t-il problème ? Et le partage par code d'une copie des questions tirées de ce cours, à 50 personnes au plus, avec une simple déclaration de l'élève qui partage ?
6. **Responsabilité sur le contenu généré :** quelle mention suffit pour des questions créées par l'IA, qui peuvent être fausses ? Chaque question cite le passage du cours dont elle vient.
7. **Classement entre élèves :** afficher le pseudo, l'XP de la semaine et la série aux membres d'un groupe, avec l'accord donné en rejoignant le groupe par code, est-ce suffisant ?
8. **Médiation de la consommation :** quel médiateur choisir, et quelles mentions ajouter ?
9. **Éditeur :** que faut-il publier dans les mentions légales si l'éditeur est une personne physique, sans société ?
10. **Conservation :** quelles durées retenir pour les comptes inactifs, les sauvegardes et les journaux techniques ?
11. **Utilisation sans compte (depuis le 7 novembre 2026) :** l'élève coche « J'ai 15 ans ou plus » puis commence. Une session anonyme, gardée par son navigateur, remplace le compte, sans e-mail. Cette case suffit-elle ? Comment répondre à une demande d'accès ou de portabilité alors qu'on ne peut pas identifier la personne autrement que par son navigateur ? Combien de temps garder les données d'une session abandonnée ?

## Pièces à joindre

- Les trois pages, en capture ou en texte.
- La spécification : `docs/superpowers/specs/2026-11-02-studyquest-design.md`, § 7 (Sécurité, vie privée, juridique).
