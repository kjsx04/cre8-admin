"use client";

import { useMemo, useState } from "react";
import { Campaign, CampaignPriority } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate } from "@/lib/email/utils";
import { FREQUENCY_LABELS } from "@/lib/email/constants";

interface PriorityPanelProps {
  campaigns: Campaign[];
  userEmail: string;
  onClose: () => void;
  /** Called after changes are applied so the page can refetch */
  onApplied: () => Promise<void> | void;
}

type RowState = "idle" | "working" | "done" | "error";

/**
 * Priorities — slide-over listing every campaign on the schedule, grouped by listing,
 * with a Highest / Normal toggle. Apply saves each change and asks the AI for a new
 * slot right away, so a listing flipped to Highest moves to a better time today.
 */
export default function PriorityPanel({ campaigns, userEmail, onClose, onApplied }: PriorityPanelProps) {
  const onSchedule = useMemo(
    () => campaigns.filter((c) => c.status === "scheduled" || c.status === "active"),
    [campaigns]
  );

  // Group by listing so a listing with two campaigns reads as one block
  const groups = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const c of onSchedule) {
      const list = map.get(c.listing_id) || [];
      list.push(c);
      map.set(c.listing_id, list);
    }
    return Array.from(map.values()).sort((a, b) => (a[0].listing_name || "").localeCompare(b[0].listing_name || ""));
  }, [onSchedule]);

  // Pending priority per campaign id (only the ones the user touched)
  const [pending, setPending] = useState<Record<string, CampaignPriority>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowResult, setRowResult] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);

  const changedIds = Object.keys(pending).filter((id) => {
    const c = onSchedule.find((x) => x.id === id);
    return c && (c.priority || "normal") !== pending[id];
  });

  const setPriority = (c: Campaign, p: CampaignPriority) => {
    setPending((prev) => {
      const next = { ...prev };
      if ((c.priority || "normal") === p) delete next[c.id];
      else next[c.id] = p;
      return next;
    });
  };

  async function apply() {
    if (changedIds.length === 0) return;
    setApplying(true);
    for (const id of changedIds) {
      setRowState((s) => ({ ...s, [id]: "working" }));
      try {
        const res = await fetch(`/api/email/campaigns/${id}/reschedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-email": userEmail },
          body: JSON.stringify({ priority: pending[id] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Reschedule failed");
        setRowState((s) => ({ ...s, [id]: "done" }));
        setRowResult((r) => ({ ...r, [id]: data.scheduled_date ? `Now ${formatScheduleDate(data.scheduled_date)}` : "Updated" }));
      } catch (err) {
        setRowState((s) => ({ ...s, [id]: "error" }));
        setRowResult((r) => ({ ...r, [id]: err instanceof Error ? err.message : "Failed" }));
      }
    }
    setApplying(false);
    setPending({});
    await onApplied();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={applying ? undefined : onClose} />

      <div className="relative bg-white w-full max-w-xl h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-light">
          <div>
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal">Priorities</h3>
            <p className="text-xs text-muted-gray mt-0.5">
              Highest grabs the best slot in the next few days and can bump others. Normal fits in wherever there&apos;s room.
            </p>
          </div>
          <button onClick={onClose} disabled={applying} className="text-muted-gray hover:text-charcoal text-lg disabled:opacity-40">
            &times;
          </button>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {groups.length === 0 && (
            <p className="text-sm text-muted-gray py-8 text-center">Nothing on the schedule yet.</p>
          )}
          {groups.map((list) => {
            const first = list[0];
            return (
              <div key={first.listing_id} className="rounded-card border border-border-light overflow-hidden">
                {/* Listing header */}
                <div className="flex items-center gap-3 px-3 py-2 bg-subtle-gray border-b border-border-light">
                  <div className="w-12 h-8 rounded overflow-hidden bg-border-light shrink-0">
                    {first.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={first.photo_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-charcoal truncate">{first.listing_name}</span>
                </div>

                {/* One row per campaign */}
                {list.map((c) => {
                  const current = pending[c.id] ?? (c.priority || "normal");
                  const state = rowState[c.id] || "idle";
                  const color = getTypeColor(c.email_label);
                  const isRecurring = c.campaign_type === "recurring";
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-border-light last:border-b-0">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {c.email_label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-charcoal truncate">
                          {formatScheduleDate(c.scheduled_date)}
                          {isRecurring && c.frequency && (
                            <span className="text-muted-gray"> · ↻ {FREQUENCY_LABELS[c.frequency] || c.frequency}</span>
                          )}
                        </div>
                        {rowResult[c.id] && (
                          <div className={`text-[11px] ${state === "error" ? "text-red-500" : "text-green-dark"}`}>{rowResult[c.id]}</div>
                        )}
                      </div>

                      {/* Highest | Normal */}
                      <div className="flex gap-1 shrink-0">
                        {(["high", "normal"] as CampaignPriority[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            disabled={applying}
                            onClick={() => setPriority(c, p)}
                            className={`px-2.5 py-1 rounded-btn text-xs font-medium transition-colors ${
                              current === p
                                ? p === "high"
                                  ? "bg-amber-100 text-amber-700 border border-amber-200"
                                  : "bg-white text-[#1A1A1A] border border-[#E0E0E0] shadow-sm"
                                : "bg-light-gray text-medium-gray hover:text-charcoal border border-transparent"
                            }`}
                          >
                            {p === "high" ? "Highest" : "Normal"}
                          </button>
                        ))}
                      </div>

                      {state === "working" && (
                        <div className="w-3.5 h-3.5 border-2 border-green border-t-transparent rounded-full animate-spin shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border-light">
          <span className="text-xs text-muted-gray">
            {changedIds.length === 0
              ? "Change a priority to reschedule"
              : `${changedIds.length} change${changedIds.length === 1 ? "" : "s"} · AI will pick new slots`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={applying} className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40">
              Close
            </button>
            <button
              onClick={apply}
              disabled={applying || changedIds.length === 0}
              className="px-5 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? "Rescheduling…" : "Apply & Reschedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
