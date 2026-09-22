"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EmailSettings, DEFAULT_SETTINGS } from "@/lib/email/settings";
import { Button, Field, Input, LoadingBlock, Section, SlideOver } from "@/components/ui";

interface SettingsPanelProps {
  userEmail: string;
  onClose: () => void;
  /** Called with the saved settings so the page can update the planner's cap */
  onSaved: (s: EmailSettings) => void;
}

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

  // The panel can't be closed mid-save
  const safeClose = () => {
    if (!saving) onClose();
  };

  return (
    // Shared SlideOver primitive — Save/Cancel live in the sticky footer
    <SlideOver
      open
      onClose={safeClose}
      width="lg"
      title="Scheduler settings"
      description="These are the rules the AI follows. Changes apply to the next scheduling pass."
      footer={
        <div className="flex items-center justify-between gap-4 w-full">
          <span className="text-xs text-danger-fg min-w-0">{error || ""}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={loading}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-8">
          {/* Volume */}
          <Section title="Volume">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max sends per day">
                <Input type="number" min={1} max={12} value={s.maxSendsPerDay} onChange={(e) => set("maxSendsPerDay", Number(e.target.value))} />
              </Field>
              <Field label="Min gap (minutes)">
                <Input type="number" min={15} max={240} step={15} value={s.minGapMinutes} onChange={(e) => set("minGapMinutes", Number(e.target.value))} />
              </Field>
            </div>
          </Section>

          {/* No-send dates */}
          <Section title="No-send dates">
            <p className="text-xs text-text-3 mb-3">Holidays and dead days. Pre-filled with US holidays — remove any you disagree with.</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {s.noSendDates.map((d) => (
                <Chip key={d} label={new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} onRemove={() => set("noSendDates", s.noSendDates.filter((x) => x !== d))} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(newDate) && !s.noSendDates.includes(newDate)) {
                    set("noSendDates", [...s.noSendDates, newDate].sort());
                    setNewDate("");
                  }
                }}
              >
                Add
              </Button>
            </div>
          </Section>

          {/* Spacing */}
          <Section title="Listing spacing">
            <p className="text-xs text-text-3 mb-3">One send per listing per N days. Announcement labels ignore this and push the listing&apos;s recurring send instead.</p>
            <div className="space-y-4">
              <Field label="Days between sends">
                <div className="w-24">
                  <Input type="number" min={0} max={60} value={s.spacingDays} onChange={(e) => set("spacingDays", Number(e.target.value))} />
                </div>
              </Field>
              <Field label="Announcement labels">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {s.announcementLabels.map((l) => (
                    <Chip key={l} label={l} onRemove={() => set("announcementLabels", s.announcementLabels.filter((x) => x !== l))} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Price Reduced" />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const l = newLabel.trim();
                      if (l && !s.announcementLabels.some((x) => x.toLowerCase() === l.toLowerCase())) {
                        set("announcementLabels", [...s.announcementLabels, l]);
                        setNewLabel("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </Field>
            </div>
          </Section>

          {/* Decay */}
          <Section title="Freshness decay">
            <p className="text-xs text-text-3 mb-3">Recurring campaigns slow down as they age unless pinned. You get an alert when it happens.</p>
            <label className="flex items-center gap-2 text-sm text-text mb-4 cursor-pointer">
              <input type="checkbox" checked={s.decay.enabled} onChange={(e) => set("decay", { ...s.decay, enabled: e.target.checked })} className="accent-accent" />
              Enabled
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Weekly → bi-weekly after (days)">
                <Input type="number" min={7} value={s.decay.weeklyToBiweeklyDays} onChange={(e) => set("decay", { ...s.decay, weeklyToBiweeklyDays: Number(e.target.value) })} disabled={!s.decay.enabled} />
              </Field>
              <Field label="Bi-weekly → monthly after (days)">
                <Input type="number" min={14} value={s.decay.biweeklyToMonthlyDays} onChange={(e) => set("decay", { ...s.decay, biweeklyToMonthlyDays: Number(e.target.value) })} disabled={!s.decay.enabled} />
              </Field>
            </div>
          </Section>

          {/* Stale alert */}
          <Section title="Stale content alert">
            <p className="text-xs text-text-3 mb-3">Flag a campaign on the schedule when nobody has edited it in this many days.</p>
            <Field label="Days">
              <div className="w-24">
                <Input type="number" min={3} max={365} value={s.staleAlertDays} onChange={(e) => set("staleAlertDays", Number(e.target.value))} />
              </div>
            </Field>
          </Section>
        </div>
      )}
    </SlideOver>
  );
}

/** Removable chip (dates, labels) — pill with a small × on the right */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1 rounded-pill bg-surface-2 text-xs text-text">
      {label}
      {/* Tiny remove control — too small for IconButton (32px), so a bare button with an icon */}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="w-4 h-4 rounded-full flex items-center justify-center text-text-3 hover:text-danger-fg">
        <X size={12} strokeWidth={1.75} />
      </button>
    </span>
  );
}
