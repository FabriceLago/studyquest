# Ajout du 7 novembre 2026 : utilisation libre, sans création de compte

## But

Plus d'inscription : ni e-mail, ni mot de passe, ni e-mail de confirmation. L'élève ouvre l'app et commence tout de suite.

## Comment

- **Session anonyme Supabase :** à la première visite, l'app ouvre une session anonyme, sur demande de l'élève. Le serveur la voit comme un compte ordinaire. Tout le reste fonctionne donc sans changement : révision, ville, groupes, partage, duels, cours tapés à la main et import.
- **Écran « Bienvenue » :** il remplace « Inscription » et « Connexion ». Il présente l'app en une phrase et contient une seule case, « J'ai 15 ans ou plus », puis un bouton « Commencer ».
- **La case d'âge reste :** l'app vise les 15 ans et plus, et cette déclaration est déjà exigée par le serveur. La retirer changerait la base légale (consentement numérique, à voir avec le juriste).
- **Pseudo :** « Joueur » par défaut, modifiable dans Profil comme aujourd'hui.

## Ce qui disparaît

- Les pages Inscription et Connexion, et leurs adresses, qui mènent désormais à Bienvenue.
- Le code de l'e-mail et du mot de passe : inscription, connexion, renvoi de confirmation.
- Le bouton « Se déconnecter » : avec une session anonyme, se déconnecter ferait perdre l'accès pour toujours.

## Limites connues

- **Progression liée au navigateur :** elle est gardée sur le serveur, mais seulement ce navigateur y a accès. Effacer les données du navigateur ou changer d'appareil fait repartir de zéro. Bienvenue et Profil le disent clairement.
- **Quota d'import contournable :** une nouvelle session anonyme repart avec 5 imports. Ça ne coûte rien tant que l'IA n'est pas branchée. Avant de la brancher, il faudra un captcha. Supabase limite déjà les sessions anonymes à 30 par heure et par adresse IP (valeur par défaut).
- **Plus tard, si tu le veux :** « Retrouver ma progression sur un autre appareil », en ajoutant une adresse e-mail à la session anonyme. Supabase le permet.

## Ce que je change

- **Code :** écran Bienvenue ; le garde des routes mène à Bienvenue s'il n'y a pas de session ; retrait du code e-mail et mot de passe ; Profil sans « Se déconnecter », avec l'avertissement et « Supprimer mes données ».
- **Configuration :** `enable_anonymous_sign_ins = true` dans `config.toml`, pour la base locale.
- **Pages légales :** plus d'adresse e-mail ni de mot de passe collectés ; données liées au navigateur ; effacement par « Supprimer mes données ». Une question de plus pour le juriste dans `docs/questions-juriste.md`.

## Ce que tu fais (un interrupteur)

Dans le tableau de bord Supabase : **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Je n'ai pas d'outil pour ce réglage.

Les réglages d'e-mail demandés plus tôt (Site URL, Redirect URLs) ne servent plus. Le secret `SITE_URL` des fonctions reste utile pour l'import.

## Preuves demandées avant de dire « terminé »

- **Tests en base :** une session anonyme avec la déclaration reçoit son profil, une session sans déclaration est refusée, et une session anonyme n'accède qu'à ses propres données.
- **Parcours de bout en bout, sur mobile et sur ordinateur :**
  - Bienvenue : la case est exigée, puis l'élève arrive sur Aujourd'hui ;
  - écrire et jouer un cours ;
  - recharger la page sans perdre sa progression ;
  - audit d'accessibilité sans défaut.
- **Vérifications existantes :** tous les parcours existants passent, adaptés à Bienvenue à la place de l'inscription par e-mail. Lint, tests unitaires et build restent verts.
- **En ligne :** une fois l'interrupteur activé, je vérifie sur https://studyquest-orcin.vercel.app qu'un visiteur commence sans compte.

Phrase de fin, seulement si tout est prouvé : « UTILISATION LIBRE TERMINÉE — EN ATTENTE DE VALIDATION ».
