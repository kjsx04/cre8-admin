import { NextRequest, NextResponse } from "next/server";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";

// POST /api/email/preview — render email HTML for the preview modal.
// No auth check on purpose: it only renders HTML from the fields in the request
// and touches no data, so a stale browser tab can't break it.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const vars = buildTemplateVars(body);
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
