"use client";

/**
 * Audience sizes — client side.
 *
 * useAudienceCounts() gives any component the per-segment contact counts
 * ("All Contacts · 860"). The fetch happens once per page load and is shared
 * through a module-level promise, so SendCard can call it 30 times on the
 * planner without 30 requests.
 */

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { AudienceCount } from "./types";

let shared: Promise<AudienceCount[]> | null = null;
let sharedFor = ""; // the user email the shared promise was made with

async function load(userEmail: string): Promise<AudienceCount[]> {
  const res = await fetch("/api/email/audience", { headers: { "x-user-email": userEmail } });
  if (!res.ok) throw new Error(`audience ${res.status}`);
  const body = (await res.json()) as { data: AudienceCount[] };
  return body.data || [];
}

/** Counts keyed by internal segment id ("all", "test", …). Empty until loaded. */
export function useAudienceCounts(): Record<string, AudienceCount> {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const [counts, setCounts] = useState<Record<string, AudienceCount>>({});

  useEffect(() => {
    if (!userEmail) return;
    if (!shared || sharedFor !== userEmail) {
      sharedFor = userEmail;
      shared = load(userEmail).catch((err) => {
        shared = null; // let the next mount retry
        console.error("[audience] load failed:", err);
        return [];
      });
    }
    let alive = true;
    shared.then((list) => {
      if (!alive) return;
      const map: Record<string, AudienceCount> = {};
      for (const c of list) map[c.id] = c;
      setCounts(map);
    });
    return () => { alive = false; };
  }, [userEmail]);

  return counts;
}

/** "860" / "1,240" — compact count for chips and button labels */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * One-line recipient summary for the composer / detail panel:
 *   "860 recipients"  or  "858 recipients · 2 unsubscribed won't receive it"
 */
export function recipientLine(c: AudienceCount | undefined): string {
  if (!c) return "";
  const base = `${formatCount(c.subscribed)} recipient${c.subscribed === 1 ? "" : "s"}`;
  if (c.unsubscribed > 0) return `${base} · ${formatCount(c.unsubscribed)} unsubscribed won't receive it`;
  return base;
}
