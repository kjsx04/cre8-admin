"use client";

import { useState } from "react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import { getTypeColor, formatScheduleDate, calculatePriority, canEdit, canPause, canResume } from "@/lib/email/utils";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/email/constants";
import { ListingItem } from "@/lib/admin-constants";
import PriorityBadge from "./PriorityBadge";
import EmailPreview from "./EmailPreview";
import CampaignForm from "./CampaignForm";

interface CampaignDetailProps {
  campaign: Campaign;
  onUpdate: (id: string, data: Partial<CampaignFormData>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onClose: () => void;
  /** Called when user edits via the form — triggers full re-schedule */
  onEdit?: (data: CampaignFormData, autoSchedule: boolean) => Promise<void>;
  listings?: ListingItem[];
}

/** Slide-over detail panel — same pattern as DealDetail */
export default function CampaignDetail({
  campaign,
  onUpdate,
  onDelete,
  onPause,
  onResume,
  onClose,
  onEdit,
  listings,
}: CampaignDetailProps) {
  void onUpdate; // reserved for inline edit
  const [showPreview, setShowPreview] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const handleDelete = async () => {
    setActionLoading(true);
    await onDelete(campaign.id);
    setActionLoading(false);
    setShowDeleteConfirm(false);
  };

  // Handle edit form submission — fire callback and close form immediately.
  // Parent page manages the toast animation lifecycle.
  const handleEditSubmit = async (data: CampaignFormData, autoSchedule: boolean) => {
    if (onEdit) {
      onEdit(data, autoSchedule); // don't await — parent shows toast
      setShowEditForm(false);
    }
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
                {/* Label badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                    style={{ color: "#fff", backgroundColor: color }}
                  >
                    {campaign.email_label}
                  </span>
                  <PriorityBadge priority={priority} />
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                    style={{
                      color: STATUS_COLORS[campaign.status],
                      backgroundColor: `${STATUS_COLORS[campaign.status]}15`,
                    }}
                  >
                    {STATUS_LABELS[campaign.status]}
                  </span>
                </div>

                <h2 className="font-bebas text-2xl tracking-wide text-charcoal truncate">
                  {campaign.listing_name}
                </h2>
              </div>

              <button
                onClick={onClose}
                className="text-muted-gray hover:text-charcoal text-xl shrink-0"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-5">
            {/* Schedule info */}
            <Section title="Schedule">
              <InfoRow label="Scheduled" value={formatScheduleDate(displayDate)} />
              {campaign.campaign_type === "recurring" && (
                <>
                  <InfoRow label="Frequency" value={campaign.frequency || "\u2014"} />
                  <InfoRow
                    label="End Date"
                    value={campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : "None"}
                  />
                </>
              )}
              <InfoRow label="Type" value={campaign.campaign_type === "recurring" ? "Recurring" : "One-Time"} />
              <InfoRow label="Segment" value={campaign.segment_name} />
            </Section>

            {/* Content info */}
            <Section title="Email Content">
              {campaign.heading_text && (
                <InfoRow label="Heading" value={campaign.heading_text} />
              )}
              {campaign.body_text && (
                <InfoRow label="Body" value={campaign.body_text} />
              )}
              {campaign.highlights && campaign.highlights.length > 0 && (
                <div>
                  <span className="text-xs text-muted-gray font-medium">Highlights</span>
                  <ul className="mt-1 space-y-0.5">
                    {campaign.highlights.map((h, i) => (
                      <li key={i} className="text-sm text-charcoal">&bull; {h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* Broker info */}
            <Section title="Sending Broker">
              <InfoRow label="Name" value={campaign.broker_name} />
              <InfoRow label="Email" value={campaign.broker_email} />
              {campaign.broker_phone && (
                <InfoRow label="Phone" value={campaign.broker_phone} />
              )}
            </Section>

            {/* AI Reasoning */}
            {campaign.ai_reasoning && (
              <Section title="AI Scheduling Reasoning">
                <p className="text-sm text-medium-gray leading-relaxed">
                  {campaign.ai_reasoning}
                </p>
              </Section>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2">
              {/* Preview button */}
              <button
                onClick={() => setShowPreview(true)}
                className="w-full px-4 py-2.5 bg-[#F0F0F0] text-[#1A1A1A] border border-[#E0E0E0] text-sm font-medium rounded-btn hover:bg-[#E0E0E0] transition-colors"
              >
                Preview Email
              </button>

              {/* Edit button — only for draft/scheduled campaigns */}
              {canEdit(campaign.status) && onEdit && (
                <button
                  onClick={() => setShowEditForm(true)}
                  className="w-full px-4 py-2.5 bg-white border border-border-light text-charcoal text-sm font-medium rounded-btn hover:bg-light-gray transition-colors"
                >
                  Edit Campaign
                </button>
              )}

              {/* Pause / Resume */}
              {canPause(campaign) && (
                <button
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="w-full px-4 py-2.5 bg-yellow-500 text-white text-sm font-medium rounded-btn hover:bg-yellow-600 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? "Pausing..." : "Pause Campaign"}
                </button>
              )}
              {canResume(campaign) && (
                <button
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="w-full px-4 py-2.5 bg-green text-black uppercase tracking-wide text-sm font-medium rounded-btn hover:brightness-110 transition disabled:opacity-50"
                >
                  {actionLoading ? "Resuming..." : "Resume Campaign"}
                </button>
              )}

              {/* Delete */}
              {canEdit(campaign.status) && !showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-4 py-2.5 border border-red-300 text-red-500 text-sm font-medium rounded-btn hover:bg-red-50 transition-colors"
                >
                  Delete Campaign
                </button>
              )}
              {showDeleteConfirm && (
                <div className="bg-red-50 border border-red-200 rounded-btn p-3 space-y-2">
                  <p className="text-sm text-red-700">
                    Delete this campaign? This will also cancel any pending SendGrid send.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-btn hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? "Deleting..." : "Confirm Delete"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-sm text-muted-gray hover:text-charcoal"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email preview modal */}
      {showPreview && (
        <EmailPreview campaign={campaign} onClose={() => setShowPreview(false)} />
      )}

      {/* Edit campaign form modal */}
      {showEditForm && (
        <CampaignForm
          existingCampaign={campaign}
          onSubmit={handleEditSubmit}
          onClose={() => setShowEditForm(false)}
          listings={listings}
        />
      )}
    </>
  );
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
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-muted-gray font-medium shrink-0">{label}</span>
      <span className="text-sm text-charcoal text-right">{value}</span>
    </div>
  );
}
