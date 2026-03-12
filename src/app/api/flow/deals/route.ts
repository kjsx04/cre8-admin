import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";

// GET /api/flow/deals — fetch all deals for a broker (by email), with deal_dates + deal_members joined + broker defaults
export async function GET(request: NextRequest) {
  const email = request.headers.get("x-user-email");
  if (!email) {
    return NextResponse.json({ error: "Missing x-user-email header" }, { status: 401 });
  }

  // Look up broker by email (include defaults)
  const { data: broker, error: brokerErr } = await supabase
    .from("brokers")
    .select("id, default_commission_rate, default_broker_split, default_additional_splits")
    .ilike("email", email)
    .single();

  if (brokerErr || !broker) {
    return NextResponse.json({ error: "Broker not found for email: " + email }, { status: 404 });
  }

  // Fetch deals where this broker is a member (via deal_members join), newest first
  const { data: deals, error: dealsErr } = await supabase
    .from("deals")
    .select("*, deal_dates(*), deal_members!inner(id, deal_id, broker_id, split_percent), lease_payments(*)")
    .eq("deal_members.broker_id", broker.id)
    .order("created_at", { ascending: false });

  if (dealsErr) {
    return NextResponse.json({ error: dealsErr.message }, { status: 500 });
  }

  // For each deal, fetch ALL deal_members (not just the requesting broker's row)
  // and join broker names. The initial query only returns the requesting broker's row
  // because of the !inner filter, so we re-fetch all members per deal.
  const dealIds = (deals || []).map((d) => d.id);
  const allMembers: Record<string, Array<{ id: string; deal_id: string; broker_id: string; split_percent: number | null; broker_name?: string; broker_email?: string }>> = {};

  if (dealIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("deal_members")
      .select("id, deal_id, broker_id, split_percent, brokers(name, email)")
      .in("deal_id", dealIds);

    if (memberRows) {
      for (const row of memberRows) {
        const dId = row.deal_id;
        if (!allMembers[dId]) allMembers[dId] = [];
        // Supabase returns joined table as object (single FK) or array
        const b = row.brokers as unknown as { name: string; email: string } | null;
        allMembers[dId].push({
          id: row.id,
          deal_id: row.deal_id,
          broker_id: row.broker_id,
          split_percent: row.split_percent,
          broker_name: b?.name || undefined,
          broker_email: b?.email || undefined,
        });
      }
    }
  }

  // Parse deals with full member lists
  const parsedDeals = (deals || []).map((d) => ({
    ...d,
    additional_splits: d.additional_splits || [],
    deal_dates: d.deal_dates || [],
    deal_members: allMembers[d.id] || [],
    lease_payments: d.lease_payments || [],
  }));

  // Fetch all brokers (for the broker picker in DealForm)
  const { data: allBrokers } = await supabase
    .from("brokers")
    .select("id, name, email")
    .order("name");

  // Return deals + broker defaults + all brokers list
  return NextResponse.json({
    deals: parsedDeals,
    broker_defaults: {
      commission_rate: broker.default_commission_rate ?? 0.03,
      broker_split: broker.default_broker_split ?? 0.50,
      additional_splits: broker.default_additional_splits ?? [],
    },
    broker_id: broker.id,
    all_brokers: allBrokers || [],
  });
}

// POST /api/flow/deals — create a new deal with deal_dates
export async function POST(request: NextRequest) {
  const email = request.headers.get("x-user-email");
  if (!email) {
    return NextResponse.json({ error: "Missing x-user-email header" }, { status: 401 });
  }

  // Look up broker by email
  const { data: broker, error: brokerErr } = await supabase
    .from("brokers")
    .select("id")
    .ilike("email", email)
    .single();

  if (brokerErr || !broker) {
    return NextResponse.json({ error: "Broker not found for email: " + email }, { status: 404 });
  }

  const body = await request.json();

  // Insert the deal
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      broker_id: broker.id,
      deal_name: body.deal_name,
      property_address: body.property_address || null,
      deal_type: body.deal_type || "sale",
      price: body.price ? parseFloat(body.price) : null,
      commission_rate: body.commission_rate ? parseFloat(body.commission_rate) / 100 : 0.03,
      broker_split: body.broker_split ? parseFloat(body.broker_split) / 100 : 0.50,
      effective_date: body.effective_date || null,
      escrow_open_date: body.escrow_open_date || null,
      notes: body.notes || null,
      listing_id: body.listing_id || null,
      parcel_number: body.parcel_number || null,
      additional_splits: body.additional_splits || [],
      sharepoint_folder_url: body.sharepoint_folder_url || null,
    })
    .select()
    .single();

  if (dealErr) {
    return NextResponse.json({ error: dealErr.message }, { status: 500 });
  }

  // Insert deal_dates rows if provided
  if (body.deal_dates && Array.isArray(body.deal_dates) && body.deal_dates.length > 0) {
    const dateRows = body.deal_dates.map((dd: Record<string, unknown>, i: number) => ({
      deal_id: deal.id,
      label: dd.label,
      date: dd.date,
      offset_days: dd.offset_days || null,
      offset_from: dd.offset_from || null,
      sort_order: dd.sort_order ?? i,
    }));

    const { error: datesErr } = await supabase.from("deal_dates").insert(dateRows);
    if (datesErr) {
      console.error("[POST deals] Failed to insert deal_dates:", datesErr.message);
    }
  }

  // Insert lease_payments rows if provided (for lease deals)
  if (body.lease_payments && Array.isArray(body.lease_payments) && body.lease_payments.length > 0) {
    const paymentRows = body.lease_payments.map((lp: Record<string, unknown>, i: number) => ({
      deal_id: deal.id,
      sort_order: lp.sort_order ?? i,
      percent: lp.percent,
      payment_date: lp.payment_date || null,
      offset_days: lp.offset_days || null,
      offset_from: lp.offset_from || null,
      received: lp.received || false,
      received_date: lp.received_date || null,
    }));

    const { error: paymentsErr } = await supabase.from("lease_payments").insert(paymentRows);
    if (paymentsErr) {
      console.error("[POST deals] Failed to insert lease_payments:", paymentsErr.message);
    }
  }

  // Insert deal_members rows — creator is always included
  const brokerMembers: { broker_id: string; split_percent: number | null }[] =
    body.broker_members && Array.isArray(body.broker_members) && body.broker_members.length > 0
      ? body.broker_members
      : [{ broker_id: broker.id, split_percent: null }];

  // Ensure the creator is always in the list
  if (!brokerMembers.some((m: { broker_id: string }) => m.broker_id === broker.id)) {
    brokerMembers.unshift({ broker_id: broker.id, split_percent: null });
  }

  const memberRows = brokerMembers.map((m: { broker_id: string; split_percent: number | null }) => ({
    deal_id: deal.id,
    broker_id: m.broker_id,
    split_percent: m.split_percent,
  }));

  const { error: membersErr } = await supabase.from("deal_members").insert(memberRows);
  if (membersErr) {
    console.error("[POST deals] Failed to insert deal_members:", membersErr.message);
  }

  return NextResponse.json(deal, { status: 201 });
}
