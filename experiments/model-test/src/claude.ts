import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf, MODELS, type Attempt, type ModelKey } from "./cost.ts";
import { Generation, GENERATION_SYSTEM, TRANSCRIPTION_PROMPT } from "./schema.ts";

export interface CallRecord {
  dureeMs: number;
  stopReason: string | null;
  categorieRefus: string | null;
  repli: boolean;
  tokensEntree: number;
  tokensSortie: number;
  tokensReflexion: number;
  coutUsd: number;
}

export interface ApiResult {
  texte: string;
  appel: CallRecord;
}

export type Bloc = Anthropic.Beta.BetaContentBlockParam;

const client = new Anthropic();

function attemptsOf(message: Anthropic.Beta.BetaMessage, model: string): Attempt[] {
  const attempts = (message.usage.iterations ?? []).flatMap((i): Attempt[] =>
    i.type === "message" || i.type === "fallback_message"
      ? [{ model: i.model ?? model, input_tokens: i.input_tokens, output_tokens: i.output_tokens }]
      : [],
  );
  return attempts.length > 0
    ? attempts
    : [{ model: message.model, input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }];
}

async function call(
  key: ModelKey,
  params: Pick<Anthropic.Beta.MessageCreateParams, "max_tokens" | "system" | "messages" | "output_config">,
): Promise<ApiResult> {
  const debut = Date.now();
  const message = await client.beta.messages
    .stream({
      model: MODELS[key],
      ...params,
      // Haiku 5.5 n'a pas de repli côté serveur.
      ...(key === "haiku" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    })
    .finalMessage();

  const attempts = attemptsOf(message, MODELS[key]);
  // Après un repli en cours de réponse, seul le texte qui suit le dernier bloc fallback compte.
  const dernierRepli = message.content.findLastIndex((b) => b.type === "fallback");
  const texte = message.content
    .slice(dernierRepli + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");

  return {
    texte,
    appel: {
      dureeMs: Date.now() - debut,
      stopReason: message.stop_reason,
      categorieRefus: message.stop_details?.category ?? null,
      repli: (message.usage.iterations ?? []).some((i) => i.type === "fallback_message"),
      tokensEntree: attempts.reduce((sum, a) => sum + a.input_tokens, 0),
      tokensSortie: attempts.reduce((sum, a) => sum + a.output_tokens, 0),
      tokensReflexion: message.usage.output_tokens_details?.thinking_tokens ?? 0,
      coutUsd: costOf(attempts),
    },
  };
}

export function transcribe(key: ModelKey, blocs: Bloc[]): Promise<ApiResult> {
  return call(key, {
    max_tokens: 32_000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: [...blocs, { type: "text", text: TRANSCRIPTION_PROMPT }] }],
  });
}

export function generate(key: ModelKey, texte: string): Promise<ApiResult> {
  return call(key, {
    max_tokens: 64_000,
    output_config: { effort: "medium", format: zodOutputFormat(Generation) },
    system: GENERATION_SYSTEM,
    messages: [{ role: "user", content: `<cours>\n${texte}\n</cours>` }],
  });
}
