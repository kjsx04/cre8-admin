/**
 * Who counts as the owner. The owner may see every deal; everyone else sees the
 * deals they are a member of, the same rule Flow uses. The database enforces it
 * (see the readonly-role migration); this only decides which token to sign.
 *
 * Add people with ASSISTANT_OWNER_EMAILS (comma-separated).
 */

const BUILT_IN_OWNERS = ["kevin@cre8advisors.com"];

export function ownerEmails(raw = process.env.ASSISTANT_OWNER_EMAILS): string[] {
  const extra = (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...BUILT_IN_OWNERS, ...extra];
}

export function isOwnerEmail(email: string | null | undefined, raw?: string): boolean {
  if (!email) return false;
  return ownerEmails(raw).includes(email.trim().toLowerCase());
}
