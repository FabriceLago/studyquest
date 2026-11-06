/**
 * Connexion à la pile Supabase locale (npm run db:start). La clé « publishable » est faite pour le
 * navigateur et celle-ci est la clé locale par défaut de la CLI : ce sont les politiques RLS qui
 * protègent les données. La configuration de production sera ajoutée au déploiement (étape 8).
 */
export const environment = {
  supabaseUrl: 'http://127.0.0.1:54821',
  supabasePublishableKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  /** Captcha (Cloudflare Turnstile) : vide en local, donc aucun captcha. */
  turnstileSiteKey: '',
  /**
   * Abonnement payant : coupé pour l'instant (demande du 5 novembre 2026), l'application est
   * gratuite. Le serveur refuse de toute façon un paiement tant qu'aucun prix Stripe n'est réglé.
   */
  paiement: false,
  /** Clé publique des notifications (VAPID), locale : la paire de production est créée au déploiement. */
  vapidPublicKey:
    'BHfiiOKwv9UiVVCWVuPycjahrNFgj42_7bzHXDh7R0FEicbYtzo7TQfj00pokxAiJHN-bsJWFWLSWTNBzfxFAcI',
};
