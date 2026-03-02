/**
 * Email Campaign System — Shared Utilities
 *
 * Priority calculation, color helpers, and date formatting.
 */

import { Campaign, PriorityLevel, CalendarEvent } from "./types";
import { TYPE_COLORS, RECURRING_COLOR } from "./constants";

/**
 * Auto-derive campaign priority from label + listing age.
 * 1 = Just Listed (highest), 2 = Just Sold, 3 = Featured, 4 = New (<60 days), 5 = Standard
 */
export function calculatePriority(
  label: string,
  listingCreatedAt?: string
): PriorityLevel {
  if (label === "Just Listed") return 1;
  if (label === "Just Sold") return 2;

  // Check listing age if we have a creation date
  if (listingCreatedAt) {
    const created = new Date(listingCreatedAt);
    const daysSince = Math.floor(
      (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince < 60) return 4; // "New" listing
  }

  return 5; // Standard
}

/** Get the display color for a campaign label */
export function getTypeColor(label: string): string {
  return TYPE_COLORS[label] || RECURRING_COLOR;
}

/** Human-readable priority label */
export function getPriorityLabel(priority: PriorityLevel): string {
  switch (priority) {
    case 1: return "Just Listed";
    case 2: return "Just Sold";
    case 3: return "Featured";
    case 4: return "New";
    case 5: return "Standard";
  }
}

/** Convert a Campaign to a FullCalendar event object */
export function campaignToEvent(campaign: Campaign): CalendarEvent | null {
  // Use scheduled_date for one-time, next_send_date for recurring
  const dateStr = campaign.campaign_type === "recurring"
    ? (campaign.next_send_date || campaign.scheduled_date)
    : campaign.scheduled_date;

  if (!dateStr) return null;

  const color = getTypeColor(campaign.email_label);
  const priority = calculatePriority(campaign.email_label);

  return {
    id: campaign.id,
    title: `${campaign.email_label}: ${campaign.listing_name}`,
    start: dateStr,
    backgroundColor: color,
    borderColor: color,
    // Recurring campaigns get a distinct CSS class for striped pattern
    classNames: campaign.campaign_type === "recurring" ? ["recurring-event"] : [],
    extendedProps: {
      campaign,
      priority,
    },
  };
}

/** Format a date string for display (e.g., "Mar 2, 2026 at 8:30 AM") */
export function formatScheduleDate(isoStr: string | null): string {
  if (!isoStr) return "\u2014";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " at " + d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Phoenix",
  });
}

/** Format just the date part (e.g., "Mar 2, 2026") */
export function formatDateShort(isoStr: string | null): string {
  if (!isoStr) return "\u2014";
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Check if a campaign can be edited (only draft/scheduled) */
export function canEdit(status: string): boolean {
  return status === "draft" || status === "scheduled";
}

/** Check if a campaign can be paused (only active recurring) */
export function canPause(campaign: Campaign): boolean {
  return campaign.campaign_type === "recurring" && campaign.status === "active";
}

/** Check if a campaign can be resumed (only paused recurring) */
export function canResume(campaign: Campaign): boolean {
  return campaign.campaign_type === "recurring" && campaign.status === "paused";
}
