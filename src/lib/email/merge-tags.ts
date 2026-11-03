/**
 * Merge tags — "Hi {{{contact.first_name|there}}}," in a marketing email.
 *
 * Resend substitutes these per recipient when it sends a BROADCAST. The syntax
 * is from the current Broadcasts editor docs:
 *
 *   {{{contact.first_name|fallback}}}
 *   {{{contact.last_name|fallback}}}
 *   {{{contact.email}}}
 *
 * (An older Resend blog post shows a {{{FIRST_NAME}}} form alongside the
 * retired `audience_id`. We use `segment_id`, the current naming, so we follow
 * the current docs and the Broadcast API reference, which both use `contact.*`.)
 *
 * The catch, and the reason this file exists: merge tags ONLY work on
 * broadcasts. Any send that goes out through the transactional POST /emails
 * endpoint — a test send, or a hand-typed extra recipient on a campaign —
 * would show the reader the raw `{{{contact.first_name|there}}}` text. So
 * `resolveMergeTags` fills them in ourselves on that path, and
 * `previewMergeTags` fills them in for the composer preview.
 */

/** One insertable tag, as offered by the + button next to Body. */
export interface MergeTag {
  /** Menu label */
  label: string;
  /** What gets typed into the body */
  token: string;
  /** The one-liner under the label */
  hint: string;
}

/**
 * The tags on the + menu, in order.
 *
 * None of them carry a |fallback word. A contact with no first name on file
 * (about 130 of ~5,180) has the name dropped rather than replaced with
 * something like "there" — "Hi," reads better than "Hi there," from someone
 * who should know your name.
 */
export const MERGE_TAGS: MergeTag[] = [
  { label: "First name", token: "{{{contact.first_name}}}", hint: "Left out when there isn't one" },
  { label: "Last name", token: "{{{contact.last_name}}}", hint: "Left out when there isn't one" },
  { label: "Email address", token: "{{{contact.email}}}", hint: "Always present" },
];

/**
 * Matches one tag and splits out its property and fallback.
 *   {{{contact.first_name|there}}} → ["contact.first_name", "there"]
 *   {{{contact.email}}}            → ["contact.email", undefined]
 * Deliberately narrow: only `contact.<key>`, so the unsubscribe tag
 * ({{{RESEND_UNSUBSCRIBE_URL}}}) is left for Resend to handle.
 */
const TAG_RE = /(\s*)\{\{\{contact\.([a-z_]+)(?:\|([^}]*))?\}\}\}/gi;

/** Does this copy contain any contact merge tag? */
export function hasMergeTags(text: string): boolean {
  return new RegExp(TAG_RE.source, "i").test(text || "");
}

/**
 * The space before a tag belongs to the tag.
 *
 * "Hi {{{contact.first_name}}}," has to read "Hi," and not "Hi ," when there's
 * no name, so an empty value takes the whitespace in front of it with it. The
 * regex captures that whitespace for exactly this reason.
 *
 * NOTE: this only applies where WE do the substituting — test sends, hand-typed
 * recipients, and the previews. On a real broadcast Resend substitutes on its
 * own servers and leaves the space behind, so those contacts read "Hi ,".
 * Nothing we can do about that from here; see docs/custom-emails.md.
 */

/** The contact fields a merge tag can read. */
export interface MergeContact {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

/**
 * Fill in the tags for one real person.
 *
 * Used on the transactional path (test sends, hand-typed recipients), where
 * Resend does no substitution of its own. A field we don't have falls back to
 * the tag's own `|fallback`, then to an empty string — never to raw braces.
 */
export function resolveMergeTags(text: string, contact: MergeContact | null): string {
  if (!text) return text;
  return text.replace(TAG_RE, (_full, space: string, prop: string, fallback: string | undefined) => {
    const key = prop.toLowerCase();
    const value =
      key === "first_name"
        ? contact?.first_name
        : key === "last_name"
          ? contact?.last_name
          : key === "email"
            ? contact?.email
            : null;
    const clean = (value || "").trim();
    if (clean) return `${space}${clean}`;

    const fb = (fallback ?? "").trim();
    if (fb) return `${space}${fb}`;

    // Nothing to show: the name goes, and so does the space in front of it,
    // so "Hi {{{contact.first_name}}}," reads "Hi," and not "Hi ,".
    return "";
  });
}

/**
 * What the email tag shows in a preview. Every contact has an email, so
 * previewing it as blank would look broken — but it mustn't look like real
 * data either, hence the obvious placeholder.
 */
export const SAMPLE_EMAIL = "their@email.com";

/**
 * Fill in the tags for the composer preview and the preview endpoint.
 *
 * Names show their fallback, because that is a real rendering — the one a
 * contact with nothing on file gets, and the case most likely to look wrong.
 * Everyone else sees their own name; a test send to yourself shows that
 * properly, since the transactional path resolves against the real record.
 */
export function previewMergeTags(text: string): string {
  return resolveMergeTags(text, { email: SAMPLE_EMAIL });
}
