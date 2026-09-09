/**
 * Scheduler settings — one JSON row in `email_settings`, editable from the
 * schedule page's Settings panel. Everything the AI scheduler, the week
 * optimizer, the planner's overload chip, and the nightly cron read comes
 * from here, with the defaults below as the fallback.
 *
 * Shared types + defaults are client-safe; the load/save functions are server-only
 * (they import the service-role Supabase client) and live at the bottom.
 */

export type WindowTier = "best" | "good" | "ok";

export interface SendWindow {
  days: number[];       // 1=Mon … 5=Fri (Phoenix)
  start: string;        // "HH:MM" 24h
  end: string;          // "HH:MM"
  tier: WindowTier;
}

export interface DecaySettings {
  enabled: boolean;
  weeklyToBiweeklyDays: number;   // weekly → bi-weekly after this many days on weekly
  biweeklyToMonthlyDays: number;  // bi-weekly → monthly after this many days on bi-weekly
}

export interface EmailSettings {
  maxSendsPerDay: number;
  minGapMinutes: number;
  windows: SendWindow[];
  noSendDates: string[];          // "YYYY-MM-DD" (Phoenix)
  spacingDays: number;            // one send per listing per N days …
  announcementLabels: string[];   // … except these labels, which always go (and bump the recurring one)
  decay: DecaySettings;
  staleAlertDays: number;         // alert when a scheduled/active campaign hasn't been edited in N days
}

/**
 * Defaults, from what's known about how commercial brokers and investors read email:
 * early mornings before tours/meetings and late morning; lunch and late afternoon are dead;
 * Monday is buried under the weekend, Friday afternoon is checked out.
 */
export const DEFAULT_SETTINGS: EmailSettings = {
  maxSendsPerDay: 4,
  minGapMinutes: 90,
  windows: [
    { days: [2, 3, 4], start: "09:00", end: "11:00", tier: "best" },
    { days: [2, 3, 4], start: "07:30", end: "09:00", tier: "good" },
    { days: [2, 3, 4], start: "13:00", end: "15:00", tier: "good" },
    { days: [1, 5], start: "09:00", end: "11:00", tier: "good" },
    { days: [1, 5], start: "07:30", end: "09:00", tier: "ok" },
    { days: [1, 5], start: "13:00", end: "15:00", tier: "ok" },
  ],
  // US holidays + the dead week. Kevin confirms/edits these in Settings.
  noSendDates: [
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-11-27",
    "2026-12-24",
    "2026-12-25",
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-05-31", // Memorial Day
    "2027-07-05", // Independence Day (observed)
    "2027-09-06", // Labor Day
    "2027-11-25", // Thanksgiving
    "2027-11-26",
  ],
  spacingDays: 7,
  announcementLabels: ["Just Listed", "Just Sold", "Price Reduced", "Under Contract", "Back on Market"],
  decay: { enabled: true, weeklyToBiweeklyDays: 60, biweeklyToMonthlyDays: 120 },
  staleAlertDays: 45,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Merge stored JSON over the defaults (so new fields always have a value) */
export function withDefaults(partial: Partial<EmailSettings> | null | undefined): EmailSettings {
  const p = partial || {};
  return {
    ...DEFAULT_SETTINGS,
    ...p,
    windows: Array.isArray(p.windows) && p.windows.length > 0 ? p.windows : DEFAULT_SETTINGS.windows,
    noSendDates: Array.isArray(p.noSendDates) ? p.noSendDates : DEFAULT_SETTINGS.noSendDates,
    announcementLabels: Array.isArray(p.announcementLabels) ? p.announcementLabels : DEFAULT_SETTINGS.announcementLabels,
    decay: { ...DEFAULT_SETTINGS.decay, ...(p.decay || {}) },
  };
}

/** Human-readable rules block for the AI prompts */
export function describeWindows(s: EmailSettings): string {
  const byTier: Record<WindowTier, string[]> = { best: [], good: [], ok: [] };
  for (const w of s.windows) {
    const days = w.days.map((d) => DAY_NAMES[d]).join("/");
    byTier[w.tier].push(`${days} ${w.start}–${w.end}`);
  }
  return [
    `- BEST windows (fill these first, rank 1 gets first pick): ${byTier.best.join("; ") || "none"}`,
    `- GOOD windows: ${byTier.good.join("; ") || "none"}`,
    `- OK windows (only when best/good are full): ${byTier.ok.join("; ") || "none"}`,
    `- NEVER: outside those windows, 12:00–13:00, before 07:30, after 16:00, weekends, and these no-send dates: ${s.noSendDates.join(", ") || "none"}`,
  ].join("\n");
}

/** Is a label one of the announcement types that bypass listing spacing? */
export function isAnnouncement(label: string | null | undefined, s: EmailSettings): boolean {
  const l = (label || "").trim().toLowerCase();
  return s.announcementLabels.some((a) => a.trim().toLowerCase() === l);
}

/** Minutes since midnight for "HH:MM" */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
