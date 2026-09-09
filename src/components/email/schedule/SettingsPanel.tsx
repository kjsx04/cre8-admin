"use client";

import { useEffect, useState } from "react";
import { EmailSettings, DEFAULT_SETTINGS } from "@/lib/email/settings";

interface SettingsPanelProps {
  userEmail: string;
  onClose: () => void;
  /** Called with the saved settings so the page can update the planner's cap */
  onSaved: (s: EmailSettings) => void;
}

const INPUT = "border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-green";
const LABEL = "block text-[11px] font-semibold text-muted-gray uppercase tracking-wide mb-1";

/**
 * Scheduler settings — everything the AI is told, in one place.
 * Cap, gap, no-send dates, listing spacing + announcement labels, freshness
 * decay thresholds, stale-content alert days. Send windows are fixed (see
 * DEFAULT_SETTINGS in settings.ts) and learn from tracking data over time.
 */
export default function SettingsPanel({ userEmail, onClose, onSaved }: SettingsPanelProps) {
  const [s, setS] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/settings", { headers: { "x-user-email": userEmail } });
        if (res.ok) setS(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [userEmail]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/email/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify(s),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={saving ? undefined : onClose} />
      <div className="relative bg-white w-full max-w-lg h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-light">
          <div>
            <h3 className="font-bebas text-2xl tracking-wide text-charcoal">Scheduler Settings</h3>
            <p className="text-xs text-muted-gray mt-0.5">These are the rules the AI follows. Changes apply to the next scheduling pass.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-muted-gray hover:text-charcoal text-lg disabled:opacity-40">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* Volume */}
              <section>
                <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-3">Volume</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Max sends per day</label>
                    <input type="number" min={1} max={12} value={s.maxSendsPerDay} onChange={(e) => set("maxSendsPerDay", Number(e.target.value))} className={`${INPUT} w-24`} />
                  </div>
                  <div>
                    <label className={LABEL}>Min gap (minutes)</label>
                    <input type="number" min={15} max={240} step={15} value={s.minGapMinutes} onChange={(e) => set("minGapMinutes", Number(e.target.value))} className={`${INPUT} w-24`} />
                  </div>
                </div>
              </section>

              {/* No-send dates */}
              <section>
                <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1">No-send dates</h4>
                <p className="text-[11px] text-muted-gray mb-3">Holidays and dead days. Pre-filled with US holidays — remove any you disagree with.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {s.noSendDates.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-light-gray text-xs text-charcoal">
                      {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                      <button type="button" onClick={() => set("noSendDates", s.noSendDates.filter((x) => x !== d))} className="text-muted-gray hover:text-red-500 leading-none">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={INPUT} />
                  <button
                    type="button"
                    onClick={() => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(newDate) && !s.noSendDates.includes(newDate)) {
                        set("noSendDates", [...s.noSendDates, newDate].sort());
                        setNewDate("");
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-charcoal bg-white border border-border-light rounded-btn hover:bg-light-gray"
                  >
                    Add
                  </button>
                </div>
              </section>

              {/* Spacing */}
              <section>
                <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1">Listing spacing</h4>
                <p className="text-[11px] text-muted-gray mb-3">One send per listing per N days. Announcement labels ignore this and push the listing&apos;s recurring send instead.</p>
                <div className="flex items-center gap-3 mb-3">
                  <label className="text-sm text-charcoal">Days between sends</label>
                  <input type="number" min={0} max={60} value={s.spacingDays} onChange={(e) => set("spacingDays", Number(e.target.value))} className={`${INPUT} w-20`} />
                </div>
                <label className={LABEL}>Announcement labels</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {s.announcementLabels.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-light-gray text-xs text-charcoal">
                      {l}
                      <button type="button" onClick={() => set("announcementLabels", s.announcementLabels.filter((x) => x !== l))} className="text-muted-gray hover:text-red-500 leading-none">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Price Reduced" className={`${INPUT} flex-1`} />
                  <button
                    type="button"
                    onClick={() => {
                      const l = newLabel.trim();
                      if (l && !s.announcementLabels.some((x) => x.toLowerCase() === l.toLowerCase())) {
                        set("announcementLabels", [...s.announcementLabels, l]);
                        setNewLabel("");
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-charcoal bg-white border border-border-light rounded-btn hover:bg-light-gray"
                  >
                    Add
                  </button>
                </div>
              </section>

              {/* Decay */}
              <section>
                <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1">Freshness decay</h4>
                <p className="text-[11px] text-muted-gray mb-3">Recurring campaigns slow down as they age unless pinned. You get an alert when it happens.</p>
                <label className="flex items-center gap-2 text-sm text-charcoal mb-3 cursor-pointer">
                  <input type="checkbox" checked={s.decay.enabled} onChange={(e) => set("decay", { ...s.decay, enabled: e.target.checked })} className="accent-[#8CC644]" />
                  Enabled
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Weekly → bi-weekly after (days)</label>
                    <input type="number" min={7} value={s.decay.weeklyToBiweeklyDays} onChange={(e) => set("decay", { ...s.decay, weeklyToBiweeklyDays: Number(e.target.value) })} className={`${INPUT} w-24`} disabled={!s.decay.enabled} />
                  </div>
                  <div>
                    <label className={LABEL}>Bi-weekly → monthly after (days)</label>
                    <input type="number" min={14} value={s.decay.biweeklyToMonthlyDays} onChange={(e) => set("decay", { ...s.decay, biweeklyToMonthlyDays: Number(e.target.value) })} className={`${INPUT} w-24`} disabled={!s.decay.enabled} />
                  </div>
                </div>
              </section>

              {/* Stale alert */}
              <section>
                <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1">Stale content alert</h4>
                <p className="text-[11px] text-muted-gray mb-3">Flag a campaign on the schedule when nobody has edited it in this many days.</p>
                <input type="number" min={3} max={365} value={s.staleAlertDays} onChange={(e) => set("staleAlertDays", Number(e.target.value))} className={`${INPUT} w-24`} />
              </section>
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border-light">
          <span className="text-xs text-red-500">{error || ""}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40">Cancel</button>
            <button onClick={save} disabled={saving || loading} className="px-5 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-40">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
