"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Campaign } from "@/lib/email/types";
import { formatScheduleDate, canEdit, canPause } from "@/lib/email/utils";
import { STATUS_LABELS } from "@/lib/email/constants";
import { Button, Badge, IconButton, type Tone } from "@/components/ui";
import { Pencil, Pause, Trash2, X } from "lucide-react";

/** Campaign status → the shared badge tones, so these pills match the rest of the app */
const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  completed: "neutral",
  cancelled: "danger",
};
import { useAudience, formatCount, recipientLine, audienceForCampaign, audienceLabel } from "@/lib/email/audience-client";

interface CampaignDetailProps {
  campaign: Campaign;
  onDelete: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Slide-over detail panel — what this send is and how it did.
 *
 * Read-only by design. Edit, Pause and Delete are the only actions: everything
 * that changes the email itself (template sync, refreshing the listing,
 * rescheduling, sending now) lives in the editor, where you can see what you're
 * changing. Pausing takes it off the calendar and down to the saved campaigns,
 * where Schedule puts it back.
 */
export default function CampaignDetail({ campaign, onDelete, onPause, onClose }: CampaignDetailProps) {
  const router = useRouter();
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  // Audience size for the "Audience" row + send-now confirm
  const audience = useAudience();
  const audienceCount = audienceForCampaign(audience.map, campaign.segment_id, audience.overlaps);
  const audienceName = audienceLabel(audience.map, campaign.segment_id, campaign.segment_name);

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const displayDate =
    campaign.campaign_type === "recurring"
      ? campaign.next_send_date
      : campaign.scheduled_date;

  const handlePause = async () => {
    setActionLoading(true);
    await onPause(campaign.id);
    setActionLoading(false);
  };

  const handleDelete = async () => {
    setActionLoading(true);
    await onDelete(campaign.id);
    setActionLoading(false);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      {/* Slide-over panel */}
      <div className="fixed inset-0 z-40 flex justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20" onClick={onClose} />

        {/* Panel */}
        <div className="relative bg-light-gray w-full max-w-lg overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-border-light px-6 py-4 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* The heading is email copy, not identity — the listing names this panel */}
                <h2 className="font-bebas text-2xl tracking-wide text-charcoal truncate">
                  {campaign.listing_name}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={STATUS_TONE[campaign.status] || "neutral"}>{STATUS_LABELS[campaign.status]}</Badge>
                <IconButton label="Close" onClick={onClose} icon={<X size={18} strokeWidth={1.75} />} />
              </div>
            </div>

            {/* Edit is the one thing you do from here often, so it sits up top.
                Everything that changes the email itself — template sync,
                refreshing the listing, rescheduling — lives behind it. */}
            {canEdit(campaign.status) && (
              <div className="mt-3 flex justify-end">
                <Button size="sm" icon={<Pencil size={16} strokeWidth={1.75} />} onClick={() => router.push(`/marketing/email/${campaign.id}/edit`)}>
                  Edit
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-5">
            {/* Read top to bottom: what kind of send, how often, when next, when it
                stops, who gets it, who it comes from. */}
            <Section title="Information">
              <InfoRow label="Type" value={campaign.campaign_type === "recurring" ? "Recurring" : "One-time"} />
              {campaign.campaign_type === "recurring" && (
                <InfoRow label="Frequency" value={capitalize(campaign.frequency)} />
              )}
              <InfoRow label="Next scheduled" value={formatScheduleDate(displayDate)} />
              {campaign.campaign_type === "recurring" && (
                <InfoRow
                  label="End date"
                  value={campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : "None"}
                />
              )}
              <InfoRow
                label="Audience"
                value={audienceCount ? `${audienceName} · ${formatCount(audienceCount.subscribed)}` : audienceName}
                sub={audienceCount && audienceCount.unsubscribed > 0 ? recipientLine(audienceCount) : undefined}
              />
              <InfoRow label="Sending broker" value={campaign.broker_name} />
            </Section>

            {/* Group listings */}
            {campaign.campaign_kind === "group" && (campaign.group_listings || []).length > 0 && (
              <Section title={`Listings (${campaign.group_listings.length})`}>
                <div className="space-y-1.5">
                  {campaign.group_listings.map((g, i) => (
                    <a key={g.listing_id} href={g.url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                      <span className="text-[10px] w-4 text-muted-gray">{i + 1}</span>
                      <div className="w-10 h-7 rounded overflow-hidden bg-border-light shrink-0">
                        {g.photo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.photo_url} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-charcoal truncate group-hover:underline">{g.name}</div>
                        <div className="text-[11px] text-muted-gray truncate">{[g.chip, g.summary].filter(Boolean).join(" · ")}</div>
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
                    <div key={String(k)} className="rounded-btn bg-light-gray px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-gray">{k}</div>
                      <div className="text-sm font-semibold text-charcoal">{v}</div>
                    </div>
                  ))}
                </div>
                {stats.delivered > 0 && (
                  <p className="text-[11px] text-muted-gray">
                    Open rate {Math.round((stats.opened / stats.delivered) * 100)}% · click rate {Math.round((stats.clicked / stats.delivered) * 100)}%
                  </p>
                )}
              </Section>
            )}

            {/* Why the AI put it where it did — after the numbers it produced */}
            {campaign.ai_reasoning && (
              <Section title="AI Scheduling Reasoning">
                <p className="text-sm text-medium-gray leading-relaxed">{campaign.ai_reasoning}</p>
              </Section>
            )}

            {/* The two that change something, kept to the bottom */}
            <div className="flex items-center gap-2 pt-1">
              {canPause(campaign) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePause}
                  loading={actionLoading}
                  icon={<Pause size={16} strokeWidth={1.75} />}
                  title="Take it off the calendar — it moves down to your saved campaigns"
                >
                  Pause
                </Button>
              )}
              {canEdit(campaign.status) && !showDeleteConfirm && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  icon={<Trash2 size={16} strokeWidth={1.75} />}
                  className="ml-auto text-danger-fg hover:bg-danger-bg"
                >
                  Delete
                </Button>
              )}
            </div>

            {showDeleteConfirm && (
              <div className="bg-danger-bg border border-danger/20 rounded-control p-3 space-y-2">
                <p className="text-sm text-danger-fg">
                  Delete this campaign? This also cancels any pending scheduled send.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={handleDelete} loading={actionLoading}>
                    Confirm delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  );
}

/** "bi-weekly" → "Bi-weekly". Frequencies are stored lowercase. */
function capitalize(value: string | null | undefined): string {
  const v = (value || "").trim();
  if (!v) return "\u2014";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** Section wrapper */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-card border border-border-light p-4">
      <h4 className="text-xs font-semibold text-muted-gray uppercase tracking-wide mb-3">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** Label + value row */
function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-muted-gray font-medium shrink-0">{label}</span>
      <span className="text-sm text-charcoal text-right">
        {value}
        {sub && <span className="block text-[11px] text-muted-gray">{sub}</span>}
      </span>
    </div>
  );
}
