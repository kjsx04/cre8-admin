import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { isProviderConfigured, sendTest } from "@/lib/email/provider";

/**
 * POST /api/email/send-test — Send a real test email via Resend to one recipient.
 * Sends FROM the campaign's broker address with a [TEST] subject prefix.
 * No segment involved — a direct one-off email.
 */
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const { campaign, recipientEmail } = await request.json();

    if (!recipientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
      return NextResponse.json({ error: "A valid recipientEmail is required" }, { status: 400 });
    }
    if (!campaign) {
      return NextResponse.json({ error: "campaign data is required" }, { status: 400 });
    }

    if (!isProviderConfigured()) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    await sendTest(recipientEmail, campaign);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SendTest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 502 }
    );
  }
}
