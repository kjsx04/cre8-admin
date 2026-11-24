/**
 * The assistant's conversation loop: send the chat to Grok with the tools, stream
 * the words back as they arrive, run any tool the model asks for, and go round
 * again (at most four times). Everything it sends to the browser goes through
 * `emit`, so the route decides how that is delivered.
 */

import type OpenAI from "openai";
import { estimateCostUsd } from "./budget";
import { buildSystemPrompt, type PageContext } from "./prompts";
import { ASSISTANT_TOOLS, runTool, type Source, type ToolContext } from "./tools";

export const MAX_TOOL_ROUNDS = 4;
export const MAX_HISTORY_MESSAGES = 12;
export const MAX_MESSAGE_CHARS = 4000;
const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_ANSWER_TOKENS = 1200;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: Source[] }
  /** A lookup failed. The UI should show it, so a failed read is never read as "not found". */
  | { type: "tool_error"; tool: string; message: string }
  /** Take the browser to this admin path (from open_page). */
  | { type: "navigate"; href: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type UsageRecord = {
  model: string;
  reasoningEffort: string | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
  ok: boolean;
};

export type ModelChoice = { model: string; reasoning: "none" | "low" | "medium" };

export type ChatConfig = {
  fastModel: string;
  summaryModel: string;
  fastReasoning: ModelChoice["reasoning"];
  summaryReasoning: ModelChoice["reasoning"];
};

const SUMMARY_WORDS = /\b(summar|explain|compare|overview|walk me through|what'?s (going on|the latest|happening)|brief me|catch me up)/i;

/** Lookups use the fast path. A question that asks for a summary gets a little reasoning. */
export function pickModel(lastUserMessage: string, config: ChatConfig): ModelChoice {
  return SUMMARY_WORDS.test(lastUserMessage)
    ? { model: config.summaryModel, reasoning: config.summaryReasoning }
    : { model: config.fastModel, reasoning: config.fastReasoning };
}

/** Keep the last few turns, each cut to a sane length, starting on a user message. */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  return recent;
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const key = `${s.label}|${s.href ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out.slice(0, 12);
}

const TOOL_SPECS: OpenAI.Chat.ChatCompletionTool[] = ASSISTANT_TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

type ToolCallAcc = { id: string; name: string; args: string };

export async function runChat(opts: {
  client: OpenAI;
  history: ChatMessage[];
  ctx: ToolContext;
  page?: PageContext;
  config: ChatConfig;
  emit: (event: StreamEvent) => void;
  onUsage: (usage: UsageRecord) => Promise<void> | void;
  now?: Date;
}): Promise<void> {
  const history = trimHistory(opts.history);
  const last = [...history].reverse().find((m) => m.role === "user");
  if (!last) {
    opts.emit({ type: "error", message: "Ask a question and I'll look into it." });
    return;
  }

  const choice = pickModel(last.content, opts.config);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt({ guide: opts.ctx.guide, page: opts.page, now: opts.now }) },
    ...history,
  ];
  const sources: Source[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // After the last allowed round the model must answer with what it has.
    const allowTools = round < MAX_TOOL_ROUNDS;
    const calls = new Map<number, ToolCallAcc>();
    let text = "";
    let usage: OpenAI.CompletionUsage | undefined;

    const stream = await opts.client.chat.completions.create({
      model: choice.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: MAX_ANSWER_TOKENS + (choice.reasoning === "medium" ? 2048 : choice.reasoning === "low" ? 1024 : 0),
      reasoning_effort: choice.reasoning,
      ...(allowTools ? { tools: TOOL_SPECS, tool_choice: "auto" as const } : {}),
    });

    for await (const chunk of stream) {
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        text += delta.content;
        opts.emit({ type: "token", text: delta.content });
      }
      for (const call of delta.tool_calls ?? []) {
        const acc = calls.get(call.index) ?? { id: "", name: "", args: "" };
        if (call.id) acc.id = call.id;
        if (call.function?.name) acc.name += call.function.name;
        if (call.function?.arguments) acc.args += call.function.arguments;
        calls.set(call.index, acc);
      }
    }

    const inputTokens = usage?.prompt_tokens ?? 0;
    const cachedTokens = (usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)?.prompt_tokens_details?.cached_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const reasoningTokens = (usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)?.completion_tokens_details?.reasoning_tokens ?? 0;
    await opts.onUsage({
      model: choice.model,
      reasoningEffort: choice.reasoning,
      inputTokens,
      cachedTokens,
      outputTokens,
      reasoningTokens,
      estimatedCostUsd: estimateCostUsd(choice.model, { inputTokens, cachedTokens, outputTokens, reasoningTokens }),
      ok: true,
    });

    const pending = Array.from(calls.entries()).sort((a, b) => a[0] - b[0]).map(([, c]) => c).filter((c) => c.name);
    if (pending.length === 0 || !allowTools) {
      opts.emit({ type: "sources", sources: dedupeSources(sources) });
      opts.emit({ type: "done" });
      return;
    }

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: pending.map((c, i) => ({
        id: c.id || `call_${round}_${i}`,
        type: "function" as const,
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    for (let i = 0; i < pending.length; i++) {
      const call = pending[i];
      opts.emit({ type: "status", text: statusFor(call.name) });
      const result = await runTool(call.name, call.args, opts.ctx);
      sources.push(...result.sources);
      if (result.navigate) opts.emit({ type: "navigate", href: result.navigate });
      if (result.failure) {
        opts.emit({
          type: "tool_error",
          tool: call.name,
          message: result.failure.code
            ? `A lookup failed (database error ${result.failure.code}). Any answer below may be incomplete.`
            : "A lookup failed. Any answer below may be incomplete.",
        });
      }
      let payload = JSON.stringify(result.data);
      if (payload.length > MAX_TOOL_RESULT_CHARS) {
        payload = `${payload.slice(0, MAX_TOOL_RESULT_CHARS)}… (result cut; ask a narrower question)`;
      }
      messages.push({ role: "tool", tool_call_id: call.id || `call_${round}_${i}`, content: payload });
    }
  }
}

function statusFor(tool: string): string {
  switch (tool) {
    case "search_listings":
    case "get_listing":
      return "Looking up listings…";
    case "search_deals":
    case "get_deal":
      return "Looking up deals…";
    case "open_page":
      return "Opening the page…";
    case "lookup_how_cre8_works":
      return "Checking the guide…";
    default:
      return "Working…";
  }
}

/** One server-sent event line. */
export function sseLine(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
