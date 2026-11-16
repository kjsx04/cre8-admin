/**
 * Tests for verifyIdToken — the check that stands between the public internet
 * and every API route in this app.
 *
 * Run: npx tsx src/lib/verify-id-token.test.ts   (or `npm test verify-id-token`)
 *
 * These use a locally generated RS256 key pair and a local JWKS, so no network
 * access and no real Azure token is involved. What they verify is the *policy*:
 * that a correctly formed token is accepted, and that each individual thing an
 * attacker would tamper with is rejected.
 *
 * The one thing a local key pair cannot check is that ISSUER and the JWKS URL
 * match the real tenant. Those were verified directly against
 * https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration
 * and both matched exactly.
 */

import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWK } from "jose";
import { verifyIdToken, CLIENT_ID, TENANT_ID, ISSUER } from "./verify-id-token";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok ", msg);
  } else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

/** Assert that a promise rejects — i.e. the token was refused. */
async function assertRejects(p: Promise<unknown>, msg: string) {
  try {
    await p;
    failed += 1;
    console.error("FAIL:", msg, "(it was ACCEPTED — this is a security hole)");
  } catch {
    console.log("ok ", msg);
  }
}

async function main() {
  // The "Azure" signing key for these tests, plus an unrelated key that stands
  // in for an attacker signing their own tokens.
  const good = await generateKeyPair("RS256");
  const attacker = await generateKeyPair("RS256");

  const goodJwk = (await exportJWK(good.publicKey)) as JWK;
  goodJwk.kid = "test-key-1";
  goodJwk.alg = "RS256";
  const jwks = createLocalJWKSet({ keys: [goodJwk] });

  /** Mint a token, valid by default, with any claim overridden. */
  function mint(
    claims: Record<string, unknown> = {},
    opts: { key?: CryptoKey; expired?: boolean; notYetValid?: boolean } = {}
  ) {
    const jwt = new SignJWT({
      preferred_username: "kevin@cre8advisors.com",
      tid: TENANT_ID,
      oid: "00000000-1111-2222-3333-444444444444",
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer((claims.iss as string) ?? ISSUER)
      .setAudience((claims.aud as string) ?? CLIENT_ID);

    // Well outside the 60s clock tolerance either way.
    if (opts.expired) jwt.setExpirationTime("-1h");
    else if (opts.notYetValid) jwt.setNotBefore("1h").setExpirationTime("2h");
    else jwt.setExpirationTime("1h");

    return jwt.sign(opts.key ?? good.privateKey);
  }

  // ---- the positive path -------------------------------------------------
  // If this breaks, nobody can use the app at all.

  const valid = await verifyIdToken(await mint(), jwks);
  assert(valid.email === "kevin@cre8advisors.com", "a valid token is accepted and yields the email");

  // Identity-claim fallbacks, in order of preference.
  const viaEmail = await verifyIdToken(
    await mint({ preferred_username: undefined, email: "chad@cre8advisors.com" }),
    jwks
  );
  assert(viaEmail.email === "chad@cre8advisors.com", "falls back to the email claim");

  const viaOid = await verifyIdToken(
    await mint({ preferred_username: undefined, email: undefined, oid: "abc-123" }),
    jwks
  );
  assert(viaOid.email === "abc-123", "falls back to the object id when there is no email claim");

  // A token with no tid at all should still pass — the issuer already pins the
  // tenant, and tid is only a secondary check.
  const noTid = await verifyIdToken(await mint({ tid: undefined }), jwks);
  assert(noTid.email === "kevin@cre8advisors.com", "a token without a tid claim still passes");

  // ---- what an attacker would try ---------------------------------------

  await assertRejects(
    verifyIdToken(await mint({}, { key: attacker.privateKey }), jwks),
    "a token signed with the wrong key is rejected"
  );

  await assertRejects(
    verifyIdToken(await mint({ aud: "some-other-app-id" }), jwks),
    "a token minted for a different audience is rejected"
  );

  await assertRejects(
    verifyIdToken(
      await mint({ iss: "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0" }),
      jwks
    ),
    "a token from another Microsoft tenant is rejected"
  );

  await assertRejects(
    verifyIdToken(await mint({}, { expired: true }), jwks),
    "an expired token is rejected"
  );

  await assertRejects(
    verifyIdToken(await mint({}, { notYetValid: true }), jwks),
    "a not-yet-valid token is rejected"
  );

  // A Graph access token would carry this audience. Accepting one would mean
  // trusting a credential minted for a different service.
  await assertRejects(
    verifyIdToken(await mint({ aud: "https://graph.microsoft.com" }), jwks),
    "a Graph-audience token is rejected"
  );

  // The classic JWT bypass: strip the signature and claim alg=none.
  const unsigned =
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        aud: CLIENT_ID,
        iss: ISSUER,
        preferred_username: "attacker@evil.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url") +
    ".";
  await assertRejects(verifyIdToken(unsigned, jwks), "an unsigned alg=none token is rejected");

  await assertRejects(verifyIdToken("not-a-jwt-at-all", jwks), "a malformed token is rejected");
  await assertRejects(verifyIdToken("", jwks), "an empty token is rejected");

  // A token that verifies but carries no identity at all must not yield an
  // empty user — requireUser() treats a missing header as unauthorized, and an
  // empty string would be a header set to "".
  await assertRejects(
    verifyIdToken(
      await mint({ preferred_username: undefined, email: undefined, oid: undefined }),
      jwks
    ),
    "a token with no identity claim is rejected"
  );

  // tid mismatch, with everything else correct. The issuer check normally
  // catches this; the explicit tid check is the backstop.
  await assertRejects(
    verifyIdToken(await mint({ tid: "11111111-2222-3333-4444-555555555555" }), jwks),
    "a token whose tid disagrees with the tenant is rejected"
  );

  if (failed === 0) console.log("\nall passed");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test harness error:", err);
  process.exit(1);
});
