import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { syncAndRecord } from "@/lib/email/scheduler";
import { hydrateCampaignListing, listingSnapshotFields } from "@/lib/email/listing-hydrate";
import { canRefreshListing } from "@/lib/email/template-version";

/**
 * POST /api/email/campaigns/[id]/refresh-listing
 *
 * Overlay live CMS listing fields onto the pinned template chrome, replace the
 * pending Resend broadcast, keep campaign copy. Does not change template_version.
 * Completed / cancelled campaigns are refused — sent inbox mail is immutable.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!canRefreshListing(campaign.status)) {
    return NextResponse.json(
      { error: "Sent emails stay as they were. Duplicate the campaign to send again." },
      { status: 400 }
    );
  }

  const live = await hydrateCampaignListing(campaign);
  const snap = listingSnapshotFields(live);

  const { data: saved, error: updErr } = await supabase
    .from("email_campaigns")
    .update({
      ...snap,
      updated_at: snap.listing_synced_at,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (updErr || !saved) {
    return NextResponse.json({ error: updErr?.message || "Refresh failed" }, { status: 500 });
  }

  let providerSync = null;
  if (saved.status === "scheduled" || saved.status === "active") {
    providerSync = await syncAndRecord(saved);
    if (providerSync.provider_send_id !== saved.provider_send_id) {
      await supabase
        .from("email_campaigns")
        .update({ provider_send_id: providerSync.provider_send_id })
        .eq("id", params.id);
      saved.provider_send_id = providerSync.provider_send_id;
    }
  }

  return NextResponse.json({
    ...saved,
    highlights: saved.highlights || [],
    provider_sync: providerSync,
  });
}
