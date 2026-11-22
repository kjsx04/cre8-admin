/**
 * Run: npx tsx src/lib/ai/client.test.ts
 *
 * Model choice and the missing-key guard. No network calls.
 */

import {
  ANTHROPIC_DEFAULT_MODEL,
  AiConfigError,
  GROK_FAST_MODEL,
  GROK_FLAGSHIP_MODEL,
  XAI_BASE_URL,
  completeText,
  resolveModel,
  resolveReasoningEffort,
} from "./client";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

assert(XAI_BASE_URL === "https://api.x.ai/v1", "xAI base URL is the OpenAI-compatible endpoint");

assert(resolveModel({}) === GROK_FLAGSHIP_MODEL, "default tier is the flagship model");
assert(resolveModel({ tier: "flagship" }) === "grok-4.7", "flagship is grok-4.7");
assert(resolveModel({ tier: "fast" }) === GROK_FAST_MODEL, "fast tier is grok-4.3");
assert(resolveModel({ tier: "fast", model: "grok-4.6" }) === "grok-4.6", "explicit model wins over tier");
assert(
  resolveModel({ provider: "anthropic" }) === ANTHROPIC_DEFAULT_MODEL,
  "Anthropic opt-in defaults to the previous Claude model"
);
assert(
  resolveModel({ provider: "anthropic", model: "claude-opus-4-5" }) === "claude-opus-4-5",
  "Anthropic opt-in honors an explicit model"
);

assert(resolveReasoningEffort({ tier: "flagship" }) === "low", "flagship reasons at low effort");
assert(resolveReasoningEffort({ tier: "fast" }) === "none", "fast tier skips reasoning");
assert(
  resolveReasoningEffort({ tier: "flagship", reasoningEffort: "high" }) === "high",
  "caller can raise flagship effort"
);
assert(
  resolveReasoningEffort({ tier: "fast", reasoningEffort: "low" }) === "low",
  "caller can turn a little reasoning on for the fast model"
);
assert(
  resolveReasoningEffort({ model: "grok-4.7", reasoningEffort: "none" }) === "low",
  "none is raised to low on grok-4.7, which cannot disable reasoning"
);
assert(
  resolveReasoningEffort({ tier: "fast", model: "grok-4.3", reasoningEffort: "none" }) === "none",
  "grok-4.3 keeps none"
);
assert(
  resolveReasoningEffort({ provider: "anthropic", tier: "flagship" }) === undefined,
  "Anthropic path does not send a Grok reasoning effort"
);

async function expectConfigError(run: () => Promise<unknown>, envName: string, label: string) {
  try {
    await run();
    assert(false, `${label} should throw`);
  } catch (err) {
    assert(err instanceof AiConfigError, `${label} throws AiConfigError`);
    assert(err instanceof Error && err.message.includes(envName), `${label} names ${envName}`);
  }
}

async function main() {
  const prevXai = process.env.XAI_API_KEY;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await expectConfigError(
      () => completeText({ user: "hi", maxTokens: 8 }),
      "XAI_API_KEY",
      "missing xAI key"
    );
    await expectConfigError(
      () => completeText({ provider: "anthropic", user: "hi", maxTokens: 8 }),
      "ANTHROPIC_API_KEY",
      "missing Anthropic key"
    );
  } finally {
    if (prevXai === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prevXai;
    if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropic;
  }

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nall ai client tests passed");
}

main();
