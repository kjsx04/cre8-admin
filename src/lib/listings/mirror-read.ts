/**
 * Reading listings from the Supabase copy, and keeping that copy current.
 *
 * WHY
 * The Listings page used to ask Webflow (through the Cloudflare Worker) for every
 * listing on every load. Webflow's API is slow, so the page sat on a spinner.
 * Supabase already holds an exact copy (see webflow-mirror.ts), so the admin now
 * reads that instead: one fast database query.
 *
 * HOW THE COPY STAYS CURRENT
 *   1. Every admin save, create, publish or delete refreshes it right away
 *      (refreshMirrorInBackground, called from those API routes).
 *   2. A save also patches the row immediately (applyPatchToMirror), so going
 *      back to the Listings page never shows the old values, even for a second.
 *   3. Edits made directly in Webflow: whenever someone opens Listings and the
 *      copy hasn't been checked in 5 minutes, a refresh runs in the background.
 *   4. The hourly cron (/api/listings/mirror) still runs as a backstop.
 * If Supabase can't be read for any reason, the page falls back to Webflow.
 */

import { waitUntil } from "@vercel/functions";
import { supabase } from "@/lib/flow/supabase";
import { API_BASE } from "@/lib/admin-constants";
import { mapItemToRow, syncListingsMirror, type WebflowItem } from "@/lib/listings/webflow-mirror";

/** A listing in the same shape the Worker returns, so no page has to change. */
export interface MirroredItem {
  id: string;
  isDraft: boolean;
  isArchived: false;
  createdOn: string | null;
  lastUpdated: string | null;
  lastPublished: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldData: Record<string, any>;
}

/**
 * Every listing from the Supabase copy, shaped like the Worker's response.
 * Returns null if the copy can't be read or is empty (caller falls back to Webflow).
 */
export async function readListingsFromMirror(): Promise<MirroredItem[] | null> {
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("webflow_id, webflow_field_data, status, published_at, webflow_updated_at, webflow_created_at, synced_at")
      .not("webflow_id", "is", null);
    if (error || !data || data.length === 0) return null;
    return data.map((r) => ({
      id: r.webflow_id as string,
      // The copy marks a listing "draft" exactly when Webflow has it as draft or
      // never published, which is the same rule the Listings page uses.
      isDraft: r.status === "draft",
      isArchived: false,
      createdOn: r.webflow_created_at,
      // webflow_updated_at is blanked while photos are still being copied; fall
      // back to when the row was written so the "Updated" column is never empty.
      lastUpdated: r.webflow_updated_at || r.synced_at,
      lastPublished: r.published_at,
      fieldData: r.webflow_field_data || {},
    }));
  } catch {
    return null;
  }
}

/**
 * Refresh the copy from Webflow AFTER the response is sent, so it never slows a
 * page or a save. Only listings that actually changed are rewritten.
 */
export function refreshMirrorInBackground(reason: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return;
  waitUntil(
    syncListingsMirror({ supabase, supabaseUrl, workerBase: API_BASE, maxListings: 15 })
      .then((r) => {
        if (r.upserted.length || r.removed.length || r.warnings.length) {
          console.log(`[listings mirror] ${reason}:`, { upserted: r.upserted, removed: r.removed, warnings: r.warnings });
        }
      })
      .catch((err) => console.error(`[listings mirror] ${reason} refresh failed:`, err))
  );
}

// Last time this server instance started a "catch Webflow-side edits" refresh.
let lastStaleCheck = 0;
const STALE_CHECK_MS = 5 * 60 * 1000;

/** Called when Listings is opened: refresh in the background at most every 5 minutes. */
export function refreshMirrorIfStale() {
  const now = Date.now();
  if (now - lastStaleCheck < STALE_CHECK_MS) return;
  lastStaleCheck = now;
  refreshMirrorInBackground("periodic check");
}

/**
 * Right after a save: write the changed fields into the copy immediately, so the
 * Listings page shows them at once. The background refresh then re-syncs the row
 * properly from Webflow (including copying any new photos).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyPatchToMirror(webflowId: string, fieldDataPatch: Record<string, any>) {
  try {
    const { data: row } = await supabase
      .from("listings")
      .select("webflow_field_data, published_at, webflow_created_at, status")
      .eq("webflow_id", webflowId)
      .maybeSingle();
    if (!row) return; // not in the copy yet: the background refresh will add it

    const { data: brokers } = await supabase.from("brokers").select("id, webflow_id");
    const brokerMap: Record<string, string> = {};
    for (const b of brokers || []) if (b.webflow_id) brokerMap[b.webflow_id] = b.id;

    const item: WebflowItem = {
      id: webflowId,
      isDraft: row.status === "draft",
      createdOn: row.webflow_created_at,
      lastUpdated: new Date().toISOString(),
      lastPublished: row.published_at,
      fieldData: { ...(row.webflow_field_data || {}), ...fieldDataPatch },
    };
    const next = mapItemToRow(item, brokerMap);
    // Blank the "last synced" marker so the background refresh re-does this row
    // from Webflow (and copies any new photos into Supabase Storage).
    next.webflow_updated_at = null;
    await supabase.from("listings").update(next).eq("webflow_id", webflowId);
  } catch (err) {
    // Never fail a save over the copy; the background refresh will catch up.
    console.error("[listings mirror] quick patch failed:", err);
  }
}

/** After a delete: drop the row right away. */
export async function removeFromMirror(webflowId: string) {
  try {
    await supabase.from("listings").delete().eq("webflow_id", webflowId);
  } catch (err) {
    console.error("[listings mirror] remove failed:", err);
  }
}
