import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { supabase } from "@/lib/flow/supabase";
import { escapeLikePattern } from "@/lib/sql-escape";

// GET /api/flow/broker/defaults — fetch broker's default commission settings
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const email = auth.email;

  // Look up broker by email
  const { data: broker, error } = await supabase
    .from("brokers")
    .select("default_commission_rate, default_broker_split, default_additional_splits")
    .ilike("email", escapeLikePattern(email))
    .single();

  if (error || !broker) {
    return NextResponse.json({ error: "Broker not found" }, { status: 404 });
  }

  return NextResponse.json({
    commission_rate: broker.default_commission_rate ?? 0.03,
    broker_split: broker.default_broker_split ?? 0.50,
    additional_splits: broker.default_additional_splits ?? [],
  });
}

// PATCH /api/flow/broker/defaults — update broker's default commission settings
export async function PATCH(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const email = auth.email;

  const body = await request.json();

  // Build update object from provided fields
  const updates: Record<string, unknown> = {};
  if (body.commission_rate !== undefined) {
    updates.default_commission_rate = body.commission_rate;
  }
  if (body.broker_split !== undefined) {
    updates.default_broker_split = body.broker_split;
  }
  if (body.additional_splits !== undefined) {
    updates.default_additional_splits = body.additional_splits;
  }

  const { data: broker, error } = await supabase
    .from("brokers")
    .update(updates)
    .ilike("email", escapeLikePattern(email))
    .select("default_commission_rate, default_broker_split, default_additional_splits")
    .single();

  if (error || !broker) {
    return NextResponse.json({ error: error?.message || "Broker not found" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({
    commission_rate: broker.default_commission_rate,
    broker_split: broker.default_broker_split,
    additional_splits: broker.default_additional_splits ?? [],
  });
}
