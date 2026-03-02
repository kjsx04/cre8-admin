import { NextRequest, NextResponse } from "next/server";
import { renderEmailHtml } from "@/lib/email/constants";
import { getTypeColor } from "@/lib/email/utils";

// POST /api/email/preview — render email HTML for preview modal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const label = body.email_label || "Just Listed";
    const html = renderEmailHtml({
      label,
      labelColor: getTypeColor(label),
      heading: body.heading_text || body.listing_name || "Property Listing",
      bodyText: body.body_text || "",
      photoUrl: body.photo_url || "",
      highlights: body.highlights || [],
      listingUrl: body.listing_page_url || "",
      brokerName: body.broker_name || "",
      brokerEmail: body.broker_email || "",
      brokerPhone: body.broker_phone || "",
    });

    return NextResponse.json({ html });
  } catch (error) {
    console.error("[Preview] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
