"use client";

/**
 * Audience sizes — client side.
 *
 * useAudience() loads live Resend segments + counts once per page load and
 * shares the promise, so SendCard can call it 30 times on the planner without
 * 30 requests.
 */

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { AudienceCount } from "./types";
import { parseAudienceTokens } from "./audience-tokens";

let shared: Promise<AudienceCount[]> | null = null;
let sharedFor = ""; // the user email the shared promise was made with

function allZero(list: AudienceCount[]): boolean {
  return list.length > 0 && list.every((s) => !s.total && !s.subscribed);
}

async function fetchAudience(userEmail: string, refresh = false): Promise<AudienceCount[]> {
  // v=3 busts browsers that cached the old all-zero JSON at /api/email/audience
  const qs = refresh ? "?refresh=1&v=3" : "?v=3";
  const res = await fetch(`/api/email/audience${qs}`, {
    cache: "no-store",
    headers: { "x-user-email": userEmail, "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) throw new Error(`audience ${res.status}`);
  const body = (await res.json()) as { data: AudienceCount[] };
  return body.data || [];
}

async function load(userEmail: string): Promise<AudienceCount[]> {
  const first = await fetchAudience(userEmail, false);
  if (!allZero(first)) return first;
  // Stale/cached zeros from a bad count — force a live recount
  return fetchAudience(userEmail, true);
}

export type AudienceState = {
  list: AudienceCount[];
  map: Record<string, AudienceCount>;
  loaded: boolean;
  error: boolean;
};

/** Live segments + counts. Empty list until the fetch finishes. */
export function useAudience(): AudienceState {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const [state, setState] = useState<AudienceState>({ list: [], map: {}, loaded: false, error: false });

  useEffect(() => {
    if (!userEmail) return;
    if (!shared || sharedFor !== userEmail) {
      sharedFor = userEmail;
      shared = load(userEmail)
        .then((list) => {
          if (allZero(list)) shared = null;
          return list;
        })
        .catch((err) => {
          shared = null; // let the next mount retry
          console.error("[audience] load failed:", err);
          throw err;
        });
    }
    let alive = true;
    shared
      .then((list) => {
        if (!alive) return;
        const map: Record<string, AudienceCount> = {};
        for (const c of list) map[c.id] = c;
        setState({ list, map, loaded: true, error: false });
      })
      .catch(() => {
        if (!alive) return;
        setState({ list: [], map: {}, loaded: true, error: true });
      });
    return () => {
      alive = false;
    };
  }, [userEmail]);

  return state;
}

/** Counts keyed by Resend segment id. Empty until loaded. */
export function useAudienceCounts(): Record<string, AudienceCount> {
  return useAudience().map;
}

/** Sum selected lists + extra emails into one AudienceCount for chips / confirms. */
export function combineAudience(
  map: Record<string, AudienceCount>,
  segmentIds: string[],
  extraEmailCount = 0
): AudienceCount | undefined {
  if (segmentIds.length === 0 && extraEmailCount === 0) return undefined;

  let total = extraEmailCount;
  let subscribed = extraEmailCount;
  let unsubscribed = 0;
  const names: string[] = [];
  let known = 0;

  for (const id of segmentIds) {
    const c = map[id];
    if (!c) continue;
    known += 1;
    total += c.total;
    subscribed += c.subscribed;
    unsubscribed += c.unsubscribed;
    names.push(c.name);
  }
  if (extraEmailCount > 0) {
    names.push(extraEmailCount === 1 ? "1 extra contact" : `${extraEmailCount} extra contacts`);
  }
  if (known === 0 && extraEmailCount === 0) return undefined;

  return {
    id: segmentIds.join(",") || "extras",
    name: names.join(" · ") || "Audience",
    total,
    subscribed,
    unsubscribed,
  };
}

/**
 * Resolve a stored campaign.segment_id against live counts.
 * Legacy "test" → Brokers (renamed). Legacy "all" is not expanded.
 */
export function audienceForCampaign(
  map: Record<string, AudienceCount>,
  segmentId: string | null | undefined
): AudienceCount | undefined {
  const parsed = parseAudienceTokens(segmentId);
  const ids = [...parsed.segmentIds];
  if (!ids.length && parsed.legacy.includes("test")) {
    const brokers = Object.values(map).find((s) => /^(brokers|test)$/i.test(s.name));
    if (brokers) ids.push(brokers.id);
  }
  return combineAudience(map, ids, parsed.extraEmails.length);
}

export function audienceLabel(
  map: Record<string, AudienceCount>,
  segmentId: string | null | undefined,
  fallback = ""
): string {
  const parsed = parseAudienceTokens(segmentId);
  const names = parsed.segmentIds.map((id) => map[id]?.name).filter(Boolean) as string[];
  if (!names.length && parsed.legacy.includes("test")) {
    const brokers = Object.values(map).find((s) => /^(brokers|test)$/i.test(s.name));
    if (brokers) names.push(brokers.name);
  }
  if (parsed.extraEmails.length) {
    names.push(
      parsed.extraEmails.length === 1 ? "1 extra contact" : `${parsed.extraEmails.length} extra contacts`
    );
  }
  return names.join(", ") || fallback;
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
