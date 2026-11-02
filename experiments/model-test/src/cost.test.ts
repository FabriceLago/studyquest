import assert from "node:assert/strict";
import { test } from "node:test";
import { costOf, MODELS } from "./cost.ts";

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const cours = (model: string) => [{ model, input_tokens: 40_000, output_tokens: 25_000 }];

test("coût d'un cours de référence pour les 3 modèles", () => {
  near(costOf(cours(MODELS.opus)), 0.66);
  near(costOf(cours(MODELS.sonnet)), 0.33);
  near(costOf(cours(MODELS.haiku)), 0.0165);
});

test("Haiku au-delà de 100 000 tokens d'entrée passe au tarif long", () => {
  near(costOf([{ model: MODELS.haiku, input_tokens: 200_000, output_tokens: 1_000 }]), 0.1025);
});

test("chaque tentative, y compris un repli, est comptée à son propre tarif", () => {
  near(
    costOf([
      { model: MODELS.opus, input_tokens: 1_000, output_tokens: 0 },
      { model: "claude-opus-4-8", input_tokens: 1_000, output_tokens: 1_000 },
    ]),
    0.004 + 0.005 + 0.025,
  );
});

test("un modèle inconnu est compté au tarif le plus élevé", () => {
  near(costOf([{ model: "claude-futur", input_tokens: 1_000_000, output_tokens: 0 }]), 10);
});
