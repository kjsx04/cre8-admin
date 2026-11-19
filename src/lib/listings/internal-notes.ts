/**
 * Internal-only listing notes — shared definitions.
 *
 * These notes live in the Supabase table `listing_internal_notes` and are
 * NEVER sent to Webflow or the public site. They are only readable through
 * /api/listings/internal/[listingId], which requires a signed-in user.
 *
 * To add another internal box: add it to INTERNAL_NOTE_FIELDS below AND add a
 * matching text column to the `listing_internal_notes` table. The API and the
 * Internal section on the listing page both read from this list.
 */

export interface InternalNoteFieldDef {
  /** Column name in the listing_internal_notes table */
  key: "asking_price" | "zoning_uses" | "other";
  /** Label shown above the box */
  label: string;
}

export const INTERNAL_NOTE_FIELDS: InternalNoteFieldDef[] = [
  {
    key: "asking_price",
    // Column is still named asking_price — only the label changed
    label: "Price Guidance",
  },
  {
    key: "zoning_uses",
    label: "Zoning and Allowed Uses",
  },
  {
    key: "other",
    // Column is still named other — only the label changed
    label: "Notes",
  },
];

/** The three note boxes, as rich text HTML ("" when empty) */
export type InternalNoteValues = Record<InternalNoteFieldDef["key"], string>;

/** All boxes blank */
export const EMPTY_INTERNAL_NOTES: InternalNoteValues = {
  asking_price: "",
  zoning_uses: "",
  other: "",
};

/** Upper limit per box (characters of HTML) — far more than a note needs */
export const INTERNAL_NOTE_MAX_LENGTH = 20000;
