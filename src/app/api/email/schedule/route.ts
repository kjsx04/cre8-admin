import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/email/schedule — AI picks the optimal send time for a campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaign_id,
      email_label,
      campaign_type,
      listing_name,
      frequency,
      existing_campaigns,
    } = body;

    if (!campaign_id || !email_label) {
      return NextResponse.json(
        { error: "Missing campaign_id or email_label" },
        { status: 400 }
      );
    }

    // Current date in MST (Arizona doesn't observe DST)
    const now = new Date();
    const mstNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
    const currentDate = mstNow.toISOString().substring(0, 10);
    const currentTime = mstNow.toTimeString().substring(0, 5);
    const dayOfWeek = mstNow.toLocaleDateString("en-US", { weekday: "long" });

    // Format existing campaigns for the prompt
    const existingList = (existing_campaigns || [])
      .map(
        (c: { id: string; listing_name: string; email_label: string; scheduled_date: string; campaign_type: string }) =>
          `- ID: ${c.id} | "${c.email_label}: ${c.listing_name}" | Scheduled: ${c.scheduled_date || "unscheduled"} | Type: ${c.campaign_type}`
      )
      .join("\n");

    const systemPrompt = `You are an AI email campaign scheduler for CRE8 Advisors, a commercial real estate brokerage in Phoenix, AZ.

Your job: pick the optimal send time for a new email campaign and adjust the existing calendar if needed.

RULES:
- Business hours ONLY: 7:00 AM - 5:00 PM MST, Monday through Friday
- Time preferences: mornings (7-11 AM) > afternoons (12-5 PM). Tuesday-Thursday > Monday/Friday.
- Maximum 2 campaigns per day. Minimum 2-hour gap between any two sends on the same day.
- Priority hierarchy (higher = more important, gets better slots):
  1. Just Listed (highest)
  2. Just Sold
  3. Featured
  4. New (listing < 60 days old)
  5. Standard (lowest)
- You CAN shift lower-priority campaigns to make room for higher-priority ones — BUT never shift a campaign that's within 2 hours of its scheduled send time.
- For recurring campaigns: assign a consistent weekly slot (same day/time each week). Use the frequency to compute the slot.
- Distribute sends evenly across the week. Avoid clustering on one day.
- Schedule at least 24 hours in the future (never same-day).

Current date: ${currentDate} (${dayOfWeek})
Current time: ${currentTime} MST

EXISTING SCHEDULED CAMPAIGNS:
${existingList || "None"}

NEW CAMPAIGN TO SCHEDULE:
- ID: ${campaign_id}
- Label: ${email_label}
- Type: ${campaign_type}
- Listing: ${listing_name}
- Frequency: ${frequency || "one-time"}

Return ONLY valid JSON (no markdown, no preamble):
{
  "new_campaign_slot": {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "reasoning": "Brief explanation of why this slot was chosen"
  },
  "calendar_changes": [
    {
      "id": "campaign_uuid_that_was_shifted",
      "new_date": "YYYY-MM-DD",
      "new_time": "HH:MM",
      "reason": "Why this campaign was shifted"
    }
  ]
}

If no calendar changes are needed, return an empty array for calendar_changes.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Schedule this campaign: "${email_label}: ${listing_name}" (${campaign_type}, frequency: ${frequency || "one-time"})`,
        },
      ],
      system: systemPrompt,
    });

    // Extract text response
    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON with fallback
    let result;
    try {
      result = JSON.parse(textBlock.text);
    } catch {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse scheduling response as JSON");
      }
    }

    // Validate the result has required fields
    if (!result.new_campaign_slot?.date || !result.new_campaign_slot?.time) {
      throw new Error("AI response missing date or time");
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Schedule] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduling failed" },
      { status: 500 }
    );
  }
}
