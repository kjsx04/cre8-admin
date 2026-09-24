/**
 * Run: npx tsx src/lib/email/bounce-policy.test.ts
 *
 * The first broker send bounced 17%. 112 addresses were dead and Resend left
 * every one of them subscribed. These cover the rules that stop that repeating,
 * and just as importantly the rule that keeps a temporary failure from costing
 * a real contact.
 */

import {
  hashEmail,
  classifyBounce,
  healthAfterBounce,
  healthAfterDelivery,
  alreadySuppressed,
  SOFT_BOUNCE_LIMIT,
  type ContactHealth,
} from "./bounce-policy";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok ", msg);
  }
}

const hard = { bounce: { type: "Permanent", subType: "General" } };
const soft = { bounce: { type: "Transient", subType: "General" } };
const full = { bounce: { type: "Transient", subType: "MailboxFull" } };
const vague = { bounce: { type: "Undetermined" } };

// ── Reading Resend's classification ──
assert(classifyBounce("email.bounced", hard) === "hard", "Permanent is a hard bounce");
assert(classifyBounce("email.bounced", soft) === "soft", "Transient is a soft bounce");
assert(classifyBounce("email.bounced", full) === "soft", "a full mailbox is a soft bounce");
assert(classifyBounce("email.bounced", vague) === "soft", "an undetermined bounce is treated as soft, never deleted");
assert(classifyBounce("email.bounced", {}) === "soft", "a bounce with no classification is treated as soft");
assert(classifyBounce("email.complained", {}) === "complaint", "a spam complaint is its own thing");
assert(classifyBounce("email.delivered", {}) === "none", "a delivery is not a bounce");
assert(classifyBounce("email.opened", {}) === "none", "an open is not a bounce");
assert(classifyBounce("email.bounced", { bounce: { type: "PERMANENT" } }) === "hard", "classification is case-insensitive");

// ── Hard bounce: gone on the first strike ──
const h = healthAfterBounce(null, "hard");
assert(h.suppress, "a hard bounce suppresses immediately");
assert(!!h.suppress_reason && h.suppress_reason.includes("does not exist"), "the reason says why");

// ── Complaint: worse than a bounce ──
const c = healthAfterBounce(null, "complaint");
assert(c.suppress, "a spam complaint suppresses immediately");
assert(!!c.suppress_reason && c.suppress_reason.includes("spam"), "the reason names the complaint");

// ── Soft bounce: three strikes ──
let state: ContactHealth = { soft_streak: 0, suppressed_at: null };
const first = healthAfterBounce(state, "soft");
assert(first.soft_streak === 1 && !first.suppress, "one soft bounce is a strike, not a removal");

state = { soft_streak: first.soft_streak, suppressed_at: null };
const second = healthAfterBounce(state, "soft");
assert(second.soft_streak === 2 && !second.suppress, "two soft bounces still keep the contact");

state = { soft_streak: second.soft_streak, suppressed_at: null };
const third = healthAfterBounce(state, "soft");
assert(third.soft_streak === 3 && third.suppress, "the third soft bounce in a row retires the address");
assert(third.soft_streak === SOFT_BOUNCE_LIMIT, "the limit is what the policy says it is");
assert(!!third.suppress_reason && third.suppress_reason.includes("3"), "the reason counts the failures");

// ── A delivery wipes the slate ──
// This is the rule that protects the 24 addresses that soft-bounced on the
// broker send and were delivered to anyway.
const recovered = healthAfterDelivery();
assert(recovered.soft_streak === 0, "a delivery resets the streak");
assert(!recovered.suppress, "a delivery never suppresses");

const afterRecovery = healthAfterBounce({ soft_streak: 0, suppressed_at: null }, "soft");
assert(afterRecovery.soft_streak === 1 && !afterRecovery.suppress, "a contact that recovered starts counting again from one");

// Two soft bounces, a delivery, then two more must NOT retire the address
let streak = 0;
streak = healthAfterBounce({ soft_streak: streak, suppressed_at: null }, "soft").soft_streak;
streak = healthAfterBounce({ soft_streak: streak, suppressed_at: null }, "soft").soft_streak;
streak = healthAfterDelivery().soft_streak;
const afterMix = healthAfterBounce({ soft_streak: streak, suppressed_at: null }, "soft");
const afterMix2 = healthAfterBounce({ soft_streak: afterMix.soft_streak, suppressed_at: null }, "soft");
assert(!afterMix2.suppress, "failures must be consecutive — a delivery in the middle saves the contact");

// ── Already suppressed ──
assert(alreadySuppressed({ soft_streak: 0, suppressed_at: "2026-09-23T00:00:00Z" }), "a suppressed contact is recognised");
assert(!alreadySuppressed({ soft_streak: 2, suppressed_at: null }), "a struggling contact is not suppressed");
assert(!alreadySuppressed(null), "an unknown contact is not suppressed");

// ── Hashing: count per person without storing addresses ──
const a = hashEmail("John.Reva@AM.JLL.com");
assert(a === hashEmail("john.reva@am.jll.com"), "case and spacing don't create a second identity");
assert(a === hashEmail("  john.reva@am.jll.com  "), "surrounding whitespace is ignored");
assert(a !== hashEmail("jane.reva@am.jll.com"), "different people hash differently");
assert(!a.includes("@") && a.length === 64, "the stored key reveals no address");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall bounce-policy tests passed");
