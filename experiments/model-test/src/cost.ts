export const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
} as const;
export type ModelKey = keyof typeof MODELS;

// $ par million de tokens, référence datée du 6 octobre 2026. Les modèles de repli sont inclus.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const HAIKU_LONG = { input: 0.5, output: 2.5 };
const HAIKU_SEUIL = 100_000;
// Modèle de repli inconnu : on compte le tarif le plus élevé pour ne pas sous-estimer.
const INCONNU = { input: 10, output: 50 };

export interface Attempt {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export function costOf(attempts: readonly Attempt[]): number {
  return attempts.reduce((total, a) => {
    const price =
      a.model === MODELS.haiku && a.input_tokens > HAIKU_SEUIL ? HAIKU_LONG : (PRICES[a.model] ?? INCONNU);
    return total + (a.input_tokens * price.input + a.output_tokens * price.output) / 1_000_000;
  }, 0);
}
