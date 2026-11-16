/**
 * Microsoft ID token verification.
 *
 * Split out of src/middleware.ts so it can be tested against a locally
 * generated key pair. The middleware is the only caller in production; the
 * `keys` parameter exists for the test, which cannot reach Azure's real
 * signing keys.
 *
 * WHY THE *ID* TOKEN AND NOT AN ACCESS TOKEN
 * The only access tokens this app acquires are for Microsoft Graph
 * (Files.ReadWrite.All, Sites.ReadWrite.All — see src/lib/msal-config.ts), and
 * their audience is graph.microsoft.com, not us. Validating a token that was
 * issued for a different service is exactly the mistake Microsoft warns
 * against. The ID token's audience IS this app's client ID, so it is the right
 * credential to check, and using it needs no change to the Azure app
 * registration.
 *
 * If we later want real scopes, expose an API scope
 * (`api://<client-id>/access_as_user`) in Azure AD and change AUDIENCE below.
 * Nothing else about this file changes.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const CLIENT_ID =
  process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "c1bd941f-3240-412e-a22a-7c6296549c06";
export const TENANT_ID =
  process.env.NEXT_PUBLIC_MSAL_TENANT_ID || "74141c21-622f-43c7-869b-bd054d088c19";

/**
 * Both of these were checked against the tenant's published metadata at
 * https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration
 * — `issuer` and `jwks_uri` match exactly. Getting either wrong would reject
 * every valid token, so re-check them there if you change the tenant.
 */
export const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const JWKS_URI = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

/**
 * Azure AD's signing keys. createRemoteJWKSet fetches them on first use and
 * caches them in module scope, re-fetching only when it sees a key id it
 * doesn't know (which is what happens when Microsoft rotates keys). Module
 * scope survives between requests in the same runtime instance, so this is not
 * a fetch per request.
 */
const remoteJwks = createRemoteJWKSet(new URL(JWKS_URI));

export type VerifiedUser = {
  /** The caller's email / UPN, or their object id if the directory has neither. */
  email: string;
};

/**
 * Verifies a Microsoft ID token and returns who it belongs to.
 *
 * Throws if the signature, issuer, audience, tenant or expiry doesn't check
 * out — the caller turns that into a 401. It never returns a partially trusted
 * result.
 */
export async function verifyIdToken(
  token: string,
  keys: JWTVerifyGetKey = remoteJwks
): Promise<VerifiedUser> {
  const { payload } = await jwtVerify(token, keys, {
    // Pinning the tenant in the issuer is what stops a token from somebody
    // else's Microsoft tenant being accepted.
    issuer: ISSUER,
    audience: CLIENT_ID,
    // jwtVerify enforces exp and nbf itself; allow a little clock drift
    // between Azure and Vercel.
    clockTolerance: 60,
  });

  // Belt and braces: the issuer check above already pins the tenant, but this
  // catches a malformed token that somehow satisfied it.
  if (payload.tid && payload.tid !== TENANT_ID) {
    throw new Error("token is for a different tenant");
  }

  // preferred_username is the UPN/email on an Azure AD ID token. `email` is
  // only present when that optional claim is configured, and `oid` (the stable
  // object id) is a last resort so a signed-in user is never rejected purely
  // because the directory has no email claim.
  const email =
    (payload.preferred_username as string) ||
    (payload.email as string) ||
    (payload.oid as string) ||
    "";

  if (!email) throw new Error("token has no identity claim");

  return { email };
}
