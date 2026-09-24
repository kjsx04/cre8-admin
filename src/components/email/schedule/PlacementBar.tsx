"use client";

import { useMemo, useState } from "react";
import { Campaign } from "@/lib/email/types";
import { endDateProblem } from "@/lib/email/validate-schedule";
import { placementProblem, type PlacementMove } from "@/lib/email/place";
import { ChoiceButton } from "@/components/email/composer/composer-ui";
import { Button } from "@/components/ui";

export interface PlacementResult {
  placedAt: string | null;
  moves: PlacementMove[];
  undoToken: unknown;
  test: boolean;
}

interface PlacementBarProps {
  campaign: Campaign;
  /** Highest number Custom accepts — listings on the schedule + 1 */
  rankMax: number;
  placing: boolean;
  result: PlacementResult | null;
  error: string | null;
  onPlace: (body: Record<string, unknown>) => void;
  onUndo: () => void;
  onDone: () => void;
}

type Freq = "one-time" | "weekly" | "bi-weekly" | "monthly";
type Priority = "high" | "normal" | "custom" | "test";

const FREQ: { id: Freq; label: string }[] = [
  { id: "one-time", label: "One-time" },
  { id: "weekly", label: "Weekly" },
  { id: "bi-weekly", label: "Bi-weekly" },
  { id: "monthly", label: "Monthly" },
];

const PRIORITY: { id: Priority; label: string; hint: string }[] = [
  { id: "high", label: "Top", hint: "Best slot available. Other emails move if they have to." },
  { id: "normal", label: "Fit", hint: "Best slot that's still open. Nothing else moves." },
  { id: "custom", label: "Custom", hint: "Goes in at the number you choose. The AI works around it." },
  { id: "test", label: "Test", hint: "You pick the exact time. No AI and no scheduling rules." },
];

/** Tomorrow in Phoenix, as YYYY-MM-DD — the earliest an end date makes sense */
function tomorrowKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
    new Date(Date.now() + 86_400_000)
  );
}

/** Today in Phoenix — the default date for a test send */
function todayPhoenix(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());
}

/**
 * PlacementBar — the scheduling step, on the calendar.
 *
 * Set how often the email repeats and how hard it should fight for a slot, then
 * let the AI place it and watch the calendar rearrange. Test skips the AI and
 * uses the exact time you give it.
 */
export default function PlacementBar({
  campaign,
  rankMax,
  placing,
  result,
  error,
  onPlace,
  onUndo,
  onDone,
}: PlacementBarProps) {
  const [freq, setFreq] = useState<Freq>(
    campaign.campaign_type === "recurring" ? ((campaign.frequency as Freq) || "weekly") : "one-time"
  );
  const [priority, setPriority] = useState<Priority>("normal");
  const [rank, setRank] = useState(1);
  const [endDate, setEndDate] = useState(campaign.end_date ? campaign.end_date.slice(0, 10) : "");
  const [pinned, setPinned] = useState(!!campaign.pinned);
  const [sendDate, setSendDate] = useState(todayPhoenix());
  const [sendTime, setSendTime] = useState("11:05");

  const isRecurring = freq !== "one-time";
  const isTest = priority === "test";

  const body = useMemo(
    () => ({
      campaign_type: (isRecurring ? "recurring" : "one-time") as "one-time" | "recurring",
      frequency: isRecurring ? freq : "one-time",
      end_date: isRecurring && endDate ? endDate : null,
      pinned,
      priority,
      priority_rank: priority === "custom" ? rank : null,
      send_date: isTest ? sendDate : undefined,
      send_time: isTest ? sendTime : undefined,
    }),
    [isRecurring, freq, endDate, pinned, priority, rank, isTest, sendDate, sendTime]
  );

  // Test ignores end dates entirely; everything else must leave room for a send
  const problem =
    placementProblem(body) || (!isTest && isRecurring ? endDateProblem(endDate) : null);

  const label = campaign.email_label
    ? `${campaign.email_label}: ${campaign.listing_name}`
    : campaign.listing_name;

  // ── Placed: collapse to a result line ──
  if (result) {
    return (
      <div className="mb-4 rounded-card border border-green bg-[#f7fdf0] px-4 py-3 flex items-center gap-3 flex-wrap animate-slide-up">
        <span className="text-sm text-charcoal">
          <span className="font-medium">{label}</span> is on the schedule
          {result.placedAt && <> for {formatSlot(result.placedAt)}</>}.
          {result.moves.length > 0 && (
            <span className="text-muted-gray">
              {" "}
              {result.moves.length} other {result.moves.length === 1 ? "email" : "emails"} moved.
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onUndo} loading={placing}>
            Undo
          </Button>
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // ── Setting it up ──
  return (
    <div className="mb-4 rounded-card border border-border-light bg-white px-4 py-4 space-y-4 animate-slide-up">
      {/* What we're placing */}
      <div className="flex items-center gap-3">
        {campaign.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.photo_url} alt="" className="w-12 h-9 rounded object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-[11px] text-muted-gray">Placing on the schedule</p>
          <p className="text-sm font-medium text-charcoal truncate">{label}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDone} className="ml-auto">
          Cancel
        </Button>
      </div>

      {/* How often */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-medium-gray">How often</p>
        <div className="flex flex-wrap gap-2">
          {FREQ.map((f) => (
            <ChoiceButton key={f.id} selected={freq === f.id} onClick={() => setFreq(f.id)}>
              {f.label}
            </ChoiceButton>
          ))}
        </div>
        {isRecurring && !isTest && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <label className="text-[12px] text-medium-gray">Ends</label>
            <input
              type="date"
              value={endDate}
              min={tomorrowKey()}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-border-light rounded-btn px-2 py-1 text-sm"
            />
            {endDate && (
              <button type="button" onClick={() => setEndDate("")} className="text-xs text-muted-gray hover:text-charcoal">
                Clear
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-charcoal cursor-pointer ml-2">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-green" />
              Keep this cadence
            </label>
          </div>
        )}
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-medium-gray">Priority</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITY.map((p) => (
            <ChoiceButton key={p.id} selected={priority === p.id} onClick={() => setPriority(p.id)}>
              {p.label}
            </ChoiceButton>
          ))}
        </div>

        {priority === "custom" && (
          <label className="flex items-center gap-2 text-sm text-charcoal pt-1">
            <span className="text-muted-gray">#</span>
            <input
              type="number"
              min={1}
              max={rankMax}
              value={rank}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                setRank(Number.isFinite(n) ? Math.max(1, Math.min(rankMax, n)) : 1);
              }}
              className="w-16 border border-border-light rounded-btn px-2 py-1 text-sm text-center tabular-nums"
            />
            <span className="text-xs text-muted-gray">of {rankMax}</span>
          </label>
        )}

        {isTest && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <input
              type="date"
              value={sendDate}
              onChange={(e) => setSendDate(e.target.value)}
              className="border border-border-light rounded-btn px-2 py-1 text-sm"
            />
            <input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="border border-border-light rounded-btn px-2 py-1 text-sm"
            />
            <span className="text-xs text-amber-600">Test ignores every scheduling rule.</span>
          </div>
        )}

        <p className="text-xs text-muted-gray">{PRIORITY.find((p) => p.id === priority)?.hint}</p>
      </div>

      {/* Go */}
      <div className="flex items-center gap-3 pt-1">
        <Button size="sm" onClick={() => onPlace(body)} disabled={!!problem} loading={placing}>
          Schedule
        </Button>
        {problem && <span className="text-xs text-text-3">{problem}</span>}
        {error && <span className="text-xs text-danger-fg">{error}</span>}
      </div>
    </div>
  );
}

/** "Tue Sep 29 at 9:30 AM" */
function formatSlot(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Phoenix" }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Phoenix" })
  );
}
