// Lance ou reprend un import : répond tout de suite, puis travaille en arrière-plan (une requête doit
// répondre sous 150 s). Le statut est enregistré à chaque étape, le navigateur le relit.
import { createClient } from '@supabase/supabase-js';
import { creerIA } from '../_shared/ia.ts';
import { MESSAGES, traiter, type Depot, type IA } from '../_shared/pipeline.ts';

declare const EdgeRuntime: { waitUntil(promesse: Promise<unknown>): void };

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: { persistSession: false },
  },
);
const ORIGINES = (Deno.env.get('SITE_URL') ?? '').split(',');
const MAX_FICHIERS = 30;
const MAX_OCTETS = 20 * 1024 * 1024;
const IMAGES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function enBase64(octets: Uint8Array): string {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000)
    binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

function depotPour(id: string, owner: string): Depot {
  const dossier = `${owner}/${id}`;
  const stockage = admin.storage.from('imports');
  const noms = async () => {
    const { data, error } = await stockage.list(dossier, {
      limit: MAX_FICHIERS + 1,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    return data ?? [];
  };
  return {
    async lireFichiers() {
      // Revérifié ici : le navigateur peut être contourné.
      const fichiers = await noms();
      const total = fichiers.reduce((somme, f) => somme + Number(f.metadata?.size ?? 0), 0);
      if (fichiers.length === 0 || fichiers.length > MAX_FICHIERS || total > MAX_OCTETS)
        throw new Error('Fichiers hors limites');
      return Promise.all(
        fichiers.map(async (f) => {
          const { data, error } = await stockage.download(`${dossier}/${f.name}`);
          if (error) throw error;
          const base64 = enBase64(new Uint8Array(await data.arrayBuffer()));
          const extension = f.name.split('.').pop()?.toLowerCase() ?? '';
          if (extension === 'pdf')
            return {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            };
          if (!IMAGES[extension]) throw new Error('Type de fichier refusé');
          return {
            type: 'image',
            source: { type: 'base64', media_type: IMAGES[extension], data: base64 },
          };
        }),
      );
    },
    async supprimerFichiers() {
      const fichiers = await noms();
      if (fichiers.length > 0) await stockage.remove(fichiers.map((f) => `${dossier}/${f.name}`));
    },
    async majCours(champs) {
      const { error } = await admin.from('courses').update(champs).eq('id', id);
      if (error) throw error;
    },
    async enregistrer(notions, coutUsd) {
      const { error } = await admin.rpc('enregistrer_generation', {
        p_id: id,
        p_notions: notions,
        p_cout: coutUsd,
      });
      if (error) throw error;
    },
  };
}

Deno.serve(async (req) => {
  const origine = req.headers.get('Origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGINES.includes(origine) ? origine : (ORIGINES[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const repondre = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return repondre({ error: 'Méthode non autorisée.' }, 405);

  const jeton = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  const { data: session } = jeton ? await admin.auth.getUser(jeton) : { data: { user: null } };
  if (!session.user) return repondre({ error: 'Connexion requise.' }, 401);

  const { cours: id } = await req.json().catch(() => ({ cours: null }));
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))
    return repondre({ error: 'Cours invalide.' }, 400);

  // Seul l'appel qui fait avancer le statut travaille : un double clic ne paie pas deux fois.
  const { data: lignes, error } = await admin.rpc('demarrer_import', {
    p_id: id,
    p_owner: session.user.id,
  });
  if (error) return repondre({ error: 'Import impossible.' }, 500);
  const cours = lignes?.[0];
  if (!cours) return repondre({ error: 'Ce cours n’est pas à lancer.' }, 409);

  const depot = depotPour(id, session.user.id);
  let ia: IA;
  try {
    ia = creerIA();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    await depot.supprimerFichiers().catch(() => {});
    await depot.majCours({
      statut: 'echec',
      raison: MESSAGES.panne,
      cout_usd: Number(cours.cout_usd),
    });
    return repondre({ statut: 'echec' }, 202);
  }
  EdgeRuntime.waitUntil(traiter({ ...cours, cout_usd: Number(cours.cout_usd) }, ia, depot));
  return repondre({ statut: cours.statut }, 202);
});
