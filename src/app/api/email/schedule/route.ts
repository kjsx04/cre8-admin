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
      priority,             // "high" | "normal" — the composer's "Top of list" choice
      rank,                 // listing rank (1 = most important) from the Priorities list, or null
      rank_total,
      is_announcement,      // bypasses listing spacing
      rules,                // rules block built from the Settings panel (see scheduler.rulesText)
      target_date,          // optional — recurring next occurrence should land near this date
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
        (c: { id: string; listing_name: string; email_label: string; scheduled_date: string; campaign_type: string; priority?: string; rank?: number | null; rank_total?: number; projected?: boolean }) =>
          `- ID: ${c.id} | "${c.email_label}: ${c.listing_name}" | Scheduled: ${c.scheduled_date || "unscheduled"} | Type: ${c.campaign_type} | Rank: ${c.rank != null ? `${c.rank} of ${c.rank_total}` : c.priority === "high" ? "TOP" : "unranked"}${c.projected ? " | PROJECTED (future recurring send — occupies the slot, cannot be shifted)" : ""}`
      )
      .join("\n");

    const systemPrompt = `You are an AI email campaign scheduler for CRE8 Advisors, a commercial real estate brokerage in Phoenix, AZ.

Your job: pick the optimal send time for a new email campaign and adjust the existing calendar if needed.

RULES:
${rules || "- Business days only, Mon–Fri 7:00–17:00 Phoenix time. Max 2 sends per day, 2-hour gap, at least 24 hours out."}

Current date: ${currentDate} (${dayOfWeek})
Current time: ${currentTime} MST
All times below are Phoenix (MST) local time. Your answer must be Phoenix local time too.

EXISTING SCHEDULED CAMPAIGNS:
${existingList || "None"}

NEW CAMPAIGN TO SCHEDULE:
- ID: ${campaign_id}
- Label: ${email_label}
- Type: ${campaign_type}
- Listing: ${listing_name}
- Frequency: ${frequency || "one-time"}
- Rank: ${rank != null ? `${rank} of ${rank_total}` : priority === "high" ? "TOP (new, placed at the top of the list)" : "unranked (bottom)"}
- Announcement: ${is_announcement ? "YES — must go out at the best available slot; listing spacing does not apply to it" : "no"}
${target_date ? `- TARGET DATE: this is the next occurrence of a recurring campaign. Schedule it in the same week as ${target_date} (same weekday/time as the previous send when possible). If that date is already in the past, pick the next valid business-hours slot at least 24 hours from now.` : ""}

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
