import { NextRequest, NextResponse } from "next/server";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";

// POST /api/email/preview — render email HTML for preview modal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const vars = buildTemplateVars(body);
    let html = renderEmailHtml(vars);

    // Replace SendGrid unsubscribe merge tag with "#" for preview so the link renders but doesn't break
    html = html.replace(/\{\{\{unsubscribe\}\}\}/g, "#");

    return NextResponse.json({ html });
  } catch (error) {
    console.error("[Preview] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
