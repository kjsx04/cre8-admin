/**
 * Email Campaign System — Shared Utilities
 *
 * Priority calculation, color helpers, and date formatting.
 */

import { Campaign, PriorityLevel, CalendarEvent } from "./types";
import { TYPE_COLORS, RECURRING_COLOR } from "./constants";
import type { ListingFieldData } from "@/lib/admin-constants";

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

/**
 * Build the default highlight rows from a listing's CMS fields.
 * Used when a listing is first picked in the campaign form, and by the
 * listing → campaign sync to know which rows are "auto" rows.
 */
export function buildAutoHighlights(fd: Partial<ListingFieldData>): string[] {
  const rows: string[] = [];
  if (fd["list-price"]) rows.push(`Price: ${fd["list-price"]}`);
  if (fd["square-feet"]) rows.push(`Acreage: ${fd["square-feet"]} Acres`);
  if (fd.zoning) rows.push(`Zoning: ${fd.zoning}`);
  if (fd["city-county"]) rows.push(`Location: ${fd["city-county"]}`);
  return rows;
}

/**
 * Refresh listing-derived highlight rows with new listing data, in place.
 * Rows are matched by their title ("Price:", "Acreage:", "Zoning:", etc.)
 * so custom rows and the user's ordering are preserved. A row is only
 * rewritten when the matching listing field is present in `fd`.
 */
export function refreshHighlights(
  highlights: string[],
  fd: Partial<ListingFieldData>
): string[] {
  return highlights.map((h) => {
    const t = h.trim();
    if (/^Price:/i.test(t) && fd["list-price"]) return `Price: ${fd["list-price"]}`;
    if ((/^Acreage:/i.test(t) || /^[\d.,]+\s*Acres$/i.test(t)) && fd["square-feet"]) return `Acreage: ${fd["square-feet"]} Acres`;
    if ((/^Building SF:/i.test(t) || /SF Building$/i.test(t)) && fd["building-sqft"]) return `Building SF: ${Number(fd["building-sqft"]).toLocaleString()} SF`;
    if (/^Zoning:/i.test(t) && fd.zoning) return `Zoning: ${fd.zoning}`;
    if (/^Location:/i.test(t) && fd["city-county"]) return `Location: ${fd["city-county"]}`;
    if (/^Cross Streets:/i.test(t) && fd["cross-streets"]) return `Cross Streets: ${fd["cross-streets"]}`;
    if (/^Traffic Count:/i.test(t) && fd["traffic-count"]) return `Traffic Count: ${fd["traffic-count"]}`;
    return h;
  });
}

/** Convert a Campaign to a FullCalendar event object */
export function campaignToEvent(campaign: Campaign): CalendarEvent | null {
  // scheduled_date is the pending send for both one-time and recurring
  // (recurring keeps next_send_date == scheduled_date; fall back just in case)
  const dateStr = campaign.scheduled_date || campaign.next_send_date;

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

/** Check if a campaign can be edited (draft, scheduled, or active) */
export function canEdit(status: string): boolean {
  return status === "draft" || status === "scheduled" || status === "active";
}

/** Check if a campaign can be paused (only active recurring) */
export function canPause(campaign: Campaign): boolean {
  return campaign.campaign_type === "recurring" && campaign.status === "active";
}

/** Check if a campaign can be resumed (only paused recurring) */
export function canResume(campaign: Campaign): boolean {
  return campaign.campaign_type === "recurring" && campaign.status === "paused";
}
