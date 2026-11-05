# StudyQuest : préparation du lancement (étape 8)

Rédigé le 5 novembre 2026. Rien n'a été publié, acheté ni créé à ta place.

## 1. Concurrence

Recherche sur le web du 5 novembre 2026, seulement à partir de pages publiques. Les prix viennent souvent d'offres de partenaires et sont à confirmer sur les sites des éditeurs.

- **Nomad Education, avec Nomad'IA (France) :** c'est le concurrent le plus direct. L'élève scanne ses cours (photo, PDF ou texte), et l'application en tire des quiz, des cartes et des paires à relier.
  - Nomad'IA est inclus dans l'abonnement NOMAD+, affiché à 119,99 € par an, souvent remisé vers 90 €.
  - L'éditeur dit faire valider les contenus par des enseignants.
  - Sources : [Nomad Education, page IA](https://www.nomadeducation.fr/ia), [offre partenaire Ornikar](https://www.ornikar.com/partenariats-club/nomad-education).
- **digiSchool Education (France) :** fiches de révision créées par IA et coach IA, gratuit avec achats intégrés. Source : [App Store](https://apps.apple.com/FR/app/id6443938926).
- **Wilgo (France) :** quiz de révision par IA, avec un scanner de devoirs. Source : [fiche de l'application](https://apps.appfollow.io/ios/wilgo-ia-ndeg1-quiz-revision/6746050626?country=es).
- **MIA :** application publique d'aide à la révision, annoncée en 2024 pour 200 000 élèves ; son déploiement en 2026 n'est pas confirmé. Source : [Euronews](https://www.euronews.com/2024/02/01/200000-french-students-to-benefit-from-the-rollout-of-mia-an-ai-powered-revision-app).
- **À l'international :** des dizaines d'applications transforment des notes en quiz et en cartes, certaines en jeu (Quizard, Gizmo, Quiz Genius, NotesXP, Recappy…). Source : [comparatif 2026](https://www.youlearn.ai/blogs/best-ai-flashcard-makers-quiz-generators-studying).

**Ce qui reste propre à StudyQuest :**
- la ville qui se construit selon la maîtrise réelle de chaque notion ;
- la révision espacée côté serveur, sans réponse donnée à l'avance ;
- chaque question qui cite le passage du cours dont elle vient ;
- les groupes par code et les duels.

**Ce qui est commun :** l'import de cours et la création de quiz par l'IA ne différencient plus. Nomad le fait déjà, avec des enseignants pour valider. La spécification le prévoyait : le différenciateur à tester est la carte.

## 2. Nom

« StudyQuest » est déjà pris par plusieurs produits (spécification § 12). Les propositions suivent l'idée de la ville qui s'allume.

**Domaines :** vérifiés par RDAP (registres AFNIC pour le `.fr`, Verisign pour le `.com`), le 5 novembre 2026. Un domaine connu répond bien « enregistré », et un domaine libre répond « introuvable ».

| Nom | .fr | .com |
|---|---|---|
| **Révicité** (revicite) | libre | libre |
| Quartier Savoir (quartiersavoir) | libre | libre |
| Lumicité (lumicite) | libre | pris (depuis 2017) |
| Révilume (revilume) | libre | pris |
| Savoirville (savoirville) | libre | pris |
| Studiville (studiville) | libre | pris |

**Marques :** aucune recherche sur le web ne montre d'usage de « Révicité ». **Je n'ai pas pu interroger les registres officiels** : leurs moteurs de recherche demandent un navigateur. Avant tout dépôt ou achat, il faut chercher le nom :
- sur [data.inpi.fr](https://data.inpi.fr) (France) ;
- sur [EUIPO eSearch](https://euipo.europa.eu/eSearch/) (Union européenne) ;
- sur la [Global Brand Database de l'OMPI](https://branddb.wipo.int).

Il faut regarder les classes 9 et 41 (logiciels, éducation). Le dépôt à l'INPI coûte environ 190 € pour une classe : à vérifier sur son site.

**Ma recommandation :** Révicité. Le nom est court, en français, il dit la révision et la ville, et ses deux domaines sont libres. Le choix te revient, et rien n'est réservé.

## 3. Hébergement

- **Base, comptes, fonctions : Supabase**, dans une région de l'Union européenne. L'offre gratuite met un projet en pause après 7 jours sans activité : elle convient à une bêta privée, pas à un lancement. L'offre Pro coûte 25 $ par mois et par organisation, plus le calcul au-delà d'un crédit de 10 $. Source : [Toolradar](https://toolradar.com/tools/supabase/pricing), prix relevés le 1er novembre 2026 sur supabase.com, à reconfirmer.
- **Site (fichiers statiques Angular) : Hostinger**, déjà prévu pour Cyber Academy et relié à ce poste. N'importe quel hébergement statique en https convient aussi.
- **Paiement : Stripe**. Aucun abonnement mensuel, une commission par paiement, à vérifier sur stripe.com/fr/pricing.
- **IA : Anthropic**, au coût mesuré à l'étape 1, qui attend toujours ta clé.

**Recommandation :** Supabase Pro dans l'Union européenne et Hostinger pour le site, mais seulement après l'étape 1 et le choix du prix.

## 4. Audit de production (sur le poste, le 5 novembre 2026)

| Point | Résultat |
|---|---|
| Dépendances de production (`npm audit --omit=dev`) | 0 vulnérabilité |
| Secrets suivis par git (`.env`, clés Stripe, VAPID, Anthropic) | aucun |
| Droits en base | couverts par les tests pgTAP, tous verts (chiffre dans le plan, état de l'étape 8) |
| `supabase db lint` | 2 avertissements, sans risque : `reponse_juste` (faux positif, la fonction ne lit aucune table) et `serie_et_gels` (tableau de dates initialisé par `'{}'`, converti correctement) |
| Accessibilité | audit axe sans erreur sur toutes les pages parcourues par les tests |
| CSP (`src/index.html`) | n'autorise que le Supabase local : à compléter au déploiement |
| Pages légales | projets, avec des passages A_COMPLETER |

## 5. Ce que tu dois faire, toi seul

1. **Paiement d'essai :**
   - Crée un compte Stripe et reste en mode test.
   - Crée un produit avec un prix mensuel.
   - Mets dans `app/supabase/functions/.env` : `STRIPE_SECRET_KEY` (la clé `sk_test_…`) et `STRIPE_PRICE_MENSUEL` (l'identifiant `price_…`).
   - Ne colle rien dans le chat. Je ferai alors le paiement d'essai avec la carte de test 4242.
2. **Juriste :** envoie-lui `docs/questions-juriste.md`, avec les trois pages légales.
3. **Nom :** choisis-en un, vérifie les marques sur les trois registres, puis réserve le domaine si tu le veux.
4. **Étape 1 :** ta clé Anthropic, toujours en attente. Elle fixera le modèle, le quota et le prix.

## 6. Liste de mise en ligne (pour plus tard)

- **Supabase :** créer le projet dans l'Union européenne et appliquer les migrations.
- **Secrets des fonctions :**
  - `SITE_URL` ;
  - les clés Stripe de production et le secret du webhook ;
  - une nouvelle paire VAPID, avec `VAPID_SUBJECT` et un vrai e-mail de contact ;
  - `RAPPELS_SECRET` ;
  - `ANTHROPIC_API_KEY` et `IMPORT_MODEL`.
  - **Ne pas** régler `PUSH_HOTE_LOCAL`, réservé au poste de développement.
- **Coffre de la base :** les secrets `rappels_url` (adresse de la fonction `envoyer-rappels`) et `rappels_secret`, pour que `pg_cron` envoie les rappels.
- **Stripe :**
  - déclarer le webhook vers `…/functions/v1/webhook-stripe`, pour les événements `customer.subscription.*` ;
  - régler la résiliation automatique après des impayés répétés ;
  - activer le portail client.
- **Application :**
  - configuration de production : adresse et clé publique Supabase, clé VAPID publique, clé Turnstile ;
  - CSP à compléter ;
  - aucune mention A_COMPLETER ne doit rester dans les pages légales.
