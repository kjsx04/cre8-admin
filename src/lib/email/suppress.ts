/**
 * Applying the bounce policy — the side-effecting half of `bounce-policy.ts`.
 *
 * Called from the Resend webhook on every delivery, bounce and complaint. It
 * must never throw: a failure here should cost us a suppression, not the whole
 * event record, so everything is wrapped and logged.
 *
 * Recipient addresses are used in memory and never written down. The health
 * table is keyed by a hash; the address itself only travels as far as the
 * Resend call that suppresses it.
 */

import { supabase } from "@/lib/flow/supabase";
import { markContactUnsubscribed } from "./provider";
import {
  hashEmail,
  classifyBounce,
  healthAfterBounce,
  healthAfterDelivery,
  alreadySuppressed,
  type ContactHealth,
} from "./bounce-policy";

const TABLE = "email_contact_health";

async function readHealth(hash: string): Promise<ContactHealth | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("soft_streak, suppressed_at")
    .eq("email_hash", hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { soft_streak: data.soft_streak ?? 0, suppressed_at: data.suppressed_at ?? null } : null;
}

/**
 * Record what this event says about an address and suppress it if the policy
 * says so. Returns what happened, for logging and tests.
 */
export async function applyDeliveryEvent(
  eventType: string,
  recipient: string | null | undefined,
  payload: unknown,
  occurredAt: string
): Promise<{ action: "none" | "reset" | "strike" | "suppressed"; reason?: string }> {
  const email = (recipient || "").trim().toLowerCase();
  if (!email) return { action: "none" };

  const kind = classifyBounce(eventType, payload);
  const isDelivery = eventType === "email.delivered";
  if (kind === "none" && !isDelivery) return { action: "none" };

  const hash = hashEmail(email);

  try {
    const current = await readHealth(hash);

    // Already retired — nothing to do, and don't overwrite the original reason
    if (alreadySuppressed(current) && !isDelivery) return { action: "none" };

    const next = isDelivery ? healthAfterDelivery() : healthAfterBounce(current, kind);

    // Suppress in Resend BEFORE recording it, so a failed API call doesn't leave
    // the row claiming an address is retired while Resend still mails it.
    if (next.suppress) {
      await markContactUnsubscribed(email);
    }

    const row: Record<string, unknown> = {
      email_hash: hash,
      soft_streak: next.soft_streak,
      last_bounce_kind: next.last_bounce_kind,
      updated_at: new Date().toISOString(),
    };
    if (isDelivery) row.last_delivered_at = occurredAt;
    if (kind === "soft") row.last_soft_bounce_at = occurredAt;
    if (next.suppress) {
      row.suppressed_at = occurredAt;
      row.suppress_reason = next.suppress_reason;
    }

    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "email_hash" });
    if (error) throw new Error(error.message);

    // Keep the local mirror honest so audience counts drop straight away
    if (next.suppress) {
      await supabase.from("email_contacts").update({ unsubscribed: true }).eq("email", email);
    }

    if (next.suppress) return { action: "suppressed", reason: next.suppress_reason || undefined };
    if (isDelivery) return { action: "reset" };
    return { action: "strike", reason: `soft bounce ${next.soft_streak} of 3` };
  } catch (err) {
    // Never fail the webhook over this
    console.error("[suppress] could not apply delivery event:", err);
    return { action: "none" };
  }
}
