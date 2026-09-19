import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { resolveCre8BrokerEmails } from "@/lib/email/broker-emails";
import { isProviderConfigured, sendTest } from "@/lib/email/provider";

/**
 * POST /api/email/send-test — Send a real test email via Resend.
 * Recipients must be CRE8 brokers (same roster as the composer Broker step).
 * Accepts `recipientEmails` (array) or a single `recipientEmail`.
 * Sends FROM the campaign's broker address with a [TEST] subject prefix.
 */
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { campaign } = body;
    const { emails, invalid } = resolveCre8BrokerEmails(body.recipientEmails ?? body.recipientEmail);

    if (invalid.length > 0) {
      return NextResponse.json({ error: "Tests can only go to CRE8 brokers" }, { status: 400 });
    }
    if (emails.length === 0) {
      return NextResponse.json({ error: "Select at least one CRE8 broker" }, { status: 400 });
    }
    if (!campaign) {
      return NextResponse.json({ error: "campaign data is required" }, { status: 400 });
    }

    if (!isProviderConfigured()) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    await Promise.all(emails.map((email) => sendTest(email, campaign)));

    return NextResponse.json({ success: true, sent: emails.length });
  } catch (error) {
    console.error("[SendTest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 502 }
    );
  }
}
