import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { IA, ReponseIA } from './pipeline.ts';
import { Generation, GENERATION_SYSTEM, TRANSCRIPTION_PROMPT } from './schema.ts';

// $ par million de tokens, référence datée du 6 octobre 2026. Sert au suivi du coût, pas à facturer.
const PRIX: Record<string, { entree: number; sortie: number }> = {
  'claude-opus-5-5': { entree: 4, sortie: 20 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10 },
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 },
};
const INCONNU = { entree: 10, sortie: 50 };
// ponytail: plafond d'environ 30 pages selon l'hypothèse de 3 000 tokens par page, à recaler avec le test des modèles.
const MAX_TOKENS_ENTREE = 120_000;

type Bloc = Anthropic.Beta.BetaContentBlockParam;

/** Le modèle se règle côté serveur (IMPORT_MODEL) : son choix dépend du test des modèles (étape 1). */
export function creerIA(): IA {
  const modele = Deno.env.get('IMPORT_MODEL');
  if (!modele) throw new Error('IMPORT_MODEL non configuré');
  const client = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
  });
  // Haiku 5.5 n'a pas de repli côté serveur.
  const repli = modele.includes('haiku')
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  async function appeler(
    params: Pick<
      Anthropic.Beta.MessageCreateParams,
      'max_tokens' | 'system' | 'messages' | 'output_config'
    >,
  ): Promise<ReponseIA> {
    const message = await client.beta.messages
      .stream({ model: modele as string, ...params, ...repli })
      .finalMessage();
    const dernierRepli = message.content.findLastIndex((b) => b.type === 'fallback');
    const texte = message.content
      .slice(dernierRepli + 1)
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('');
    const tentatives = (message.usage.iterations ?? []).flatMap((i) =>
      i.type === 'message' || i.type === 'fallback_message' ? [i] : [],
    );
    const lignes =
      tentatives.length > 0 ? tentatives : [{ ...message.usage, model: message.model }];
    const coutUsd = lignes.reduce((total, l) => {
      const prix = PRIX[l.model ?? (modele as string)] ?? INCONNU;
      return total + (l.input_tokens * prix.entree + l.output_tokens * prix.sortie) / 1_000_000;
    }, 0);
    return { texte, stopReason: message.stop_reason, coutUsd };
  }

  const contenu = (blocs: unknown[]): Anthropic.Beta.BetaMessageParam[] => [
    { role: 'user', content: [...(blocs as Bloc[]), { type: 'text', text: TRANSCRIPTION_PROMPT }] },
  ];

  return {
    async tropLong(blocs) {
      const { input_tokens } = await client.beta.messages.countTokens({
        model: modele,
        messages: contenu(blocs),
      });
      return input_tokens > MAX_TOKENS_ENTREE;
    },
    transcrire: (blocs) =>
      appeler({ max_tokens: 32_000, output_config: { effort: 'low' }, messages: contenu(blocs) }),
    generer: (texte) =>
      appeler({
        max_tokens: 64_000,
        output_config: { effort: 'medium', format: zodOutputFormat(Generation) },
        system: GENERATION_SYSTEM,
        messages: [{ role: 'user', content: `<cours>\n${texte}\n</cours>` }],
      }),
  };
}
