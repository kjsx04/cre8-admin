/**
 * When to stop mailing an address.
 *
 * The first real send to the broker list bounced 17%: 112 addresses were dead
 * and 53 failed temporarily. Resend does NOT suppress bounced contacts on its
 * own — every one of those 112 was still marked subscribed afterwards and would
 * have gone out again. A second send at that rate starts pushing CRE8 mail into
 * spam folders, so suppression has to be automatic.
 *
 * The rules, and why:
 *   Hard bounce      → suppress at once. "User unknown" does not get better.
 *   Spam complaint   → suppress at once. Worse for reputation than a bounce.
 *   Soft bounce      → count it. A busy server, a greylisted new sender or a
 *                      full mailbox all clear on their own; 24 of the 53 soft
 *                      bounces on that send were delivered anyway. Retiring on
 *                      one failure would have cost ~29 real brokers.
 *   Third soft bounce in a row → retire. At that point it isn't temporary.
 *   Any delivery     → reset the streak to zero.
 *
 * Everything here is pure so the policy can be tested without Resend or Supabase.
 */

import { createHash } from "crypto";

/** Consecutive soft bounces tolerated before an address is retired. */
export const SOFT_BOUNCE_LIMIT = 3;

export type BounceKind = "hard" | "soft" | "complaint" | "none";

export type ContactHealth = {
  soft_streak: number;
  suppressed_at: string | null;
};

export type HealthUpdate = {
  soft_streak: number;
  last_bounce_kind: BounceKind | null;
  /** Set when this event is the one that retires the address */
  suppress: boolean;
  suppress_reason: string | null;
};

/**
 * Addresses are never stored, here or in email_events — the webhook strips
 * them deliberately. A hash still lets us count failures per person.
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Read Resend's bounce classification out of a webhook payload.
 *
 * Resend passes through Amazon SES's wording: `Permanent` is a dead address,
 * `Transient` is a temporary failure, `Undetermined` means the provider didn't
 * say. Undetermined is treated as soft, so an ambiguous failure costs a strike
 * rather than the contact.
 */
export function classifyBounce(eventType: string, payload: unknown): BounceKind {
  if (eventType === "email.complained") return "complaint";
  if (eventType !== "email.bounced") return "none";

  const bounce = (payload as { bounce?: { type?: string } } | null)?.bounce;
  const type = (bounce?.type || "").toLowerCase();
  if (type === "permanent") return "hard";
  if (type === "transient" || type === "undetermined") return "soft";
  // No classification at all — assume temporary rather than delete a contact
  return "soft";
}

/** What a delivery event does: clears the slate. */
export function healthAfterDelivery(): HealthUpdate {
  return { soft_streak: 0, last_bounce_kind: null, suppress: false, suppress_reason: null };
}

/**
 * What a bounce or complaint does to a contact's record.
 * `current` is null the first time we ever hear about an address.
 */
export function healthAfterBounce(
  current: ContactHealth | null,
  kind: BounceKind
): HealthUpdate {
  if (kind === "hard") {
    return {
      soft_streak: current?.soft_streak ?? 0,
      last_bounce_kind: "hard",
      suppress: true,
      suppress_reason: "Hard bounce — the address does not exist",
    };
  }

  if (kind === "complaint") {
    return {
      soft_streak: current?.soft_streak ?? 0,
      last_bounce_kind: "complaint",
      suppress: true,
      suppress_reason: "Marked the email as spam",
    };
  }

  if (kind === "soft") {
    const streak = (current?.soft_streak ?? 0) + 1;
    const retire = streak >= SOFT_BOUNCE_LIMIT;
    return {
      soft_streak: streak,
      last_bounce_kind: "soft",
      suppress: retire,
      suppress_reason: retire
        ? `${streak} soft bounces in a row — the address has stopped accepting mail`
        : null,
    };
  }

  return { soft_streak: current?.soft_streak ?? 0, last_bounce_kind: null, suppress: false, suppress_reason: null };
}

/**
 * An address already suppressed is left alone — no repeat Resend calls, and the
 * original reason is preserved rather than overwritten by a later event.
 */
export function alreadySuppressed(current: ContactHealth | null): boolean {
  return !!current?.suppressed_at;
}
