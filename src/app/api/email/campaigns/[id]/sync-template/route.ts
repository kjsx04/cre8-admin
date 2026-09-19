import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { syncCampaignToProvider } from "@/lib/email/provider";
import { hydrateCampaignListing } from "@/lib/email/listing-hydrate";
import { canSyncTemplate, templateStamp } from "@/lib/email/template-version";

/**
 * POST /api/email/campaigns/[id]/sync-template
 *
 * Rebuild the pending send from today's renderEmailHtml chrome + live listing
 * fields. Campaign copy (heading, body, partner logo, broker, audience) stays.
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

  if (!canSyncTemplate(campaign.status)) {
    return NextResponse.json(
      { error: "Sent emails stay as they were. Duplicate the campaign to send again." },
      { status: 400 }
    );
  }

  const live = await hydrateCampaignListing(campaign);
  const stamp = templateStamp();
  const listingFields: Record<string, unknown> = {
    listing_name: live.listing_name,
    photo_url: live.photo_url,
    listing_page_url: live.listing_page_url,
    highlights: live.highlights || campaign.highlights || [],
  };
  if (Array.isArray(live.group_listings)) listingFields.group_listings = live.group_listings;

  const { data: saved, error: updErr } = await supabase
    .from("email_campaigns")
    .update({
      ...listingFields,
      ...stamp,
      updated_at: stamp.template_synced_at,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (updErr || !saved) {
    return NextResponse.json({ error: updErr?.message || "Sync failed" }, { status: 500 });
  }

  let providerSync = null;
  if (saved.status === "scheduled" || saved.status === "active") {
    providerSync = await syncCampaignToProvider(saved);
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
