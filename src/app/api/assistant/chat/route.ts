/**
 * POST /api/assistant/chat: the staff assistant.
 *
 * Order of gates: signed-in (the middleware already checked the Microsoft token),
 * a real @cre8advisors.com address, a sane request, the per-person rate limit, the
 * monthly dollar cap. Only then is a model called. The answer streams back as
 * server-sent events. Nothing about the chat is saved; only a usage row per model
 * call (tokens and estimated dollars) goes to `assistant_usage`.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireUser } from "@/lib/email/auth";
import { supabase } from "@/lib/flow/supabase";
import { AiConfigError, createXaiClient } from "@/lib/ai/client";
import { isOwnerEmail } from "@/lib/assistant/access";
import {
  checkBudget,
  checkRate,
  isStaffEmail,
  parseBudgetUsd,
  phoenixDayStart,
  phoenixMonthStart,
  RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/assistant/budget";
import { runChat, sseLine, type ChatConfig, type ChatMessage, type StreamEvent, type UsageRecord } from "@/lib/assistant/chat";
import { AssistantDbConfigError, createAssistantDb } from "@/lib/assistant/db";
import type { PageContext } from "@/lib/assistant/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to four tool rounds, each a model call plus a database read.
export const maxDuration = 60;

const MAX_BODY_MESSAGES = 40;
// A rough price for the call about to be made, so a call that would cross the cap is refused.
const NEXT_CALL_ESTIMATE_USD = 0.03;

let guideCache: string | null = null;
async function loadGuide(): Promise<string> {
  if (guideCache) return guideCache;
  guideCache = await fs.readFile(path.join(process.cwd(), "docs", "HOW-CRE8-WORKS.md"), "utf8");
  return guideCache;
}

function chatConfig(): ChatConfig {
  const effort = (value: string | undefined, fallback: "none" | "low" | "medium") =>
    value === "none" || value === "low" || value === "medium" ? value : fallback;
  return {
    fastModel: process.env.ASSISTANT_FAST_MODEL || "grok-4.3",
    summaryModel: process.env.ASSISTANT_SUMMARY_MODEL || "grok-4.3",
    fastReasoning: effort(process.env.ASSISTANT_FAST_REASONING, "none"),
    summaryReasoning: effort(process.env.ASSISTANT_SUMMARY_REASONING, "medium"),
  };
}

function refuse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function parseBody(body: unknown): { messages: ChatMessage[]; page?: PageContext } | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BODY_MESSAGES) return null;
  const messages: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    messages.push({ role, content });
  }
  const pageRaw = (body as { page?: { path?: unknown; label?: unknown } }).page;
  const page: PageContext | undefined =
    pageRaw && typeof pageRaw === "object"
      ? {
          path: typeof pageRaw.path === "string" ? pageRaw.path.slice(0, 200) : undefined,
          label: typeof pageRaw.label === "string" ? pageRaw.label.slice(0, 120) : undefined,
        }
      : undefined;
  return { messages, page };
}

async function sumSpentSince(start: Date): Promise<number> {
  // About 2,000 rows a month, so reading them is cheaper than adding a database function.
  const { data, error } = await supabase
    .from("assistant_usage")
    .select("estimated_cost_usd")
    .gte("occurred_at", start.toISOString())
    .limit(50_000);
  if (error) throw new Error(`usage read failed: ${error.message}`);
  return (data ?? []).reduce((sum, row: { estimated_cost_usd: number | string }) => sum + Number(row.estimated_cost_usd), 0);
}

async function countSince(email: string, since: Date): Promise<number> {
  const { count, error } = await supabase
    .from("assistant_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .gte("occurred_at", since.toISOString());
  if (error) throw new Error(`usage read failed: ${error.message}`);
  return count ?? 0;
}

async function logUsage(email: string, usage: UsageRecord) {
  const { error } = await supabase.from("assistant_usage").insert({
    user_email: email,
    model: usage.model,
    reasoning_effort: usage.reasoningEffort,
    input_tokens: usage.inputTokens,
    cached_tokens: usage.cachedTokens,
    output_tokens: usage.outputTokens,
    reasoning_tokens: usage.reasoningTokens,
    estimated_cost_usd: usage.estimatedCostUsd,
    route: "chat",
    ok: usage.ok,
  });
  // A failed log must not break the answer, but it must be loud: the cap depends on it.
  if (error) console.error("[assistant] could not log usage:", error.message);
}

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const email = auth.email.trim().toLowerCase();

  if (!isStaffEmail(email)) return refuse(403, "The assistant is for CRE8 staff with a @cre8advisors.com account.");

  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody(await request.json());
  } catch {
    parsed = null;
  }
  if (!parsed) return refuse(400, "That request was not valid.");

  const now = new Date();
  try {
    const [inWindow, today] = await Promise.all([
      countSince(email, new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60_000)),
      countSince(email, phoenixDayStart(now)),
    ]);
    const rate = checkRate(inWindow, today);
    if (!rate.allowed) return refuse(429, rate.message ?? "Try again in a few minutes.");

    const spent = await sumSpentSince(phoenixMonthStart(now));
    const budget = checkBudget(spent, parseBudgetUsd(process.env.ASSISTANT_MONTHLY_BUDGET_USD), NEXT_CALL_ESTIMATE_USD);
    if (!budget.allowed) return refuse(429, budget.message ?? "The assistant is paused until next month.");
  } catch (err) {
    // If the cap cannot be checked, do not spend. Failing open would defeat the cap.
    console.error("[assistant] gate check failed:", err);
    return refuse(503, "The assistant is not available right now.");
  }

  let ctx;
  let client;
  try {
    const [db, guide] = await Promise.all([createAssistantDb(email, isOwnerEmail(email)), loadGuide()]);
    ctx = { db, email, isOwner: isOwnerEmail(email), guide };
    client = createXaiClient();
  } catch (err) {
    if (err instanceof AssistantDbConfigError || err instanceof AiConfigError) {
      console.error("[assistant] not configured:", err.message);
      return refuse(503, "The assistant is not set up yet. Ask Kevin.");
    }
    console.error("[assistant] startup failed:", err);
    return refuse(503, "The assistant is not available right now.");
  }

  const config = chatConfig();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => controller.enqueue(encoder.encode(sseLine(event)));
      try {
        await runChat({
          client,
          history: parsed!.messages,
          ctx,
          page: parsed!.page,
          config,
          emit,
          onUsage: (usage) => logUsage(email, usage),
        });
      } catch (err) {
        console.error("[assistant] chat failed:", err);
        // A failed call still counts toward the rate limit.
        await logUsage(email, {
          model: config.fastModel,
          reasoningEffort: null,
          inputTokens: 0,
          cachedTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          estimatedCostUsd: 0,
          ok: false,
        });
        emit({ type: "error", message: "Something went wrong on my end. Try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
