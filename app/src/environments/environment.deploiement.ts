/**
 * Déploiement privé (Vercel et Supabase), construit par `npm run build:deploiement`. Les tests de
 * bout en bout gardent environment.ts et la pile locale. La clé « publishable » est faite pour le
 * navigateur : ce sont les politiques RLS qui protègent les données.
 */
export const environment = {
  supabaseUrl: 'A_REGLER',
  supabasePublishableKey: 'A_REGLER',
  /** Pas de captcha tant que le déploiement reste privé. */
  turnstileSiteKey: '',
  /** Application gratuite : aucun paiement (demande du 5 novembre 2026). */
  paiement: false,
  /** Clé publique VAPID de ce déploiement ; la clé privée est dans les secrets Supabase. */
  vapidPublicKey: 'A_REGLER',
};
