import { NextRequest, NextResponse } from "next/server";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";

/**
 * POST /api/email/send-test — Send a real test email via SendGrid Mail Send v3.
 * Uses the verified sender (kevin@cre8advisors.com) and sends to a specific recipient.
 * No contact lists required — direct transactional send.
 */
export async function POST(request: NextRequest) {
  try {
    const { campaign, recipientEmail } = await request.json();

    if (!recipientEmail) {
      return NextResponse.json({ error: "recipientEmail is required" }, { status: 400 });
    }
    if (!campaign) {
      return NextResponse.json({ error: "campaign data is required" }, { status: 400 });
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SENDGRID_API_KEY not configured" }, { status: 500 });
    }

    // Build template vars and render HTML — same as preview route
    const vars = buildTemplateVars(campaign);
    let html = renderEmailHtml(vars);

    // Replace SendGrid unsubscribe merge tag with "#" (no real list for test sends)
    html = html.replace(/\{\{\{unsubscribe\}\}\}/g, "#");

    // Build subject line: [TEST] Just Listed: Property Name
    const label = campaign.email_label || "Just Listed";
    const listingName = campaign.listing_name || "Property";
    const subject = `[TEST] ${label}: ${listingName}`;

    // Send via SendGrid Mail Send v3 API
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipientEmail }] }],
        from: { email: "kevin@cre8advisors.com", name: "CRE8 Advisors" },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    // SendGrid returns 202 Accepted on success (no body)
    if (!sgRes.ok) {
      const errBody = await sgRes.text();
      console.error("[SendTest] SendGrid error:", sgRes.status, errBody);
      return NextResponse.json(
        { error: `SendGrid error: ${sgRes.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SendTest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 500 }
    );
  }
}
