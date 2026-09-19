/**
 * CRE8 broker roster helpers — same source as the composer Broker step
 * (`EMAIL_SENDERS`). Test sends may only go to these addresses.
 */

import { EMAIL_SENDERS } from "./constants";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCre8BrokerEmail(email: string): boolean {
  const n = normalizeEmail(email);
  return EMAIL_SENDERS.some((s) => normalizeEmail(s.email) === n);
}

/** Flatten `recipientEmails` (array) or a single `recipientEmail` string. */
export function parseTestRecipients(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string" && input.trim()
      ? [input]
      : [];
  const emails = raw
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

export function resolveCre8BrokerEmails(input: unknown): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const email of parseTestRecipients(input)) {
    if (isCre8BrokerEmail(email)) emails.push(email);
    else invalid.push(email);
  }
  return { emails, invalid };
}
