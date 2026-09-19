import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { applyTemplateSync } from "@/lib/email/apply-template-sync";
import { selectTemplateSyncTargets } from "@/lib/email/template-version";

async function loadRows() {
  return supabase.from("email_campaigns").select("*");
}

/**
 * GET /api/email/campaigns/sync-templates
 * How many draft/scheduled/active/paused rows are behind CURRENT_TEMPLATE_VERSION.
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const { data: rows, error } = await loadRows();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = selectTemplateSyncTargets(rows || []);
  return NextResponse.json({
    eligible: targets.length,
    ids: targets.map((c) => String(c.id)),
  });
}

/**
 * POST /api/email/campaigns/sync-templates
 *
 * Stamp today's chrome onto every draft/scheduled/active/paused campaign that
 * is not already on CURRENT_TEMPLATE_VERSION. Listing snapshots stay frozen.
 * Pending Resend broadcasts are replaced. Sent mail is never rewritten.
 */
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const { data: rows, error } = await loadRows();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = selectTemplateSyncTargets(rows || []);

  const synced: string[] = [];
  const errors: string[] = [];

  for (const campaign of targets) {
    try {
      const { provider_sync } = await applyTemplateSync(campaign);
      if (provider_sync && provider_sync.ok === false) {
        errors.push(`${campaign.id}: ${provider_sync.error || provider_sync.action}`);
        continue;
      }
      synced.push(String(campaign.id));
    } catch (err) {
      errors.push(`${campaign.id}: ${err instanceof Error ? err.message : "sync failed"}`);
    }
  }

  return NextResponse.json({
    eligible: targets.length,
    synced: synced.length,
    ids: synced,
    errors,
  });
}
