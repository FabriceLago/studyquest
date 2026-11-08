/**
 * Déploiement public (Vercel et Supabase, projet studyquest), construit par
 * `npm run build:deploiement`. Les tests de bout en bout gardent environment.ts et la pile locale.
 * La clé « publishable » est faite pour le navigateur : ce sont les politiques RLS et les fonctions
 * du serveur qui protègent les données.
 */
export const environment = {
  supabaseUrl: 'https://dqremdjbtcvlvfuuxmbr.supabase.co',
  supabasePublishableKey: 'sb_publishable_GROXRsdmQQY0rV1IPO3a5Q_77m7PHgz',
  /** Pas de captcha pour l'instant : à régler avant d'ouvrir largement les inscriptions. */
  turnstileSiteKey: '',
  /** Application gratuite : aucun paiement (demande du 5 novembre 2026). */
  paiement: false,
  /** Vide : rappels masqués tant qu'aucune paire VAPID n'est réglée pour ce déploiement. */
  vapidPublicKey: '',
};
