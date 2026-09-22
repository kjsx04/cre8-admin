"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate, calculatePriority, canEdit, canPause, canResume } from "@/lib/email/utils";
import { STATUS_LABELS } from "@/lib/email/constants";
import { Badge, Button, Section, SlideOver } from "@/components/ui";
import PriorityBadge from "./PriorityBadge";
import EmailPreview from "./EmailPreview";
import { STATUS_TONE } from "./CampaignCard";
import { useAudienceCounts, formatCount, recipientLine } from "@/lib/email/audience-client";

interface CampaignDetailProps {
  campaign: Campaign;
  onUpdate: (id: string, data: Partial<CampaignFormData>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  /** Ask the AI for a fresh slot (after edits, or when the current one is bad) */
  onReschedule?: (id: string) => Promise<void>;
  /** Send immediately, skipping the AI */
  onSendNow?: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Slide-over detail panel — same pattern as DealDetail */
export default function CampaignDetail({
  campaign,
  onUpdate,
  onDelete,
  onPause,
  onResume,
  onReschedule,
  onSendNow,
  onClose,
}: CampaignDetailProps) {
  void onUpdate; // reserved for inline edit
  const router = useRouter();
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  // Audience size for the "Audience" row + send-now confirm
  const audience = useAudienceCounts();
  const audienceCount = audience[campaign.segment_id || "all"];

  // Delivery stats from Resend webhooks (per recipient, across all sends of this campaign)
  const [stats, setStats] = useState<{ sends: number; delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number } | null>(null);
  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      try {
        const res = await fetch(`/api/email/campaigns/${campaign.id}/stats`, { headers: { "x-user-email": userEmail } });
        if (res.ok) setStats(await res.json());
      } catch {
        /* quiet */
      }
    })();
  }, [campaign.id, userEmail]);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const color = getTypeColor(campaign.email_label);
  const priority = calculatePriority(campaign.email_label);
  const displayDate =
    campaign.campaign_type === "recurring"
      ? campaign.next_send_date
      : campaign.scheduled_date;

  const handlePause = async () => {
    setActionLoading(true);
    await onPause(campaign.id);
    setActionLoading(false);
  };

  const handleResume = async () => {
    setActionLoading(true);
    await onResume(campaign.id);
    setActionLoading(false);
  };

  const handleSendNow = async () => {
    if (!onSendNow) return;
    setActionLoading(true);
    await onSendNow(campaign.id);
    setActionLoading(false);
    setShowSendConfirm(false);
  };

  const handleReschedule = async () => {
    if (!onReschedule) return;
    setActionLoading(true);
    await onReschedule(campaign.id);
    setActionLoading(false);
  };

  const handleDelete = async () => {
    setActionLoading(true);
    await onDelete(campaign.id);
    setActionLoading(false);
    setShowDeleteConfirm(false);
  };

  const canSendNow = !!onSendNow && (campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "active");
  const canReschedule = !!onReschedule && (campaign.status === "scheduled" || campaign.status === "active");

  /**
   * Footer — the panel's actions. When a confirm step is open (send now / delete)
   * the footer swaps to that question so it stays next to the button that opened it.
   */
  const footer = showSendConfirm ? (
    <div className="flex items-center justify-between gap-4 w-full">
      <p className="text-sm text-text min-w-0">
        Send <span className="font-medium">{campaign.email_label ? `${campaign.email_label}: ` : ""}{campaign.listing_name}</span> to{" "}
        <span className="font-medium">{campaign.segment_name}{audienceCount ? ` (${formatCount(audienceCount.subscribed)} people)` : ""}</span> right now?
        {campaign.campaign_type === "recurring" && <span className="text-text-3"> The cadence restarts from today.</span>}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" onClick={() => setShowSendConfirm(false)} disabled={actionLoading}>
          Cancel
        </Button>
        <Button onClick={handleSendNow} loading={actionLoading}>
          Yes, send now
        </Button>
      </div>
    </div>
  ) : showDeleteConfirm ? (
    <div className="flex items-center justify-between gap-4 w-full">
      <p className="text-sm text-danger-fg">Delete this campaign? This will also cancel any pending scheduled send.</p>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={actionLoading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} loading={actionLoading}>
          Delete
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {/* Delete sits alone on the left, away from the other actions */}
      {canEdit(campaign.status) && (
        <Button variant="ghost" onClick={() => setShowDeleteConfirm(true)} className="mr-auto text-danger-fg hover:text-danger-fg">
          Delete
        </Button>
      )}
      <Button variant="ghost" onClick={() => setShowPreview(true)} className="ml-auto">
        Preview
      </Button>
      {/* Edit — opens the full-page composer (draft/scheduled/active only) */}
      {canEdit(campaign.status) && (
        <Button variant="secondary" onClick={() => router.push(`/marketing/email/${campaign.id}/edit`)}>
          Edit
        </Button>
      )}
      {/* Reschedule — AI picks a fresh slot (scheduled/active only) */}
      {canReschedule && (
        <Button variant="secondary" onClick={handleReschedule} loading={actionLoading} title="AI picks a new time">
          Reschedule
        </Button>
      )}
      {/* Pause / Resume */}
      {canPause(campaign) && (
        <Button variant="secondary" onClick={handlePause} loading={actionLoading}>
          Pause
        </Button>
      )}
      {canResume(campaign) && (
        <Button variant="secondary" onClick={handleResume} loading={actionLoading}>
          Resume
        </Button>
      )}
      {/* Send now — goes out within a couple of minutes, skips the AI */}
      {canSendNow && (
        <Button onClick={() => setShowSendConfirm(true)} disabled={actionLoading}>
          Send now
        </Button>
      )}
    </div>
  );

  return (
    <>
      {/* Shared SlideOver primitive — header shows label / priority / status badges */}
      <SlideOver
        open
        onClose={onClose}
        width="lg"
        title={campaign.listing_name}
        description={
          <div className="flex items-center gap-2 mt-1">
            {/* Campaign-type color is data (see TYPE_COLORS), so it stays inline */}
            <span className="text-xs font-semibold px-2 py-0.5 rounded-pill text-white" style={{ backgroundColor: color }}>
              {campaign.email_label || "Group"}
            </span>
            <PriorityBadge priority={priority} />
            <Badge tone={STATUS_TONE[campaign.status] || "neutral"}>{STATUS_LABELS[campaign.status]}</Badge>
          </div>
        }
        footer={footer}
      >
        <div className="space-y-6">
          {/* Schedule info */}
          <Section title="Schedule">
            <div className="space-y-2">
              <InfoRow label="Scheduled" value={formatScheduleDate(displayDate)} />
              {campaign.campaign_type === "recurring" && (
                <>
                  <InfoRow label="Frequency" value={campaign.frequency || "—"} />
                  <InfoRow
                    label="End date"
                    value={campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : "None"}
                  />
                </>
              )}
              <InfoRow label="Type" value={campaign.campaign_type === "recurring" ? "Recurring" : "One-time"} />
              <InfoRow
                label="Audience"
                value={audienceCount ? `${campaign.segment_name} · ${formatCount(audienceCount.subscribed)}` : campaign.segment_name}
                sub={audienceCount && audienceCount.unsubscribed > 0 ? recipientLine(audienceCount) : undefined}
              />
            </div>
          </Section>

          {/* Content info */}
          <Section title="Email content">
            <div className="space-y-2">
              {campaign.heading_text && (
                <InfoRow label="Heading" value={campaign.heading_text} />
              )}
              {campaign.body_text && (
                <InfoRow label="Body" value={campaign.body_text} />
              )}
              {campaign.highlights && campaign.highlights.length > 0 && (
                <div>
                  <span className="text-xs text-text-3 font-medium">Highlights</span>
                  <ul className="mt-1 space-y-0.5">
                    {campaign.highlights.map((h, i) => (
                      <li key={i} className="text-sm text-text">&bull; {h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>

          {/* Broker info */}
          <Section title="Sending broker">
            <div className="space-y-2">
              <InfoRow label="Name" value={campaign.broker_name} />
              <InfoRow label="Email" value={campaign.broker_email} />
              {campaign.broker_phone && (
                <InfoRow label="Phone" value={campaign.broker_phone} />
              )}
            </div>
          </Section>

          {/* AI Reasoning */}
          {campaign.ai_reasoning && (
            <Section title="AI scheduling reasoning">
              <p className="text-sm text-text-2 leading-relaxed">
                {campaign.ai_reasoning}
              </p>
            </Section>
          )}

          {/* Group listings */}
          {campaign.campaign_kind === "group" && (campaign.group_listings || []).length > 0 && (
            <Section title={`Listings (${campaign.group_listings.length})`}>
              <div className="space-y-2">
                {campaign.group_listings.map((g, i) => (
                  <a key={g.listing_id} href={g.url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                    <span className="text-xs w-4 text-text-3 tabular-nums">{i + 1}</span>
                    <div className="w-10 h-7 rounded overflow-hidden bg-surface-2 shrink-0">
                      {g.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.photo_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-text truncate group-hover:underline">{g.name}</div>
                      <div className="text-xs text-text-3 truncate">{[g.chip, g.summary].filter(Boolean).join(" · ")}</div>
                    </div>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Results */}
          {stats && stats.sends > 0 && (
            <Section title="Results">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Sends", stats.sends],
                  ["Delivered", stats.delivered],
                  ["Opened", stats.opened],
                  ["Clicked", stats.clicked],
                  ["Bounced", stats.bounced],
                  ["Unsubscribed", stats.unsubscribed],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-control bg-surface-2 px-3 py-2">
                    <div className="text-xs text-text-3">{k}</div>
                    <div className="text-sm font-semibold text-text tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              {stats.delivered > 0 && (
                <p className="text-xs text-text-3 mt-2">
                  Open rate {Math.round((stats.opened / stats.delivered) * 100)}% · click rate {Math.round((stats.clicked / stats.delivered) * 100)}%
                </p>
              )}
            </Section>
          )}
        </div>
      </SlideOver>

      {/* Email preview modal */}
      {showPreview && (
        <EmailPreview campaign={campaign} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

/** Label + value row */
function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-text-3 font-medium shrink-0">{label}</span>
      <span className="text-sm text-text text-right">
        {value}
        {sub && <span className="block text-xs text-text-3">{sub}</span>}
      </span>
    </div>
  );
}
