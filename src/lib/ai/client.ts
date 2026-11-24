/**
 * One place this app asks a chat model for text.
 *
 * The default provider is xAI's OpenAI-compatible API at https://api.x.ai/v1,
 * using the `openai` SDK with that base URL. Every current feature goes
 * through here. A caller can pass `provider: "anthropic"` to send that one
 * request to Claude instead. That path needs ANTHROPIC_API_KEY and is not
 * used unless a feature opts in. The app runs without it.
 *
 * Models, from the xAI docs checked for this change (https://docs.x.ai/developers/models):
 *   flagship — grok-4.7. Form filling, deal extraction, and the email calendar.
 *              xAI's recommended model where the answer has to be right.
 *   fast     — grok-4.3. Listing-email drafts and market-intel briefs.
 *              Cheaper ($1.25 / $2.50 per 1M tokens) and it can skip reasoning.
 *
 * grok-4.7 always reasons, and the API default effort is "high". High effort
 * is slow and, on this chat-completions endpoint, reasoning tokens count
 * toward max_tokens, so a short cap can come back empty. We send "low" unless
 * the caller overrides it, and add a little headroom on top of the caller's
 * answer budget. grok-4.3 defaults to "low" and accepts "none"; the fast tier
 * uses "none" so a short draft cap is spent on the draft.
 *
 * Nothing here streams. None of the features streamed before.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const XAI_BASE_URL = "https://api.x.ai/v1";

/** Flagship model. Accuracy-sensitive extraction, form filling, scheduling. */
export const GROK_FLAGSHIP_MODEL = "grok-4.7";

/** Fast, cheaper model. Drafts and other light tasks. */
export const GROK_FAST_MODEL = "grok-4.3";

/** Used only when a caller opts back into Claude and does not name a model. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";

export type AiProvider = "xai" | "anthropic";
export type AiTier = "flagship" | "fast";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export function isAiConfigError(err: unknown): err is AiConfigError {
  return err instanceof AiConfigError;
}

export type CompleteTextParams = {
  /** Defaults to xAI. Pass "anthropic" to send this one call to Claude. */
  provider?: AiProvider;
  /**
   * flagship = grok-4.7, fast = grok-4.3. Ignored when `model` is set,
   * and ignored on the Anthropic path (that path has its own default).
   */
  tier?: AiTier;
  /** Exact model id. Wins over `tier`. */
  model?: string;
  system?: string;
  user: string;
  /** Cap on the visible answer, same role as the old max_tokens. */
  maxTokens: number;
  temperature?: number;
  /**
   * Ask the xAI API for a JSON object (`response_format: json_object`).
   * The Anthropic path has no equivalent switch; those prompts already
   * require JSON and the caller parses the text.
   */
  json?: boolean;
  /**
   * Grok reasoning effort. Flagship defaults to "low". Fast defaults to
   * "none". "none" is raised to "low" on grok-4.5 / 4.6 / 4.7, which
   * cannot disable reasoning.
   */
  reasoningEffort?: ReasoningEffort;
};

const CANNOT_DISABLE_REASONING = /^grok-4\.[567](?:$|[^0-9])/;

/**
 * Extra max_tokens on top of the caller's answer budget so low/medium
 * reasoning does not eat the whole cap. "none" adds nothing.
 */
const REASONING_HEADROOM: Record<ReasoningEffort, number> = {
  none: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 8192,
};

export function resolveModel(
  params: Pick<CompleteTextParams, "provider" | "tier" | "model">
): string {
  if (params.model) return params.model;
  if ((params.provider ?? "xai") === "anthropic") return ANTHROPIC_DEFAULT_MODEL;
  return (params.tier ?? "flagship") === "fast" ? GROK_FAST_MODEL : GROK_FLAGSHIP_MODEL;
}

export function resolveReasoningEffort(
  params: Pick<CompleteTextParams, "provider" | "tier" | "model" | "reasoningEffort">
): ReasoningEffort | undefined {
  if ((params.provider ?? "xai") === "anthropic") return undefined;
  const tier = params.tier ?? "flagship";
  const effort = params.reasoningEffort ?? (tier === "fast" ? "none" : "low");
  const model = resolveModel(params);
  if (effort === "none" && CANNOT_DISABLE_REASONING.test(model)) return "low";
  return effort;
}

export async function completeText(params: CompleteTextParams): Promise<string> {
  if ((params.provider ?? "xai") === "anthropic") return completeAnthropic(params);
  return completeXai(params);
}

/** The shared xAI client, for callers that need streaming or tool calls (the staff assistant). */
export { xaiClient as createXaiClient };

function xaiClient(): OpenAI {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new AiConfigError("XAI_API_KEY not configured");
  return new OpenAI({
    apiKey,
    baseURL: XAI_BASE_URL,
    timeout: 120_000,
  });
}

async function completeXai(params: CompleteTextParams): Promise<string> {
  const model = resolveModel({ ...params, provider: "xai" });
  const effort = resolveReasoningEffort({ ...params, provider: "xai", model });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (params.system) messages.push({ role: "system", content: params.system });
  messages.push({ role: "user", content: params.user });

  const completion = await xaiClient().chat.completions.create({
    model,
    messages,
    max_tokens: params.maxTokens + REASONING_HEADROOM[effort ?? "none"],
    ...(params.temperature != null ? { temperature: params.temperature } : {}),
    ...(params.json ? { response_format: { type: "json_object" as const } } : {}),
    ...(effort ? { reasoning_effort: effort } : {}),
  });

  const choice = completion.choices[0];
  const text = choice?.message?.content ?? "";
  if (!text.trim()) {
    throw new Error(
      choice?.finish_reason === "length"
        ? "The model response was cut off before it finished"
        : "No text response from the model"
    );
  }
  return text;
}

async function completeAnthropic(params: CompleteTextParams): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiConfigError("ANTHROPIC_API_KEY not configured");

  const message = await new Anthropic({ apiKey }).messages.create({
    model: resolveModel({ ...params, provider: "anthropic" }),
    max_tokens: params.maxTokens,
    ...(params.system ? { system: params.system } : {}),
    ...(params.temperature != null ? { temperature: params.temperature } : {}),
    messages: [{ role: "user", content: params.user }],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  if (!text.trim()) throw new Error("No text response from the model");
  return text;
}
