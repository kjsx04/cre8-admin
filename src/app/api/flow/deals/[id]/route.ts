import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { supabase } from "@/lib/flow/supabase";
import { escapeLikePattern } from "@/lib/sql-escape";

/**
 * Authorization for a single deal.
 *
 * Being signed in is not enough here. These handlers take a deal id straight
 * from the URL, so without this check any authenticated person could read
 * another broker's commission splits, edit their deal, or DELETE it outright.
 *
 * Membership is already the model the list endpoint uses — GET /api/flow/deals
 * filters on `deal_members!inner` by broker_id — so this just applies the same
 * rule to the by-id routes. All 31 existing deals have members, so nothing that
 * was previously visible becomes unreachable.
 *
 * Returns null when the caller may proceed, or the response to return.
 *
 * `ilike` with an escaped pattern, not `eq`: broker emails are stored with
 * inconsistent capitalisation (`Andy@CRE8Advisors.com` beside
 * `Chad@cre8advisors.com`), so the match has to be case-insensitive.
 */
async function requireDealMember(
  dealId: string,
  email: string
): Promise<NextResponse | null> {
  const { data: broker } = await supabase
    .from("brokers")
    .select("id")
    .ilike("email", escapeLikePattern(email))
    .maybeSingle();

  if (!broker) {
    return NextResponse.json(
      { error: "Not a broker on this account" },
      { status: 403 }
    );
  }

  const { data: membership } = await supabase
    .from("deal_members")
    .select("deal_id")
    .eq("deal_id", dealId)
    .eq("broker_id", broker.id)
    .maybeSingle();

  if (!membership) {
    // 404 rather than 403: a broker who isn't on a deal shouldn't be able to
    // learn that the deal exists.
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return null;
}

// GET /api/flow/deals/[id] — fetch a single deal with deal_dates + deal_members (with broker names)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const denied = await requireDealMember(params.id, auth.email);
  if (denied) return denied;
  const { data: deal, error } = await supabase
    .from("deals")
    .select("*, deal_dates(*), lease_payments(*)")
    .eq("id", params.id)
    .single();

  if (error || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Fetch deal_members with broker names joined
  const { data: memberRows } = await supabase
    .from("deal_members")
    .select("id, deal_id, broker_id, split_percent, brokers(name, email)")
    .eq("deal_id", params.id);

  const members = (memberRows || []).map((row) => {
    const b = row.brokers as unknown as { name: string; email: string } | null;
    return {
      id: row.id,
      deal_id: row.deal_id,
      broker_id: row.broker_id,
      split_percent: row.split_percent,
      broker_name: b?.name || undefined,
      broker_email: b?.email || undefined,
    };
  });

  return NextResponse.json({
    ...deal,
    additional_splits: deal.additional_splits || [],
    deal_dates: deal.deal_dates || [],
    deal_members: members,
    lease_payments: deal.lease_payments || [],
  });
}

// PATCH /api/flow/deals/[id] — update a deal (replaces deal_dates if provided)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const denied = await requireDealMember(params.id, auth.email);
  if (denied) return denied;
  const body = await request.json();

  // Build update object — only include fields that are present in the body
  const updates: Record<string, unknown> = {};

  if (body.deal_name !== undefined) updates.deal_name = body.deal_name;
  if (body.property_address !== undefined) updates.property_address = body.property_address || null;
  if (body.deal_type !== undefined) updates.deal_type = body.deal_type;
  if (body.price !== undefined) updates.price = body.price ? parseFloat(body.price) : null;
  if (body.commission_rate !== undefined) updates.commission_rate = parseFloat(body.commission_rate) / 100;
  if (body.broker_split !== undefined) updates.broker_split = parseFloat(body.broker_split) / 100;
  if (body.effective_date !== undefined) updates.effective_date = body.effective_date || null;
  if (body.escrow_open_date !== undefined) updates.escrow_open_date = body.escrow_open_date || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.actual_close_date !== undefined) updates.actual_close_date = body.actual_close_date || null;
  if (body.cancel_reason !== undefined) updates.cancel_reason = body.cancel_reason || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.listing_id !== undefined) updates.listing_id = body.listing_id || null;
  if (body.parcel_number !== undefined) updates.parcel_number = body.parcel_number || null;
  if (body.escrow_number !== undefined) updates.escrow_number = body.escrow_number || null;
  if (body.escrow_company !== undefined) updates.escrow_company = body.escrow_company || null;
  if (body.additional_splits !== undefined) updates.additional_splits = body.additional_splits;
  if (body.sharepoint_folder_url !== undefined) updates.sharepoint_folder_url = body.sharepoint_folder_url;
  if (body.lease_stage !== undefined) updates.lease_stage = body.lease_stage;
  if (body.w9_status !== undefined) updates.w9_status = body.w9_status;

  // Update the deal record
  const { data: deal, error } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", params.id)
    .select("*, deal_dates(*), lease_payments(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Replace deal_dates if provided (delete all, re-insert)
  let needsRefresh = false;
  if (body.deal_dates !== undefined && Array.isArray(body.deal_dates)) {
    // Delete existing deal_dates
    const { error: delErr } = await supabase
      .from("deal_dates")
      .delete()
      .eq("deal_id", params.id);

    if (delErr) {
      console.error("[PATCH deal] Failed to delete old deal_dates:", delErr.message);
    }

    // Insert new deal_dates
    if (body.deal_dates.length > 0) {
      const dateRows = body.deal_dates.map((dd: Record<string, unknown>, i: number) => ({
        deal_id: params.id,
        label: dd.label,
        date: dd.date,
        offset_days: dd.offset_days || null,
        offset_from: dd.offset_from || null,
        sort_order: dd.sort_order ?? i,
      }));

      const { error: insErr } = await supabase.from("deal_dates").insert(dateRows);
      if (insErr) {
        console.error("[PATCH deal] Failed to insert deal_dates:", insErr.message);
      }
    }
    needsRefresh = true;
  }

  // Replace lease_payments if provided (full schedule replacement — used when editing the schedule)
  if (body.lease_payments !== undefined && Array.isArray(body.lease_payments)) {
    // Delete existing lease_payments
    const { error: delPayErr } = await supabase
      .from("lease_payments")
      .delete()
      .eq("deal_id", params.id);

    if (delPayErr) {
      console.error("[PATCH deal] Failed to delete old lease_payments:", delPayErr.message);
    }

    // Insert new lease_payments
    if (body.lease_payments.length > 0) {
      const paymentRows = body.lease_payments.map((lp: Record<string, unknown>, i: number) => ({
        deal_id: params.id,
        sort_order: lp.sort_order ?? i,
        percent: lp.percent,
        payment_date: lp.payment_date || null,
        offset_days: lp.offset_days || null,
        offset_from: lp.offset_from || null,
        received: lp.received || false,
        received_date: lp.received_date || null,
      }));

      const { error: insPayErr } = await supabase.from("lease_payments").insert(paymentRows);
      if (insPayErr) {
        console.error("[PATCH deal] Failed to insert lease_payments:", insPayErr.message);
      }
    }
    needsRefresh = true;
  }

  // Lightweight received toggle — update individual payment rows without replacing the full schedule
  if (body.received_payments && Array.isArray(body.received_payments)) {
    for (const rp of body.received_payments as { id: string; received: boolean }[]) {
      const { error: rpErr } = await supabase
        .from("lease_payments")
        .update({
          received: rp.received,
          received_date: rp.received ? new Date().toISOString().substring(0, 10) : null,
        })
        .eq("id", rp.id);

      if (rpErr) {
        console.error("[PATCH deal] Failed to update lease_payment received:", rpErr.message);
      }
    }
    needsRefresh = true;
  }

  // Replace deal_members if provided (delete all, re-insert)
  if (body.broker_members !== undefined && Array.isArray(body.broker_members)) {
    // Delete existing members
    const { error: delMemErr } = await supabase
      .from("deal_members")
      .delete()
      .eq("deal_id", params.id);

    if (delMemErr) {
      console.error("[PATCH deal] Failed to delete old deal_members:", delMemErr.message);
    }

    // Insert new members
    if (body.broker_members.length > 0) {
      const memberRows = body.broker_members.map((m: { broker_id: string; split_percent: number | null }) => ({
        deal_id: params.id,
        broker_id: m.broker_id,
        split_percent: m.split_percent,
      }));

      const { error: insMemErr } = await supabase.from("deal_members").insert(memberRows);
      if (insMemErr) {
        console.error("[PATCH deal] Failed to insert deal_members:", insMemErr.message);
      }
    }
    needsRefresh = true;
  }

  // Re-fetch if dates or members were replaced, to get updated IDs
  if (needsRefresh) {
    const { data: refreshed } = await supabase
      .from("deals")
      .select("*, deal_dates(*), lease_payments(*)")
      .eq("id", params.id)
      .single();

    // Fetch updated deal_members with broker names
    const { data: memberRows } = await supabase
      .from("deal_members")
      .select("id, deal_id, broker_id, split_percent, brokers(name, email)")
      .eq("deal_id", params.id);

    const members = (memberRows || []).map((row) => {
      const b = row.brokers as unknown as { name: string; email: string } | null;
      return {
        id: row.id,
        deal_id: row.deal_id,
        broker_id: row.broker_id,
        split_percent: row.split_percent,
        broker_name: b?.name || undefined,
        broker_email: b?.email || undefined,
      };
    });

    if (refreshed) {
      return NextResponse.json({
        ...refreshed,
        additional_splits: refreshed.additional_splits || [],
        deal_dates: refreshed.deal_dates || [],
        deal_members: members,
        lease_payments: refreshed.lease_payments || [],
      });
    }
  }

  return NextResponse.json({
    ...deal,
    additional_splits: deal.additional_splits || [],
    deal_dates: deal.deal_dates || [],
    lease_payments: deal.lease_payments || [],
  });
}

// DELETE /api/flow/deals/[id] — delete a deal (deal_dates cascade-deleted via FK)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const denied = await requireDealMember(params.id, auth.email);
  if (denied) return denied;
  const { error } = await supabase
    .from("deals")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
