/**
 * Money and rate limits for the staff assistant. Pure functions only: the
 * route reads the totals from `assistant_usage`, hands them to these, and does
 * what they say. Nothing here talks to the network or the database.
 *
 * The month the cap counts is a calendar month in Arizona time. Arizona does
 * not observe daylight saving, so Phoenix is a fixed UTC-7 all year.
 */

const PHOENIX_OFFSET_HOURS = 7;
const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_MONTHLY_BUDGET_USD = 50;

/** Per-person limits (see the assistant plan, section 9). */
export const RATE_LIMIT_WINDOW_MINUTES = 10;
export const RATE_LIMIT_PER_WINDOW = 20;
export const RATE_LIMIT_PER_DAY = 80;

export const BUDGET_PAUSED_MESSAGE =
  "The assistant has used its budget for this month and is paused until the 1st. Grok Bot can help in the meantime.";
export const RATE_LIMIT_MESSAGE =
  "That's a lot of questions in a short time. Try again in a few minutes.";

// ── Prices ──────────────────────────────────────────────────

type Rates = {
  /** Dollars per 1M tokens, prompts under 200k tokens. */
  input: number;
  cachedInput: number;
  output: number;
  /** Dollars per 1M tokens when the prompt is 200k tokens or more. */
  inputLong: number;
  cachedInputLong: number;
  outputLong: number;
};

/**
 * xAI's published rates, checked Nov 23 2026 (docs.x.ai/developers/pricing).
 * Update here when the model id in env changes.
 */
const RATES: Record<string, Rates> = {
  "grok-4.3": { input: 1.25, cachedInput: 0.2, output: 2.5, inputLong: 2.5, cachedInputLong: 0.4, outputLong: 5 },
  "grok-4.7": { input: 2, cachedInput: 0.5, output: 6, inputLong: 4, cachedInputLong: 1, outputLong: 12 },
};

/**
 * A model we have no rate for is priced at the highest rate we know, so the
 * cap errs toward stopping early rather than overspending.
 */
const FALLBACK_RATES: Rates = RATES["grok-4.7"];

const LONG_PROMPT_TOKENS = 200_000;

export type Usage = {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** Reasoning tokens are billed as output. */
  reasoningTokens: number;
};

export function ratesFor(model: string): Rates {
  return RATES[model] ?? FALLBACK_RATES;
}

/**
 * Estimated dollars for one model call.
 *
 * `inputTokens` is the whole prompt, including the cached part. Reasoning
 * tokens are added to the output count. If xAI turns out to already include
 * them in `completion_tokens`, this overstates a little, which is the safe
 * direction for a cap (check against a real usage line in Phase E).
 */
export function estimateCostUsd(model: string, usage: Usage): number {
  const rates = ratesFor(model);
  const long = usage.inputTokens >= LONG_PROMPT_TOKENS;
  const input = long ? rates.inputLong : rates.input;
  const cached = long ? rates.cachedInputLong : rates.cachedInput;
  const output = long ? rates.outputLong : rates.output;

  const cachedTokens = Math.min(Math.max(usage.cachedTokens, 0), Math.max(usage.inputTokens, 0));
  const freshTokens = Math.max(usage.inputTokens, 0) - cachedTokens;
  const outputTokens = Math.max(usage.outputTokens, 0) + Math.max(usage.reasoningTokens, 0);

  const dollars = (freshTokens * input + cachedTokens * cached + outputTokens * output) / 1_000_000;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}

// ── Arizona calendar ────────────────────────────────────────

/** The instant (UTC) the current Arizona month began: midnight on the 1st. */
export function phoenixMonthStart(now: Date): Date {
  const local = new Date(now.getTime() - PHOENIX_OFFSET_HOURS * HOUR_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, PHOENIX_OFFSET_HOURS));
}

/** The instant (UTC) the current Arizona day began. */
export function phoenixDayStart(now: Date): Date {
  const local = new Date(now.getTime() - PHOENIX_OFFSET_HOURS * HOUR_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), PHOENIX_OFFSET_HOURS));
}

// ── Decisions ───────────────────────────────────────────────

/** ASSISTANT_MONTHLY_BUDGET_USD, or the default when it is missing or not a positive number. */
export function parseBudgetUsd(raw: string | undefined): number {
  const value = Number((raw ?? "").trim());
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MONTHLY_BUDGET_USD;
}

export type BudgetDecision = { allowed: boolean; remainingUsd: number; message?: string };

/**
 * May this call go ahead? `spentUsd` is the sum of `estimated_cost_usd` since
 * the start of the Arizona month. `nextUsd` is a rough guess for the call
 * about to be made, so a call that would cross the line is refused.
 */
export function checkBudget(spentUsd: number, limitUsd: number, nextUsd = 0): BudgetDecision {
  const remainingUsd = Math.max(limitUsd - spentUsd, 0);
  if (spentUsd + nextUsd > limitUsd) {
    return { allowed: false, remainingUsd, message: BUDGET_PAUSED_MESSAGE };
  }
  return { allowed: true, remainingUsd };
}

export type RateDecision = { allowed: boolean; message?: string };

/** `inWindow` is this person's calls in the last 10 minutes, `today` their calls since Arizona midnight. */
export function checkRate(inWindow: number, today: number): RateDecision {
  if (inWindow >= RATE_LIMIT_PER_WINDOW || today >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, message: RATE_LIMIT_MESSAGE };
  }
  return { allowed: true };
}

// ── Who may use it ──────────────────────────────────────────

export const STAFF_EMAIL_DOMAIN = "@cre8advisors.com";

/**
 * Only a real company address counts. The middleware falls back to a bare
 * object id when a token carries no email, and that must not pass.
 */
export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 && value.slice(at) === STAFF_EMAIL_DOMAIN;
}
