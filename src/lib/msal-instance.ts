"use client";

/**
 * The one MSAL instance for the whole app.
 *
 * This used to live at module scope inside src/app/layout.tsx, which meant only
 * React components could reach it (via MsalProvider / useMsal). apiFetch() in
 * src/lib/api-fetch.ts is a plain function, not a hook, so it needs the instance
 * directly — hence this module.
 *
 * Import it here, not by constructing a second PublicClientApplication: two
 * instances would keep separate token caches and the second one would prompt for
 * login even though the first is signed in.
 */

import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "@/lib/msal-config";

export const msalInstance = new PublicClientApplication(msalConfig);
