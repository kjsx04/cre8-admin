"use client";

/**
 * Actions on a campaign that is already on the calendar.
 *
 * These used to sit in the detail slide-over, which was the wrong place: each
 * one rewrites the pending send, and you could not see what you were changing.
 * Here they sit above the live preview, so the result is visible immediately.
 *
 * All three refuse to touch mail that has already gone out — they only ever
 * replace the *pending* Resend broadcast.
 */

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Campaign } from "@/lib/email/types";
import { usesCurrentTemplate, canSyncTemplate, canRefreshListing } from "@/lib/email/template-version";
import { formatScheduleDate } from "@/lib/email/utils";
import { Button } from "@/components/ui";
import { CalendarClock, LayoutTemplate, RefreshCw } from "lucide-react";

interface ScheduledActionsProps {
  campaign: Campaign;
  /** Re-read the campaign after an action changes it */
  onChanged: () => void;
}

type Action = "template" | "listing" | "reschedule";

export default function ScheduledActions({ campaign, onChanged }: ScheduledActionsProps) {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const [busy, setBusy] = useState<Action | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onCalendar = campaign.status === "scheduled" || campaign.status === "active";
  const templateCurrent = usesCurrentTemplate(campaign);
  const showSync = canSyncTemplate(campaign.status);
  const showRefresh = canRefreshListing(campaign.status);

  // A draft has no pending send to rewrite, so none of this applies
  if (!onCalendar && !showSync && !showRefresh) return null;

  const run = async (action: Action, path: string, done: string) => {
    setBusy(action);
    setNote(null);
    try {
      const res = await fetch(`/api/email/campaigns/${campaign.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `${path} failed`);
      setNote(done);
      onChanged();
    } catch (err) {
      setNote(err instanceof Error ? err.message : `${path} failed`);
    } finally {
      setBusy(null);
      window.setTimeout(() => setNote(null), 6000);
    }
  };

  const nextSend = campaign.campaign_type === "recurring" ? campaign.next_send_date : campaign.scheduled_date;

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3 space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-label font-semibold uppercase tracking-wide text-text-3">On the calendar</p>
        {nextSend && <p className="text-xs text-text">{formatScheduleDate(nextSend)}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onCalendar && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("reschedule", "reschedule", "Moved to a new slot")}
            disabled={!!busy}
            loading={busy === "reschedule"}
            icon={<CalendarClock size={16} strokeWidth={1.75} />}
            title="Let the AI pick a fresh slot for this send"
          >
            Reschedule
          </Button>
        )}

        {showSync && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("template", "sync-template", "Template synced")}
            disabled={!!busy}
            loading={busy === "template"}
            icon={<LayoutTemplate size={16} strokeWidth={1.75} />}
            title="Rebuild the pending send with the current email layout. Mail already sent is unchanged."
          >
            Sync template
          </Button>
        )}

        {showRefresh && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("listing", "refresh-listing", "Listing refreshed")}
            disabled={!!busy}
            loading={busy === "listing"}
            icon={<RefreshCw size={16} strokeWidth={1.75} />}
            title="Pull the listing's current photos and fields into the pending send. Your typed copy is kept."
          >
            Refresh listing
          </Button>
        )}
      </div>

      {!templateCurrent && showSync && (
        <p className="text-xs text-warning-fg">
          The email layout changed since this was scheduled. Sync to use the new one.
        </p>
      )}
      {note && <p className="text-xs text-text-3">{note}</p>}
    </div>
  );
}
