import { NextResponse } from "next/server";
import { EMAIL_SENDERS, EMAIL_SEGMENTS } from "@/lib/email/constants";

// GET /api/email/config — return available segments + senders for the campaign form
export async function GET() {
  return NextResponse.json({
    senders: EMAIL_SENDERS,
    segments: EMAIL_SEGMENTS,
  });
}
