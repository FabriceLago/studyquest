import { InjectionToken } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Client chargé à la demande : la bibliothèque ne ralentit pas le premier affichage.
 * `flowType: 'pkce'` : le lien de confirmation n'est accepté que par le navigateur qui a lancé
 * l'inscription, ce qui empêche de connecter quelqu'un au compte d'un autre.
 */
export const SUPABASE = new InjectionToken<Promise<SupabaseClient>>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      }),
    ),
});
