import { NextRequest, NextResponse } from "next/server";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";
import { hydrateCampaignListing, listingStaysLive } from "@/lib/email/listing-hydrate";

// POST /api/email/preview — render email HTML for the preview modal.
// Drafts overlay live CMS listing fields. Scheduled+ uses the frozen snapshot.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const row = listingStaysLive(body.status) ? await hydrateCampaignListing(body) : body;
    const vars = buildTemplateVars(row);
    let html = renderEmailHtml(vars);

    // Replace the Resend unsubscribe merge tag with "#" for preview so the link renders but doesn't break
    html = html.replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "#");

    return NextResponse.json({ html });
  } catch (error) {
    console.error("[Preview] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
