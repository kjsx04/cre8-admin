"use client";

/**
 * The single way the browser talks to this app's API.
 *
 * WHAT THIS REPLACED
 * Every call site used to hand-write `headers: { "x-user-email": userEmail }`,
 * in 41 places across 23 files, with ad-hoc fallbacks like
 * `accounts[0]?.username || "admin@cre8advisors.com"`. The server accepted any
 * value, so that header was never authentication — it was a note about who the
 * caller claimed to be. Having it spelled out at 41 sites also meant there was
 * nowhere to add a real credential.
 *
 * WHAT IT DOES
 * Attaches the signed-in user's Microsoft ID token as a bearer token.
 * src/middleware.ts verifies it against Azure AD and passes the verified
 * identity to the route. Nothing else is needed at the call site:
 *
 *   const res = await apiFetch("/api/email/settings");
 *   const res = await apiFetch(`/api/listings/${id}`, {
 *     method: "PATCH",
 *     body: JSON.stringify(payload),
 *   });
 *
 * JSON bodies get `Content-Type: application/json` automatically; pass a
 * FormData body and it is left alone so the browser can set the multipart
 * boundary itself.
 */

import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "@/lib/msal-instance";

/**
 * Scopes for the ID token. These are the OIDC basics, not Graph permissions —
 * we're asking "who is this person", not for access to anything. Requesting
 * Graph scopes here would hand back a Graph-audience access token, which the
 * middleware cannot (and must not) validate.
 */
const ID_TOKEN_SCOPES = ["openid", "profile", "email"];

/**
 * Thrown when there is no signed-in account, or when MSAL needs the user to
 * interact again (consent, expired refresh token, password change).
 *
 * Callers generally shouldn't catch this: AuthGate already keeps the app behind
 * a sign-in screen, so it means the session died mid-use. Letting it reach the
 * error boundary shows the user something, which is better than the silent
 * failures this codebase is full of.
 */
export class NotSignedInError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "NotSignedInError";
  }
}

/**
 * Fetches a fresh ID token.
 *
 * acquireTokenSilent is deliberate: reading `account.idToken` off the cached
 * account is cheaper but hands back a token that may already have expired, and
 * the middleware would reject it. MSAL serves this from cache when the token is
 * still good, so the common path costs nothing.
 */
async function getIdToken(): Promise<string> {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new NotSignedInError("You are not signed in.");

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: ID_TOKEN_SCOPES,
      account,
    });
    if (!result.idToken) throw new NotSignedInError();
    return result.idToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) throw new NotSignedInError();
    throw err;
  }
}

/**
 * The signed-in user's email, for display or for sending as part of a payload.
 *
 * Use this instead of reaching into MSAL accounts at the call site. It is NOT
 * an identity the server trusts — the server reads identity from the verified
 * token, never from the body.
 */
export function currentUserEmail(): string {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  return account?.username || "";
}

/**
 * fetch() for this app's own API, with the bearer token attached.
 *
 * Only use it for same-origin `/api/...` paths. Calls to Microsoft Graph keep
 * using their Graph access token (see src/lib/useGraphToken.ts) — sending an ID
 * token to Graph would just be rejected.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // Set a JSON content type only when it would be right: a string body with no
  // explicit type. FormData must keep the browser's own multipart header,
  // which includes the boundary.
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, { ...init, headers });
}

/**
 * apiFetch plus the JSON parse and the error check that every call site was
 * writing out by hand — and that many were skipping, which is how a failed
 * publish came to look exactly like a successful one.
 *
 * Throws on a non-2xx response, using the API's own `error` field when it has
 * one, so a caller can surface a real message in a toast.
 */
export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error || body?.message || "";
    } catch {
      // Not every error response is JSON (a 504 from the platform isn't).
      // Falling through to the status-only message is fine.
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }

  // 204 and other empty responses would make res.json() throw.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
