/**
 * New Listing Checklist — Item Definitions
 *
 * The single source of truth for the 8 checklist items shown on
 * new listings. To add/rename/reorder items, edit this array —
 * the UI, API validation, and progress counts all read from it.
 *
 * NOTE: If you ADD a key here, also update the `items` jsonb default
 * on the Supabase `listing_checklists` table so new rows include it.
 */

export interface ChecklistItemDef {
  /** Stable key stored in the Supabase items jsonb */
  key: string;
  /** Display label */
  label: string;
  /** Auto-checked by the app (true) vs manually checked by a user (false) */
  auto: boolean;
  /** Small hint shown next to auto items explaining what checks them */
  autoHint?: string;
}

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    key: "la_sent",
    label: "Listing agreement — sent to client",
    auto: false,
  },
  {
    key: "la_executed",
    label: "Listing agreement — fully executed",
    auto: true,
    autoHint: "Checks when the executed PDF is uploaded",
  },
  {
    key: "flyer",
    label: "Marketing flyer",
    auto: true,
    autoHint: "Checks when the marketing package is added",
  },
  {
    key: "crexi",
    label: "Upload to Crexi",
    auto: false,
  },
  {
    key: "loopnet",
    label: "Upload to LoopNet",
    auto: false,
  },
  {
    key: "costar",
    label: "Upload to CoStar",
    auto: false,
  },
  {
    key: "email_blast",
    label: "Set up Email blast",
    auto: false,
  },
  {
    key: "published",
    label: "Published to Website",
    auto: true,
    autoHint: "Checks when the publish flow completes",
  },
];

/** All item keys — used for API validation */
export const CHECKLIST_KEYS = CHECKLIST_ITEMS.map((i) => i.key);

/** A fresh all-unchecked items object */
export const EMPTY_ITEMS: Record<string, boolean> = Object.fromEntries(
  CHECKLIST_ITEMS.map((i) => [i.key, false])
);
