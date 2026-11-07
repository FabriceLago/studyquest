# Ajout du 7 novembre 2026 : cours tapé à la main

## But

L'élève crée un cours en tapant lui-même ses notions et ses questions. Ni IA, ni quota, ni coût : l'application gratuite sert même sans clé Anthropic.

## Parcours

1. Sur « Importer un cours », un lien « Écrire mes questions moi-même » mène à `/cours/ecrire`. Le même lien apparaît sur Aujourd'hui quand l'élève n'a encore aucun cours.
2. L'élève donne un titre au cours, puis ajoute des notions. Pour chaque notion :
   - un titre ;
   - « À retenir », une ou deux phrases. Elles forment la carte de la notion : le recto est le titre, le verso est ce texte ;
   - des questions.
3. Une question comprend un énoncé, 2 à 6 choix et une explication facultative. Chaque choix a une case « bonne réponse » :
   - une seule case cochée donne une question à choix unique ;
   - plusieurs cases cochées donnent une question à choix multiple ;
   - un bouton « Vrai ou faux » remplace les choix par Vrai et Faux.
4. « Enregistrer » crée le cours, prêt tout de suite. Une seule notion suffit. La page d'un cours écrit à la main a un bouton « Ajouter des notions », pour continuer plus tard sans tout taper d'un coup sur un téléphone.

## Règles

- **Quota :** pas d'appel à l'IA, et le compteur d'imports du mois ne bouge pas.
- **Limites, réglables avec les autres valeurs :** 12 notions par cours, 20 questions par notion, 2 à 6 choix. Longueurs : énoncé 300 signes, choix 150, « À retenir » et explication 300. Au plus 100 cours écrits à la main par compte, pour protéger la base gratuite.
- **Contrôles côté serveur :** une seule bonne réponse pour un choix unique ou un vrai/faux, au moins une pour un choix multiple. Les choix d'une question sont distincts et non vides. Ce sont les mêmes règles que pour les questions de l'IA.
- **Ordre des choix :** il est mélangé par le serveur, sauf pour Vrai/Faux, comme pour l'import.
- **Réponses :** elles restent côté serveur, jamais lisibles par le navigateur. C'est ce qui protège les copies partagées.
- **Sans extrait :** la citation « Dans ton cours… » n'apparaît pas pour ces questions. L'explication s'affiche si l'élève en a écrit une. La fiche imprimable montre les cartes.
- **Comme les autres cours, sans changement :** révision, XP, missions, ville, examen blanc, duel et partage par code. La déclaration du droit de partager reste demandée : un élève peut avoir recopié un manuel.
- **XP :** créer un cours ne rapporte rien. Le plafond de 300 XP par jour et les 2 nouvelles notions par jour de Découvrir limitent le gain au niveau d'un cours importé. Limite connue : un élève peut se poser des questions faciles. Comme chacun révise ses propres cours, ce n'est pas nouveau.
- **Pas de modification d'une question :** l'élève la retire, avec le bouton existant, puis en écrit une autre. Modifier une question déjà en révision fausserait ses boîtes.

## Hors de cette version

Associations et classements écrits à la main, import d'un fichier de questions (CSV, Anki), modification d'une question, images dans les questions, brouillon gardé sur l'appareil.

## Technique

- **Migration :**
  - le format `manuel` est accepté ;
  - la fonction `ecrire_cours(p_cours, p_titre, p_notions)` crée le cours, ou lui ajoute des notions s'il s'agit d'un cours manuel de l'élève. Elle fonctionne en tout ou rien, en `security definer` avec `search_path = ''` ;
  - `regles()` reçoit les nouvelles limites.
- **Écran :** une page `features/cours/ecrire-page.ts`, servie par les routes `cours/ecrire` et `cours/:id/ecrire`, et les liens sur Importer, Aujourd'hui et la page du cours. Un extrait vide n'est affiché nulle part : session, page du cours, fiche.
- **Branche :** une nouvelle branche locale `cours-a-la-main`, partie de `etape-4-import`.

## Preuves demandées avant de dire « terminé »

- **Tests pgTAP :**
  - création et ajout ;
  - refus : limites dépassées, aucune bonne réponse, deux bonnes réponses à un choix unique, cours d'un autre élève, cours importé ;
  - quota inchangé et réponses illisibles par le navigateur ;
  - copie partagée qui fonctionne.
- **Test unitaire :** la validation du formulaire.
- **Parcours de bout en bout, sur mobile et sur ordinateur :**
  - écrire un cours de 2 notions et le retrouver ;
  - répondre juste dans Découvrir et voir le quartier dans la ville ;
  - ajouter une notion plus tard ;
  - audit d'accessibilité sans défaut.
- **Vérifications existantes :** lint, build et tous les tests déjà en place restent verts.

Phrase de fin, seulement si tout est prouvé : « COURS TAPÉ À LA MAIN TERMINÉ — EN ATTENTE DE VALIDATION ».
