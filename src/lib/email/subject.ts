/**
 * The two lines an inbox actually shows before anyone opens anything:
 * the subject, and the grey preview line under it.
 *
 * These used to be derived from the same two fields, so they said the same
 * thing. The Blossom Rock send went out as:
 *
 *   Subject:  Retail pads available in the heart of superstition vistas: Marketplace at Blossom Rock
 *   Preview:  Retail pads available in the heart of superstition vistas: Just Listed
 *
 * On a phone, where both are truncated around 35 to 45 characters, that reads as
 * the same sentence printed twice and wastes the only two lines you get.
 *
 * Now both can be typed directly, and the fallbacks are built so they can never
 * collide: the preview falls back to the opening of the body copy, which is real
 * information about the property rather than a restatement of the heading.
 */

/** Past this, most desktop clients stop showing the subject. */
export const SUBJECT_COMFORTABLE = 60;
/** Roughly where a phone lock screen cuts a subject off. */
export const SUBJECT_PHONE = 35;
/** Preview text longer than this is cut everywhere; shorter than ~40 wastes the line. */
export const PREVIEW_COMFORTABLE = 90;

type CampaignLike = {
  campaign_kind?: string | null;
  email_subject?: string | null;
  preview_text?: string | null;
  email_label?: string | null;
  listing_name?: string | null;
  heading_text?: string | null;
  body_text?: string | null;
  intro_text?: string | null;
};

/** Collapse whitespace and strip any HTML that came from the rich-text body. */
function plain(text: string | null | undefined): string {
  return (text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The subject line.
 * A typed subject always wins — it is never rebuilt from the listing.
 */
export function buildSubjectLine(campaign: CampaignLike): string {
  const typed = plain(campaign.email_subject);
  if (typed) return typed;

  if (campaign.campaign_kind === "group") {
    return plain(campaign.email_label) || plain(campaign.listing_name) || "Featured Listings";
  }
  return `${plain(campaign.email_label) || "Just Listed"}: ${plain(campaign.listing_name) || "Property"}`;
}

/**
 * The opening of a piece of copy, used as the preview fallback.
 *
 * Copy that already fits is used whole — the preview line is short and every
 * word in it is doing work, so there is no reason to cut a sentence early.
 * Longer copy is cut at a sentence end if one falls near the limit, otherwise
 * at a word boundary, so the line never ends mid-word.
 */
export function openingLine(text: string, max = PREVIEW_COMFORTABLE): string {
  const clean = plain(text);
  if (!clean) return "";
  if (clean.length <= max) return clean;

  const stop = clean.slice(0, max + 1).search(/[.!?](\s|$)/);
  if (stop > 20) return clean.slice(0, stop + 1);

  const cut = clean.lastIndexOf(" ", max);
  return `${clean.slice(0, cut > 20 ? cut : max).trimEnd()}…`;
}

/**
 * The preview line.
 *
 * Typed text wins. Otherwise the body copy opens the email, which tells the
 * reader something the subject did not. The heading is a last resort and is
 * skipped when it would only echo the subject.
 */
export function buildPreviewText(campaign: CampaignLike): string {
  const typed = plain(campaign.preview_text);
  if (typed) return typed;

  const body = openingLine(campaign.body_text || campaign.intro_text || "");
  if (body) return body;

  const subject = buildSubjectLine(campaign).toLowerCase();
  const heading = plain(campaign.heading_text);
  // Never repeat what the subject already said
  if (heading && !subject.includes(heading.toLowerCase())) return heading;

  const listing = plain(campaign.listing_name);
  if (listing && !subject.includes(listing.toLowerCase())) return listing;

  return "";
}

/** Warn when the subject and preview would show the reader the same words twice. */
export function previewEchoesSubject(subject: string, preview: string): boolean {
  const s = plain(subject).toLowerCase();
  const p = plain(preview).toLowerCase();
  if (!s || !p) return false;
  if (s === p) return true;
  // What a phone actually shows of each
  const head = (t: string) => t.slice(0, SUBJECT_PHONE).trim();
  return head(s).length > 12 && head(s) === head(p);
}
