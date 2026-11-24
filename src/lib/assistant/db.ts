/**
 * The assistant's database access. It never uses the service-role key to read
 * company data. Each request gets a short-lived token, signed here with the
 * project's JWT secret, that names the read-only role and the asker. PostgREST
 * runs every query as that role, and the database enforces the limits (see
 * supabase/migrations/2026-11-24_assistant_readonly_role.sql).
 *
 * Needs two env vars in Vercel:
 *   SUPABASE_JWT_SECRET  the project's JWT secret (Project Settings, JWT Keys)
 *   SUPABASE_ANON_KEY    the project's public (anon / publishable) key
 * If either is missing the assistant refuses to start. It does not fall back to
 * the service-role key.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

export const ASSISTANT_DB_ROLE = "assistant_readonly";
export const TOKEN_TTL_SECONDS = 300;

/** Thrown when the assistant is not set up, so the route can say so plainly. */
export class AssistantDbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantDbConfigError";
  }
}

export type TokenClaims = {
  role: typeof ASSISTANT_DB_ROLE;
  aud: "authenticated";
  email: string;
  /** "true" only for the owner, who may see every deal. A string so SQL can read it with ->>. */
  cre8_owner: "true" | "false";
};

/** The claims the database sees. Pure, so it is easy to test. */
export function buildClaims(email: string, isOwner: boolean): TokenClaims {
  return {
    role: ASSISTANT_DB_ROLE,
    aud: "authenticated",
    email: email.trim().toLowerCase(),
    cre8_owner: isOwner ? "true" : "false",
  };
}

export async function signAssistantToken(
  secret: string,
  email: string,
  isOwner: boolean,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ ...buildClaims(email, isOwner) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

/** A client scoped to one asker for one request. Do not cache it across requests. */
export async function createAssistantDb(email: string, isOwner: boolean): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !secret || !anonKey) {
    throw new AssistantDbConfigError(
      "The assistant needs SUPABASE_URL, SUPABASE_JWT_SECRET and SUPABASE_ANON_KEY to be set.",
    );
  }
  const token = await signAssistantToken(secret, email, isOwner);
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
