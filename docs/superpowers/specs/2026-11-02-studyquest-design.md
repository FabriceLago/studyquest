# StudyQuest : conception

- **Date :** 2 novembre 2026
- **Statut :** en attente de relecture, aucun code écrit
- **Nom :** provisoire (voir § 12)

## 1. Objectif

Transformer les révisions en jeu quotidien de 5 à 10 minutes. L'élève importe ses propres cours, et l'application en tire des questions, des missions et une carte qui montre ce qu'il maîtrise.

**Public de la première version :** lycéens et étudiants de 15 ans et plus, francophones (France et Belgique).

Le « fort potentiel d'engagement » est une hypothèse à prouver, pas un acquis (voir § 9).

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Public | 15 ans et plus |
| Contenu | Import de cours par l'élève, génération par IA |
| Support | Web installable, pensé pour le mobile |
| Technique | Nouveau projet Angular + Supabase, en copiant les briques utiles de Cyber Academy |
| Modèle d'IA | Choisi après un test sur 10 vrais cours (étape 1) |
| Référence visuelle | Image Dribbble (WebDesk Solution), inspiration seulement : aucun élément copié |

## 3. Règles du jeu

Les valeurs chiffrées sont des valeurs de départ, regroupées dans un seul fichier de constantes pour pouvoir les régler.

### Session du jour

Le serveur calcule chaque jour trois missions :

1. **Réviser :** répondre aux questions dues, 15 au maximum, les plus en retard d'abord.
2. **Découvrir :** répondre aux questions de 2 nouvelles notions, soit 8 questions.
3. **Défi :** 60 secondes, uniquement sur des questions déjà vues. Disponible à partir de 5 questions vues. Seul le premier essai du jour rapporte de l'XP.

Une mission sans question disponible n'est pas proposée. Si aucune ne peut l'être, l'application invite à importer un cours.

**Fuseau horaire :** Europe/Paris pour tout le monde en première version. Les élèves d'autres fuseaux verront la journée changer à une heure décalée.

### Révision espacée

Système de Leitner à 5 boîtes : 1, 3, 7, 14 et 30 jours. Une bonne réponse fait passer à la boîte suivante, une mauvaise renvoie à la boîte 1. Une notion est **maîtrisée** quand toutes ses questions sont en boîte 3 ou plus.

Les **cartes** servent à la révision libre. Elles ne rapportent pas d'XP et ne comptent pas pour les missions, car l'élève s'y évalue lui-même.

### XP et niveaux

| Action | XP |
|---|---:|
| Bonne réponse à une question due | 10 |
| Bonne réponse à une nouvelle question | 5 |
| Bonne réponse au défi | 2 |
| Mission terminée | 20 |
| Importer un cours, mauvaise réponse, question non due, carte | 0 |

- **Plafond :** 300 XP par jour, au-dessus d'une session parfaite (environ 270 XP), pour limiter seulement le jeu au-delà de la session.
- **Niveau :** `floor(sqrt(xp / 100)) + 1`, soit le niveau 2 à 100 XP, le 3 à 400, le 4 à 900.
- **Principe :** comme chacun révise ses propres cours, l'XP récompense la régularité et les révisions dues, jamais le volume. On ne perd jamais d'XP.

### Récompenses et série de jours

- Les niveaux débloquent des bâtiments, des décors et des avatars, uniquement décoratifs : rien à acheter, pas de tirage au sort.
- Une journée compte pour la série dès qu'une mission est terminée.
- Deux jours de « gel » par mois civil s'appliquent automatiquement pour qu'une absence ne casse pas la série.

### Carte

- Un cours devient un quartier, une notion un emplacement, une notion maîtrisée un bâtiment.
- Une notion avec des questions dues affiche un repère. Rien n'est jamais détruit.
- Illustration isométrique en SVG, avec 8 types de bâtiments. Pas de moteur 3D ni d'image achetée.
- Le placement est déterminé par l'identifiant du cours, pour rester stable d'une visite à l'autre.
- **Accessibilité :** une liste textuelle des notions et de leur état accompagne la carte, et le mouvement réduit est respecté.

### Classement

- Uniquement par groupe, avec un code d'invitation (classe ou amis), 50 membres au maximum.
- Affiche le pseudo, l'XP de la semaine et la série, jamais les cours.
- Remise à zéro le lundi à 0 h.
- Pas de ligue publique au lancement, car elle serait vide. À ajouter quand il y aura assez d'élèves.

## 4. Import et génération

Tout se fait côté serveur.

| Format | Limites |
|---|---|
| PDF | 30 pages, 20 Mo |
| Photos (JPEG, PNG, WebP) | 30 photos, réduites à 1 600 px dans le navigateur avant l'envoi |
| Texte collé | 60 000 caractères |

Une seule génération à la fois par compte.

**Étapes et statuts :** `en_attente` → `transcription` → (`a_relire`, photos seulement) → `generation` → `pret` ou `echec`.

1. **Dépôt :** le fichier va dans un espace de stockage privé.
2. **Transcription :** l'IA transcrit le document en texte, puis le fichier original est supprimé. Une tâche planifiée supprime tout fichier restant après 24 h.
3. **Relecture (photos) :** l'élève voit le texte transcrit et peut le corriger avant la génération.
4. **Génération :** l'IA produit de 3 à 12 notions, 4 questions et 1 carte par notion, en JSON strict, dans la langue du cours. Types de questions : choix unique, choix multiple, vrai ou faux, association, classement.
5. **Contrôle :** chaque question cite un extrait. Le serveur vérifie qu'il existe dans le texte du cours (casse, espaces et apostrophes normalisés) et écarte la question sinon. Une notion sans question restante est écartée, et moins de 10 questions au total donne un `echec`.
6. **Relecture :** l'élève peut modifier ou supprimer chaque question, avec son extrait sous les yeux.

**Échecs et refus :** en cas d'erreur ou de refus de l'IA (`stop_reason: "refusal"`, par exemple un cours de biologie qui déclenche un filtre), l'élève voit la raison. Un import n'est décompté du quota qu'au statut `pret`.

**Reprise :** le statut est enregistré à chaque étape, ce qui permet de reprendre après une coupure.

**Notes pour l'API Claude**
- L'option de citations de l'API renvoie une erreur 400 avec `output_config.format` : d'où le contrôle maison de l'étape 5.
- Le repli serveur en cas de refus (`fallbacks: "default"`) existe pour Opus 5.5 et Sonnet 5.5, pas pour Haiku 5.5.
- Le tarif affiché de Haiku 5.5 vaut jusqu'à 100 000 tokens d'entrée, ce qui justifie aussi la limite de 30 pages.

## 5. Architecture

- **Application :** Angular 22, composants autonomes et signals, service worker pour l'installation. La première version demande une connexion pour jouer.
- **Serveur :** Supabase (PostgreSQL, Auth, Storage, Edge Functions, tâches planifiées).
- **IA :** SDK officiel Anthropic, appelé uniquement depuis les Edge Functions. La clé n'est jamais envoyée au navigateur.
- **Paiement :** Stripe.
- **Hébergement :** à choisir à l'étape 8.

### Briques reprises de Cyber Academy

Chemins relatifs à `cyber-academy/`, tous vérifiés le 2 novembre 2026.

| Brique | Fichier | Reprise |
|---|---|---|
| Saisie des 5 types de réponse | `src/app/features/quizzes/answer-input.ts` | Directe |
| Présentation des questions | `src/app/core/quiz/quiz-engine.ts` | Partielle : modèle de contenu à adapter |
| Calcul Leitner | `src/app/core/progress/flashcards.ts` | Calcul seulement : l'avancement passe du navigateur au serveur |
| Page de cartes | `src/app/features/glossary/flashcards-page.ts` | À adapter |
| Comptes | `src/app/core/auth/auth.service.ts` | Directe |
| Captcha | `src/app/shared/captcha/captcha.ts` | Directe |
| Groupes | `src/app/core/groups/groups.service.ts`, migration `20261029100000_groupes.sql` | À adapter |
| Correction côté serveur | migration `20261017180000_enregistrement.sql` | Modèle à suivre |
| Web installable | `ngsw-config.json` | À reconfigurer |
| Paiement | `supabase/functions/` (`create-checkout`, `stripe-webhook`, `customer-portal`, `_shared/billing.ts`) | À reconfigurer |
| Suivi des erreurs | `src/app/core/errors/reporting-error-handler.ts` | Directe |

**À écrire :** XP, badges et défis (`achievements.ts` et `challenges.ts` dépendent des leçons et des laboratoires). **À ne pas reprendre :** le catalogue figé à la compilation, car chaque élève a ici ses propres cours.

## 6. Données

| Table | Contenu |
|---|---|
| `profiles` | Pseudo, déclaration d'âge, heure du rappel |
| `courses` | Propriétaire, titre, statut, texte transcrit |
| `notions` | Cours, titre, ordre |
| `questions` | Notion, type, énoncé, options, extrait cité (questions et cartes) |
| `answer_keys` | Bonne réponse, aucune politique d'accès pour le navigateur |
| `reviews` | Élève, question, boîte, date d'échéance |
| `attempts` | Élève, question, réponse, résultat, XP, date |
| `daily_stats` | Élève, jour, XP, missions terminées, gel utilisé |
| `groups`, `group_members` | Groupes et membres |
| `subscriptions` | État de l'abonnement Stripe |
| `push_subscriptions` | Abonnements aux notifications |

- La carte, les niveaux et les missions sont calculés et ne sont pas stockés.
- Toutes les tables ont des politiques RLS : un élève n'accède qu'à ses propres cours.
- Une seule fonction serveur `submit_answer` corrige, met à jour la révision, attribue l'XP dans la limite du plafond et contrôle le temps du défi. Le navigateur ne reçoit la bonne réponse qu'après avoir répondu.

## 7. Sécurité, vie privée, juridique

- **Inscription :** e-mail, pseudo et déclaration d'avoir 15 ans ou plus, sans date de naissance. C'est une simple déclaration, qui ne prouve pas l'âge.
- **Documents importés :** type et taille contrôlés côté serveur, et limite d'imports par compte. L'IA n'a accès à aucun outil et sa sortie suit un schéma strict. Le contenu généré est affiché comme du texte, jamais comme du HTML.
- **Suppression :** supprimer un cours ou un compte efface les données liées.
- **Partage :** aucun partage public de cours en première version, ce qui limite le risque lié aux droits d'auteur des documents importés.
- **Engagement :** une notification par jour au maximum, seulement si l'élève l'a activée, et aucun message culpabilisant.
- **Mesure :** aucun outil d'analyse tiers en première version.

**À faire confirmer par un juriste avant le lancement :**
- l'âge du consentement numérique (15 ans en France et 13 ans en Belgique, d'après ce que je sais, non vérifié sur les textes) ;
- la déclaration d'Anthropic comme sous-traitant et le transfert des données ;
- l'achat par un mineur dans les CGV.

## 8. Modèle économique

Un quota gratuit d'imports et un abonnement. Les montants sont fixés après l'étape 1, à partir des coûts mesurés.

**Estimation de départ, non mesurée :** 40 000 tokens en entrée et 25 000 en sortie pour un cours de 10 pages, aux tarifs de la référence datée du 6 octobre 2026.

| Modèle | Par cours | Élève à 8 cours par mois |
|---|---:|---:|
| Claude Opus 5.5 | 0,66 $ | 5,28 $ |
| Claude Sonnet 5.5 | 0,33 $ | 2,64 $ |
| Claude Haiku 5.5 | 0,02 $ | 0,13 $ |

## 9. Tests et mesure du succès

- **Tests unitaires :** XP et plafond, missions, révision, série et gel, contrôle des extraits.
- **Tests en base :** droits d'accès, `submit_answer`, impossibilité de lire les réponses.
- **Tests de bout en bout :** parcours complet sur mobile, avec audit d'accessibilité.
- **IA :** l'intégration continue rejoue des réponses enregistrées et n'appelle jamais l'API.

**Mesure principale :** la part d'élèves ayant au moins une tentative entre le 7e et le 13e jour après leur inscription, calculée à partir de `attempts`. Le seuil est à fixer ensemble avant le lancement.

**Mesures secondaires :** part des imports qui aboutissent, coût réel par import, part des questions modifiées ou supprimées par les élèves.

## 10. Hors première version

App native, espace parent ou professeur, boutique, partage public de cours, duels en direct, ligue publique, jeu hors ligne, autres fuseaux horaires.

## 11. Ordre de construction

Une étape à la fois, avec validation avant la suivante.

1. **Test des modèles :** script seul, sans application. 10 cours (au moins 4 matières, dont 3 en photos), sur les 3 modèles. Mesures : tokens et coût réels, temps d'attente, part d'extraits rejetés, et part de questions fausses. Je compare au cours 15 questions tirées au sort par cours et par modèle, à l'aveugle (environ 450 au total), puis tu contrôles celles que je marque comme fausses et un échantillon de 30 autres. Seuil proposé : 5 % de questions fausses au maximum. Résultat : le modèle, le quota et le prix.
2. **Maquette mobile cliquable :** carte, mission du jour, session, défi. Sans serveur.
3. **Socle :** projet, briques reprises, comptes, intégration continue.
4. **Import et génération.**
5. **Session quotidienne :** révision, XP, missions, défi.
6. **Vraie carte, récompenses, série de jours.**
7. **Groupes et classement.**
8. **Paiement, rappels, pages légales, préparation de la mise en ligne.**

**Pour lancer l'étape 1, il faut :** ta clé d'API Anthropic dans une variable d'environnement (jamais dans le chat), 10 cours que tu as le droit d'utiliser, et ton accord pour un budget d'environ 10 $ selon l'estimation du § 8.

## 12. Points ouverts

- **Nom :** plusieurs produits utilisent déjà « StudyQuest » ou « Study Quest », dont une app iPhone de révision en jeu de rôle, un lancement Product Hunt qui crée ses questions à partir des documents de l'élève, et des projets de hackathon. Je recommande d'en choisir un autre avant toute page publique. La recherche de marque (INPI, EUIPO) et la disponibilité du domaine n'ont pas été vérifiées.
- **Concurrence :** ces produits montrent que l'idée n'est pas inédite. Aucune analyse complète n'a été faite. Le différenciateur à tester est la carte reliée à la maîtrise réelle, en français.
- **Durée des fonctions :** d'après la documentation Supabase lue le 2 novembre 2026, une Edge Function s'arrête après 150 s (offre gratuite) ou 400 s (offre payante), doit répondre sous 150 s, et dispose de 2 s de calcul par requête et de 256 Mo de mémoire. La fonction répondra donc tout de suite et poursuivra en arrière-plan. L'étape 1 mesure la durée réelle de chaque appel. Si un appel dépasse la limite de l'offre retenue, la génération sera découpée par notion.
- **Vérification de la transcription :** le contrôle des extraits compare les questions au texte transcrit, pas au document d'origine. Une erreur de transcription sur un PDF scanné peut donc passer. L'élève peut corriger la question, et l'étape 1 mesurera ce risque.
- **Seuil de rétention :** à fixer avant le lancement.
