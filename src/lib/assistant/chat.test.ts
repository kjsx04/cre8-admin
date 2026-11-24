/**
 * Run: npx tsx src/lib/assistant/chat.test.ts   (or `npm test chat.test`)
 *
 * The conversation loop against a fake xAI client that streams scripted chunks.
 * No network, no database.
 */

import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_HISTORY_MESSAGES, MAX_TOOL_ROUNDS, pickModel, runChat, sseLine, trimHistory, type ChatConfig, type StreamEvent, type UsageRecord } from "./chat";
import { buildSystemPrompt, phoenixToday } from "./prompts";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const CONFIG: ChatConfig = { fastModel: "grok-4.3", summaryModel: "grok-4.3", fastReasoning: "none", summaryReasoning: "medium" };

// ── helpers ─────────────────────────────────────────────────

assert(pickModel("what's under contract?", CONFIG).reasoning === "none", "a lookup uses the fast path");
assert(pickModel("summarize the Mesa Dr deal", CONFIG).reasoning === "medium", "a summary request gets some reasoning");
assert(pickModel("catch me up on SR85", CONFIG).reasoning === "medium", '"catch me up" is a summary');

const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? ("assistant" as const) : ("user" as const), content: `m${i}` }));
const trimmed = trimHistory(long);
assert(trimmed.length <= MAX_HISTORY_MESSAGES, "history is cut to the last 12 messages");
assert(trimmed[0].role === "user", "trimmed history starts on a user message");
assert(trimHistory([{ role: "user", content: "x".repeat(9000) }])[0].content.length === 4000, "one long message is cut to 4000 characters");
assert(trimHistory([{ role: "user", content: "  " }]).length === 0, "blank messages are dropped");

const prompt = buildSystemPrompt({ guide: "THE GUIDE", page: { path: "/flow", label: "Deals board" }, now: new Date("2026-11-24T18:00:00Z") });
assert(prompt.includes("THE GUIDE"), "the guide is in the instructions");
assert(prompt.includes("Tuesday, November 24, 2026"), "the date is written in Arizona time");
assert(prompt.includes("Deals board (/flow)"), "the page the person is on is in the instructions");
assert(/read-only/i.test(prompt) && /Grok Bot/.test(prompt) && /Arizona commercial/i.test(prompt), "the prompt states the read-only, Grok Bot and Arizona rules");
assert(phoenixToday(new Date("2026-12-01T03:00:00Z")).includes("November 30"), "just after midnight UTC is still the previous day in Arizona");
assert(sseLine({ type: "done" }) === 'data: {"type":"done"}\n\n', "an event is one SSE line");

// ── a fake xAI client ───────────────────────────────────────

type Chunk = Record<string, unknown>;
const tokenChunk = (text: string): Chunk => ({ choices: [{ delta: { content: text } }] });
const callChunk = (index: number, id: string, name: string, args: string): Chunk => ({
  choices: [{ delta: { tool_calls: [{ index, id, function: { name, arguments: args } }] } }],
});
const usageChunk = (input: number, output: number): Chunk => ({ choices: [], usage: { prompt_tokens: input, completion_tokens: output, prompt_tokens_details: { cached_tokens: 0 } } });

function fakeClient(rounds: Chunk[][]) {
  const requests: Record<string, unknown>[] = [];
  let i = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          requests.push(params);
          const chunks = rounds[Math.min(i++, rounds.length - 1)];
          return (async function* () {
            for (const c of chunks) yield c;
          })();
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, requests };
}

// A database that has one listing and nothing else.
const db = {
  from(table: string) {
    const proxy: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          const data = table === "listings"
            ? [{ id: "11111111-1111-4111-8111-111111111111", name: "Mesa Dr", broker_ids: [], webflow_id: null, published_at: "2026-01-01", sold: false, under_contract: false }]
            : [];
          return (resolve: (v: unknown) => void) => resolve({ data, count: data.length, error: null });
        }
        return () => proxy;
      },
    });
    return proxy;
  },
} as unknown as SupabaseClient;

const ctx = { db, email: "andy@cre8advisors.com", isOwner: false, guide: "GUIDE" };

(async () => {
  // Round 1 asks for a tool, round 2 answers.
  {
    const { client, requests } = fakeClient([
      [callChunk(0, "c1", "search_listings", '{"quer'), callChunk(0, "", "", 'y":"mesa"}'), usageChunk(2000, 40)],
      [tokenChunk("Mesa Dr "), tokenChunk("is live."), usageChunk(2600, 12)],
    ]);
    const events: StreamEvent[] = [];
    const usage: UsageRecord[] = [];
    await runChat({ client, history: [{ role: "user", content: "tell me about Mesa Dr" }], ctx, config: CONFIG, emit: (e) => events.push(e), onUsage: (u) => void usage.push(u) });

    assert(events.filter((e) => e.type === "token").map((e) => (e as { text: string }).text).join("") === "Mesa Dr is live.", "the answer streams in pieces and joins into the full text");
    assert(events.some((e) => e.type === "status"), "a status line is sent while a tool runs");
    const sources = events.find((e) => e.type === "sources") as { sources: { href?: string }[] } | undefined;
    assert(sources?.sources[0]?.href === "/listings/11111111-1111-4111-8111-111111111111", "the listing is cited under the answer");
    assert(events[events.length - 1].type === "done", "the stream ends with done");
    assert(requests.length === 2, "two model calls: one to ask for the tool, one to answer");
    assert(usage.length === 2 && usage.every((u) => u.ok && u.estimatedCostUsd > 0), "both calls are logged with a cost");
    const second = requests[1].messages as { role: string; content?: string }[];
    assert(second.some((m) => m.role === "tool" && /Mesa Dr/.test(m.content ?? "")), "the tool result is passed back to the model");
    assert(requests[0].stream === true && (requests[0].stream_options as { include_usage: boolean }).include_usage, "usage is requested on the stream");
    assert(requests[0].reasoning_effort === "none" && requests[0].model === "grok-4.3", "a lookup runs on grok-4.3 with reasoning off");
  }

  // A model that never stops asking for tools is cut off after four rounds.
  {
    const loop = [callChunk(0, "c", "search_listings", "{}"), usageChunk(100, 5)];
    const { client, requests } = fakeClient([loop, loop, loop, loop, loop, [tokenChunk("Here is what I found."), usageChunk(100, 5)]]);
    const events: StreamEvent[] = [];
    await runChat({ client, history: [{ role: "user", content: "keep going" }], ctx, config: CONFIG, emit: (e) => events.push(e), onUsage: () => undefined });
    assert(requests.length === MAX_TOOL_ROUNDS + 1, `a runaway model is stopped after ${MAX_TOOL_ROUNDS} tool rounds`);
    assert(requests[MAX_TOOL_ROUNDS].tools === undefined, "the last call is made without tools so the model has to answer");
    assert(events[events.length - 1].type === "done", "the runaway case still ends cleanly");
  }

  // An unknown tool is reported to the model, not thrown.
  {
    const { client, requests } = fakeClient([
      [callChunk(0, "c1", "delete_everything", "{}"), usageChunk(10, 1)],
      [tokenChunk("I can't do that."), usageChunk(10, 1)],
    ]);
    await runChat({ client, history: [{ role: "user", content: "wipe it" }], ctx, config: CONFIG, emit: () => undefined, onUsage: () => undefined });
    const msgs = requests[1].messages as { role: string; content?: string }[];
    assert(msgs.some((m) => m.role === "tool" && /no tool called/i.test(m.content ?? "")), "a made-up tool name comes back as an error message");
  }

  // Nothing to answer.
  {
    const { client, requests } = fakeClient([[tokenChunk("x")]]);
    const events: StreamEvent[] = [];
    await runChat({ client, history: [], ctx, config: CONFIG, emit: (e) => events.push(e), onUsage: () => undefined });
    assert(requests.length === 0 && events[0]?.type === "error", "an empty chat makes no model call");
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks passed");
})();
