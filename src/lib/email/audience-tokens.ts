/**
 * Audience tokens stored on a campaign's segment_id.
 *
 * The column is still a single text field (no schema change). We pack the
 * chosen Resend segment UUIDs and any extra recipient emails into it:
 *   "5c3d…9b36,f7fd…3e9f,kevin@cre8advisors.com"
 *
 * Legacy values "all" / "test" (from the old hardcoded picker) are preserved
 * so existing rows still parse; the provider maps them at send time.
 */

export const RESEND_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type AudienceTokens = {
  segmentIds: string[];
  extraEmails: string[];
  legacy: string[]; // "all" | "test" | anything else we didn't recognize
};

/** Split a stored segment_id into live Resend ids, extra emails, and leftovers. */
export function parseAudienceTokens(raw: unknown): AudienceTokens {
  const text = typeof raw === "string" ? raw : "";
  const tokens = text
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const segmentIds: string[] = [];
  const extraEmails: string[] = [];
  const legacy: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const emailToken = token.toLowerCase().startsWith("email:") ? token.slice(6) : token;
    const key = emailToken.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (RESEND_UUID_RE.test(token)) {
      segmentIds.push(token);
    } else if (EMAIL_RE.test(emailToken)) {
      extraEmails.push(emailToken.toLowerCase());
    } else {
      legacy.push(token.toLowerCase());
    }
  }

  return { segmentIds, extraEmails, legacy };
}

/** Pack selected lists + extra emails back into the segment_id column. */
export function serializeAudienceTokens(segmentIds: string[], extraEmails: string[] = []): string {
  const ids = segmentIds.filter((id) => RESEND_UUID_RE.test(id));
  const emails = extraEmails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));
  const packed: string[] = [];
  for (const token of ids.concat(emails)) {
    if (!packed.includes(token)) packed.push(token);
  }
  return packed.join(",");
}

/** Split a stored provider_send_id that may hold several Resend ids. */
export function splitProviderIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
