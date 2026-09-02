/**
 * New Listing Checklist — Type Definitions
 *
 * Matches the Supabase `listing_checklists` table.
 */

import { CHECKLIST_ITEMS } from "./constants";

/** Checked/unchecked state per item key (e.g. { la_sent: true, ... }) */
export type ChecklistItems = Record<string, boolean>;

/** One row of the Supabase listing_checklists table */
export interface ListingChecklist {
  id: string;
  /** Webflow CMS item id — no FK, listings live in Webflow */
  listing_id: string;
  /** Denormalized listing name (same pattern as email_campaigns) */
  listing_name: string | null;
  /** True while the listing sits in the "New Listings" section */
  is_new: boolean;
  items: ChecklistItems;
  /** SharePoint URL of the executed listing agreement PDF */
  listing_agreement_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Count how many checklist items are checked */
export function countChecked(items: ChecklistItems): number {
  return CHECKLIST_ITEMS.filter((i) => items[i.key] === true).length;
}
