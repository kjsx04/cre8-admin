/**
 * Escape a value so Postgres LIKE / ILIKE treats it as a literal string.
 *
 * WHY THIS EXISTS
 * Four routes looked a broker up with `.ilike("email", email)`, where `email`
 * came straight from a request header. `%` is an ILIKE wildcard, so
 * `x-user-email: %` matched EVERY broker — and on
 * /api/flow/broker/defaults that was a PATCH, so one request rewrote every
 * broker's default commission rate and splits. (The `.single()` call then
 * returned a 500, but the write had already landed.)
 *
 * `.eq()` would be the obvious fix, except broker emails are stored with
 * inconsistent capitalisation in the `brokers` table — `Andy@CRE8Advisors.com`
 * next to `Chad@cre8advisors.com` — so an exact match would find nobody and
 * every deal board would come back empty. The lookup genuinely has to be
 * case-insensitive, so the value has to be escaped instead.
 *
 * `_` is escaped too: it matches any single character, so an unescaped
 * `a_b@x.com` would also match `axb@x.com`.
 *
 * Postgres LIKE uses backslash as its default escape character, so the
 * backslash itself has to be doubled first.
 */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\") // must come first, or it would escape our own escapes
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
