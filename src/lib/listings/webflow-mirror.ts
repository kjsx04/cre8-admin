/**
 * Webflow → Supabase listings mirror.
 *
 * WHY THIS EXISTS
 * Webflow has been the only place listing data lives. The plan is to leave
 * Webflow, and step one is getting a complete, always-current copy of every
 * listing (fields, photos, PDFs) into Supabase — WITHOUT changing how the admin
 * saves or publishes. This file only ever READS from Webflow and WRITES to
 * Supabase. It is not on the save path, so it cannot break a listing save.
 *
 * WHAT IT DOES, EACH RUN
 *   1. Pulls every listing from the Cloudflare Worker (same feed the admin uses).
 *   2. Skips listings that have not changed since the last run.
 *   3. For the rest: copies any photo/PDF Supabase doesn't have yet into Supabase
 *      Storage, then upserts the row (matched on the Webflow item id).
 *   4. Removes rows for listings that were deleted in Webflow.
 *
 * The file has no `@/` imports on purpose, so the same code runs inside the
 * Next.js cron route AND from `npx tsx scripts/sync-listings-mirror.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** An image field as Webflow returns it. */
export interface WebflowImage {
  fileId?: string;
  url: string;
  alt?: string | null;
}

/** One CMS item as the Worker returns it. */
export interface WebflowItem {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  createdOn?: string | null;
  lastUpdated?: string | null;
  lastPublished?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldData: Record<string, any>;
}

/** One photo in the `gallery` column. `source_url` is where it came from. */
export interface GalleryEntry {
  url: string;
  alt: string;
  order: number;
  file_id: string | null;
  source_url: string;
}

export interface MirrorResult {
  webflowTotal: number;
  upserted: string[]; // slugs written this run
  unchanged: number;
  removed: string[]; // slugs deleted because Webflow no longer has them
  filesCopied: number;
  warnings: string[];
  /** Listings still waiting because the per-run cap was hit. */
  deferred: number;
}

// ─────────────────────────────────────────────────────────────
// Lookup tables (Webflow option id → the text shown on the site)
// ─────────────────────────────────────────────────────────────

// These strings match what the Supabase table has used since February and what
// the cre8-site pages filter on, so they are kept as-is. The raw option id is
// stored alongside (listing_type_id) for pushing back to Webflow.
export const LISTING_TYPE_NAMES: Record<string, string> = {
  "844ae85d08f5a68c907ac4be3eb984ea": "For Sale",
  "bc83ed2759c79020a9a4428cbe30da2f": "For Lease",
  "13f04de01e08de37ea5f8ec4427d2dc4": "For Sale/Lease",
};

export const PROPERTY_TYPE_NAMES: Record<string, string> = {
  "65a0153353ea95ab735bf02fe556ce7f": "Retail",
  "62d84a03cece728ffd8c343eecd82684": "Retail Pads",
  "ce6a96d500dbb4713d567b48d21b72c7": "Retail Development Site",
  "c25687914772fa3ea205f474b8a964c1": "Industrial",
  "5bbeb7ce34d4c7183067446b261d0696": "Powered Land",
  "4eb9d1d3ec6d0462232cb066da667813": "Industrial Development Site",
  "9e45605ad4788d429493e0d1a88bf4a6": "Medical",
  "8e7ecd439b659a4be06a867ab6e6b126": "Office",
  "1e01fc2af78fe67044bfde09e9e9c4e1": "Land",
  "c5a5745aa5ce2d446f03636b31d8c661": "Improved Land",
};

const IMAGE_BUCKET = "listings-images";
const DOC_BUCKET = "listing-packages";

// ─────────────────────────────────────────────────────────────
// Pure helpers (covered by webflow-mirror.test.ts)
// ─────────────────────────────────────────────────────────────

/**
 * draft  = never published, or marked draft in Webflow (hidden from the public)
 * sold   = published and flagged sold
 * live   = everything else
 * Drafts must come out as "draft": the table's public-read rule only exposes
 * rows whose status is "live", so this is what keeps unpublished listings private.
 */
export function listingStatus(item: WebflowItem): "draft" | "live" | "sold" {
  if (item.isDraft || !item.lastPublished) return "draft";
  if (item.fieldData?.sold === true) return "sold";
  return "live";
}

/** File extension from a URL, lower-case, no dot. Falls back to `fallback`. */
export function extOf(url: string, fallback: string): string {
  const path = url.split("?")[0].split("#")[0];
  const m = path.match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : fallback;
}

/** Where a Webflow image is stored in Supabase: `<itemId>/<fileId>.<ext>`. */
export function imagePath(itemId: string, img: WebflowImage): string {
  // fileId is Webflow's permanent id for the asset, so the same photo always
  // lands on the same path and is only ever copied once. If it is missing, the
  // last part of the URL (which starts with that same id) stands in.
  const key = img.fileId || safeName(lastSegment(img.url)).replace(/\.[a-z0-9]+$/i, "");
  return `${itemId}/${key}.${extOf(img.url, "jpg")}`;
}

/** Where a Webflow document (package / ALTA / site plan) is stored. */
export function docPath(itemId: string, url: string): string {
  return `${itemId}/${safeName(lastSegment(url))}`;
}

function lastSegment(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const seg = path.substring(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** Storage keys reject some characters — keep letters, numbers, dot, dash, underscore. */
export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * Turns one Webflow item into a Supabase row.
 *
 * `urls` maps a Webflow file URL → its Supabase copy. A file that could not be
 * copied is simply absent from the map and keeps its Webflow URL, so a row is
 * never left pointing at nothing.
 */
export function mapItemToRow(
  item: WebflowItem,
  brokerUuidByWebflowId: Record<string, string>,
  urls: Record<string, string> = {}
) {
  const f = item.fieldData || {};
  const swap = (u: string | null | undefined) => (u ? urls[u] || u : null);

  const webflowBrokerIds: string[] = Array.isArray(f["listing-brokers"]) ? f["listing-brokers"] : [];
  const gallery: GalleryEntry[] = (Array.isArray(f.gallery) ? f.gallery : [])
    .filter((img: WebflowImage) => img && img.url)
    .map((img: WebflowImage, i: number) => ({
      url: swap(img.url) as string,
      alt: img.alt || "",
      order: i,
      file_id: img.fileId || null,
      source_url: img.url,
    }));

  const floorplan = swap(f.floorplan?.url);

  return {
    webflow_id: item.id,
    webflow_slug: f.slug,
    slug: f.slug,
    name: f.name || "",
    full_address: f["full-address"] || "",
    city_county: f["city-county"] || "",
    // The Webflow field is called "square-feet" but has always held ACRES.
    acres: num(f["square-feet"]),
    building_sqft: num(f["building-sqft"]) === null ? null : Math.round(num(f["building-sqft"]) as number),
    list_price: f["list-price"] || "",
    listing_type: LISTING_TYPE_NAMES[f["listing-type-2"]] || "",
    listing_type_id: text(f["listing-type-2"]),
    property_type: PROPERTY_TYPE_NAMES[f["property-type"]] || "",
    property_type_id: text(f["property-type"]),
    zoning: text(f.zoning),
    zoning_municipality: text(f["zoning-municipality"]),
    cross_streets: text(f["cross-streets"]),
    traffic_count: text(f["traffic-count"]),
    latitude: num(f.latitude),
    longitude: num(f.longitude),
    google_maps_link: text(f["google-maps-link"]),
    property_overview: f["property-overview"] || null,
    spaces_available: f["spaces-available"] || null,
    available: f.available !== false,
    sold: f.sold === true,
    under_contract: f["under-contract"] === true,
    featured: f.featured === true,
    drone_hero: f["drone-hero"] === true,
    // The "floorplan" field is really the marketing/card image. Fall back to
    // the first gallery photo so a listing always has a card image.
    floorplan_url: floorplan,
    marketing_image: floorplan || gallery[0]?.url || null,
    gallery,
    package_url: swap(text(f["package-2"])),
    alta_survey_url: swap(text(f["alta-survey-2"])),
    site_plan_url: swap(text(f["site-plan-2"])),
    webflow_broker_ids: webflowBrokerIds,
    broker_ids: webflowBrokerIds.map((id) => brokerUuidByWebflowId[id]).filter(Boolean),
    status: listingStatus(item),
    published_at: item.lastPublished || null,
    webflow_created_at: item.createdOn || null,
    webflow_updated_at: item.lastUpdated || null,
    webflow_field_data: f,
    synced_at: new Date().toISOString(),
  };
}

/** Every file a listing needs copied: `{ sourceUrl, bucket, path }`. */
export function filesFor(item: WebflowItem): { sourceUrl: string; bucket: string; path: string }[] {
  const f = item.fieldData || {};
  const out: { sourceUrl: string; bucket: string; path: string }[] = [];
  const seen = new Set<string>();
  const add = (sourceUrl: string, bucket: string, path: string) => {
    if (seen.has(sourceUrl)) return; // the card image is usually also gallery photo 1
    seen.add(sourceUrl);
    out.push({ sourceUrl, bucket, path });
  };
  const images: WebflowImage[] = [f.floorplan, ...(Array.isArray(f.gallery) ? f.gallery : [])].filter(
    (img) => img && img.url
  );
  for (const img of images) add(img.url, IMAGE_BUCKET, imagePath(item.id, img));
  for (const key of ["package-2", "alta-survey-2", "site-plan-2"]) {
    const url = text(f[key]);
    if (url) add(url, DOC_BUCKET, docPath(item.id, url));
  }
  return out;
}

/** True when Webflow's copy is newer than (or different from) what the row recorded. */
export function needsSync(
  item: WebflowItem,
  row: { webflow_updated_at: string | null; published_at: string | null; status: string } | undefined
): boolean {
  if (!row || !row.webflow_updated_at) return true;
  const same = (a?: string | null, b?: string | null) =>
    (a ? new Date(a).getTime() : 0) === (b ? new Date(b).getTime() : 0);
  return (
    !same(item.lastUpdated, row.webflow_updated_at) ||
    !same(item.lastPublished, row.published_at) ||
    listingStatus(item) !== row.status
  );
}

/**
 * Is it safe to delete rows that are missing from this Webflow response?
 * Only when we are sure the response is the WHOLE collection. A truncated or
 * half-failed response must never be read as "those listings were deleted".
 */
export function safeToRemove(received: number, reportedTotal: number | undefined, mirroredBefore: number): boolean {
  if (reportedTotal === undefined || received !== reportedTotal) return false;
  if (mirroredBefore > 0 && received < mirroredBefore * 0.5) return false;
  return received > 0;
}

// ─────────────────────────────────────────────────────────────
// The sync itself
// ─────────────────────────────────────────────────────────────

export interface MirrorOptions {
  supabase: SupabaseClient;
  /** e.g. https://xxxx.supabase.co — used to build public file URLs. */
  supabaseUrl: string;
  /** Cloudflare Worker base, e.g. https://cre8-api-proxy.kjsx04.workers.dev */
  workerBase: string;
  /** Stop after this many changed listings (the cron has a time limit). */
  maxListings?: number;
  /** Re-process every listing even if it looks unchanged. */
  force?: boolean;
  log?: (msg: string) => void;
}

export async function syncListingsMirror(opts: MirrorOptions): Promise<MirrorResult> {
  const { supabase, workerBase } = opts;
  const log = opts.log || (() => {});
  const result: MirrorResult = {
    webflowTotal: 0,
    upserted: [],
    unchanged: 0,
    removed: [],
    filesCopied: 0,
    warnings: [],
    deferred: 0,
  };

  // ── 1. Everything Webflow has ──
  const res = await fetch(`${workerBase}/listings`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Worker /listings returned ${res.status}`);
  const body = await res.json();
  const items: WebflowItem[] = (body.items || []).filter((i: WebflowItem) => !i.isArchived && i.fieldData?.slug);
  const reportedTotal: number | undefined = body.pagination?.total;
  result.webflowTotal = items.length;
  if (reportedTotal !== undefined && reportedTotal > (body.items || []).length) {
    // The Worker asks Webflow for one page (100 items). Past that, listings
    // would silently go missing — say so loudly instead.
    result.warnings.push(
      `Webflow has ${reportedTotal} listings but the Worker returned ${(body.items || []).length}. ` +
        `The Worker needs paging; nothing was removed this run.`
    );
  }

  // ── 2. What Supabase has ──
  const { data: rows, error: rowsErr } = await supabase
    .from("listings")
    .select("id, slug, webflow_id, webflow_updated_at, published_at, status");
  if (rowsErr) throw new Error(`Reading listings failed: ${rowsErr.message}`);
  const rowByWebflowId = new Map((rows || []).filter((r) => r.webflow_id).map((r) => [r.webflow_id as string, r]));

  const { data: brokers, error: brokersErr } = await supabase.from("brokers").select("id, webflow_id");
  if (brokersErr) throw new Error(`Reading brokers failed: ${brokersErr.message}`);
  const brokerMap: Record<string, string> = {};
  for (const b of brokers || []) if (b.webflow_id) brokerMap[b.webflow_id] = b.id;

  // ── 3. Remove listings Webflow deleted (before upserting, so a re-created
  //       listing can reuse the slug its deleted predecessor held) ──
  const liveIds = new Set(items.map((i) => i.id));
  const gone = (rows || []).filter((r) => r.webflow_id && !liveIds.has(r.webflow_id));
  if (gone.length) {
    if (safeToRemove((body.items || []).length, reportedTotal, rowByWebflowId.size)) {
      const { error } = await supabase
        .from("listings")
        .delete()
        .in(
          "id",
          gone.map((r) => r.id)
        );
      if (error) result.warnings.push(`Removing deleted listings failed: ${error.message}`);
      else result.removed = gone.map((r) => r.slug);
    } else {
      result.warnings.push(`${gone.length} listing(s) look deleted in Webflow but the response was not trusted; kept.`);
    }
  }

  // ── 4. Copy files + upsert each changed listing ──
  const changed = items.filter((i) => opts.force || needsSync(i, rowByWebflowId.get(i.id)));
  result.unchanged = items.length - changed.length;
  const batch = opts.maxListings ? changed.slice(0, opts.maxListings) : changed;
  result.deferred = changed.length - batch.length;

  for (const item of batch) {
    const slug = item.fieldData.slug as string;
    try {
      const urls: Record<string, string> = {};
      let allCopied = true;

      const files = filesFor(item);
      // One listing call per bucket tells us what is already there.
      const have: Record<string, Set<string>> = {};
      for (const bucket of [IMAGE_BUCKET, DOC_BUCKET]) {
        const { data } = await supabase.storage.from(bucket).list(item.id, { limit: 1000 });
        have[bucket] = new Set((data || []).map((o) => `${item.id}/${o.name}`));
      }

      // Four at a time — fast enough, and gentle on Webflow's CDN.
      for (let i = 0; i < files.length; i += 4) {
        await Promise.all(
          files.slice(i, i + 4).map(async (file) => {
            const publicUrl = `${opts.supabaseUrl}/storage/v1/object/public/${file.bucket}/${file.path}`;
            if (have[file.bucket].has(file.path)) {
              urls[file.sourceUrl] = publicUrl;
              return;
            }
            try {
              const dl = await fetch(file.sourceUrl);
              if (!dl.ok) throw new Error(`download ${dl.status}`);
              const bytes = Buffer.from(await dl.arrayBuffer());
              const { error } = await supabase.storage.from(file.bucket).upload(file.path, bytes, {
                contentType: dl.headers.get("content-type") || undefined,
                upsert: false,
              });
              // "already exists" just means another run got there first.
              if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);
              urls[file.sourceUrl] = publicUrl;
              result.filesCopied += 1;
            } catch (err) {
              allCopied = false;
              result.warnings.push(`${slug}: could not copy ${file.sourceUrl} (${err instanceof Error ? err.message : err})`);
            }
          })
        );
      }

      const row = mapItemToRow(item, brokerMap, urls);
      // If a file failed, blank the "last synced" marker so the next run retries
      // this listing. The row itself is still written with the Webflow URL.
      if (!allCopied) row.webflow_updated_at = null;

      const { error } = await supabase.from("listings").upsert(row, { onConflict: "webflow_id" });
      if (error) throw new Error(error.message);
      result.upserted.push(slug);
      log(`  ✓ ${slug} (${row.status}, ${files.length} files)`);
    } catch (err) {
      result.warnings.push(`${slug}: ${err instanceof Error ? err.message : err}`);
      log(`  ✗ ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}
