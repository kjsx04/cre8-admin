/**
 * Tests for the automation bot's sign-in (src/lib/bot-auth.ts).
 *
 * Run: npx tsx src/lib/bot-auth.test.ts   (or `npm test bot-auth`)
 */

import { generateKeyPair, SignJWT } from "jose";
import {
  BOT_FAILURE_LIMIT,
  BOT_GLOBAL_FAILURE_LIMIT,
  BOT_FAILURE_WINDOW_MS,
  BOT_TOKEN_TTL_SECONDS,
  BotFailureLimiter,
  botMayCall,
  checkBotPassword,
  configuredBotPassword,
  signBotToken,
  verifyBotToken,
} from "./bot-auth";
import { BOT_EMAIL, isBotEmail } from "./bot-identity";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok ", msg);
  } else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

const PASSWORD = "test-only-not-a-real-password-0123456789";
const OTHER = "another-test-only-password-9876543210abc";

async function main() {
  // ── configuration fails closed ──
  assert(configuredBotPassword(undefined) === null, "unset password turns bot sign-in off");
  assert(configuredBotPassword("") === null, "empty password turns bot sign-in off");
  assert(configuredBotPassword("short-password") === null, "a short password turns bot sign-in off");
  assert(configuredBotPassword(PASSWORD) === PASSWORD, "a long password is used");

  // ── password check ──
  assert(await checkBotPassword(PASSWORD, PASSWORD), "the right password is accepted");
  assert(!(await checkBotPassword(PASSWORD + "x", PASSWORD)), "a longer password is refused");
  assert(!(await checkBotPassword(PASSWORD.slice(0, -1), PASSWORD)), "a shorter password is refused");
  assert(!(await checkBotPassword("", PASSWORD)), "an empty password is refused");
  assert(!(await checkBotPassword(undefined, PASSWORD)), "a missing password is refused");
  assert(!(await checkBotPassword({ toString: () => PASSWORD }, PASSWORD)), "a non-string password is refused");
  assert(!(await checkBotPassword(PASSWORD, null)), "nothing is accepted when sign-in is off");

  // ── tokens ──
  const now = Math.floor(Date.now() / 1000);
  const { token, expiresAt } = await signBotToken(PASSWORD, now);
  assert(expiresAt === now + BOT_TOKEN_TTL_SECONDS, "token lifetime is the configured TTL");
  assert((await verifyBotToken(token, PASSWORD)) === BOT_EMAIL, "a fresh bot token verifies as the bot");
  assert((await verifyBotToken(token, null)) === null, "no token verifies when sign-in is off");
  assert((await verifyBotToken(token, OTHER)) === null, "changing the password signs the bot out");
  assert(
    (await verifyBotToken(token, PASSWORD, new Date((expiresAt + 5) * 1000))) === null,
    "an expired bot token is refused",
  );
  const [h, p, s] = token.split(".");
  const flipped = s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA");
  assert((await verifyBotToken(`${h}.${p}.${flipped}`, PASSWORD)) === null, "a tampered signature is refused");
  const otherPayload = Buffer.from(JSON.stringify({ email: "kevin@cre8advisors.com", cre8_bot: true })).toString("base64url");
  assert((await verifyBotToken(`${h}.${otherPayload}.${s}`, PASSWORD)) === null, "a swapped payload is refused");
  assert((await verifyBotToken("not-a-jwt", PASSWORD)) === null, "garbage is refused");

  // A token signed with the right key but claiming someone else is still refused.
  const key = new Uint8Array(32);
  const impostor = await new SignJWT({ email: "kevin@cre8advisors.com", cre8_bot: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(now + 60)
    .sign(key);
  assert((await verifyBotToken(impostor, PASSWORD)) === null, "an HS256 token from another key is refused");

  // An RS256 token (what Microsoft issues) never verifies as the bot.
  const { privateKey } = await generateKeyPair("RS256");
  const rs = await new SignJWT({ email: BOT_EMAIL, cre8_bot: true })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("cre8-admin/bot-login")
    .setAudience("cre8-admin")
    .setSubject("admin-bot")
    .setExpirationTime(now + 60)
    .sign(privateKey);
  assert((await verifyBotToken(rs, PASSWORD)) === null, "an RS256 token is refused");

  // ── what the bot may call ──
  assert(botMayCall("GET", "/api/listings"), "bot may read listings");
  assert(botMayCall("HEAD", "/api/flow/deals"), "bot may HEAD");
  assert(botMayCall("POST", "/api/assistant/chat"), "bot may use the assistant");
  assert(botMayCall("post", "/api/assistant/chat/"), "allowlist ignores case and a trailing slash");
  assert(!botMayCall("POST", "/api/assistant/chat/extra"), "allowlist is exact");
  assert(!botMayCall("POST", "/api/email/send-test"), "bot may not send a test email");
  assert(!botMayCall("POST", "/api/email/campaigns/123/send-now"), "bot may not send a campaign");
  assert(!botMayCall("POST", "/api/listings/publish"), "bot may not publish to the website");
  assert(!botMayCall("PATCH", "/api/listings/abc"), "bot may not edit a listing");
  assert(!botMayCall("DELETE", "/api/flow/deals/abc"), "bot may not delete a deal");
  assert(!botMayCall("PUT", "/api/email/settings"), "bot may not change settings");

  // ── identity ──
  assert(isBotEmail(" Admin-Bot@CRE8advisors.com "), "bot email match ignores case and spaces");
  assert(!isBotEmail("kevin@cre8advisors.com"), "Kevin is not the bot");
  assert(BOT_EMAIL.endsWith("@cre8advisors.com"), "bot passes the assistant's staff-domain check");

  // ── lockout ──
  const limiter = new BotFailureLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < BOT_FAILURE_LIMIT; i++) {
    assert(!limiter.isLocked("1.1.1.1", t0 + i), `attempt ${i + 1} from one IP is allowed`);
    limiter.recordFailure("1.1.1.1", t0 + i);
  }
  assert(limiter.isLocked("1.1.1.1", t0 + 100), "that IP is locked after the limit");
  assert(!limiter.isLocked("2.2.2.2", t0 + 100), "another IP is not locked");
  assert(!limiter.isLocked("1.1.1.1", t0 + BOT_FAILURE_WINDOW_MS + 10), "the lock lifts after the window");

  const spread = new BotFailureLimiter();
  for (let i = 0; i < BOT_GLOBAL_FAILURE_LIMIT; i++) spread.recordFailure(`10.0.0.${i}`, t0);
  assert(spread.isLocked("10.0.1.1", t0 + 1), "failures spread across many IPs lock everyone");

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
