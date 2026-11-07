import { InjectionToken } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Client chargé à la demande : la bibliothèque ne ralentit pas le premier affichage. La session
 * anonyme est gardée par ce navigateur ; aucun lien de connexion ne passe par l'adresse de la page.
 */
export const SUPABASE = new InjectionToken<Promise<SupabaseClient>>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      }),
    ),
});
