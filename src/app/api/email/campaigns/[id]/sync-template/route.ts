import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { applyTemplateSync } from "@/lib/email/apply-template-sync";

/**
 * POST /api/email/campaigns/[id]/sync-template
 *
 * Rebuild the pending send from today's renderEmailHtml chrome.
 * Listing snapshot stays frozen (use Refresh listing for photos/price).
 * Campaign copy (heading, body, partner logo, broker, audience) stays.
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

  try {
    const { campaign: saved, provider_sync } = await applyTemplateSync(campaign);
    return NextResponse.json({
      ...saved,
      highlights: (saved.highlights as string[]) || [],
      provider_sync,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = /stay as they were/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
