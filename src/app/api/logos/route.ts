import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";
import { planLogoUpload } from "@/lib/logos";

/**
 * /api/logos — staff read + add for public.brand_logos.
 *
 * The page is behind Microsoft login. This route uses the same x-user-email
 * check as the other admin APIs, then talks to Supabase with the service role.
 * Do not add a public INSERT policy or a public storage write policy — anon
 * and authenticated writes stay closed. The service role bypasses RLS.
 */

const BUCKET = "logos";

const COLUMNS = "id, name, slug, category, aliases, variants, source_url, width, height, created_at";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const { data, error } = await supabase
    .from("brand_logos")
    .select(COLUMNS)
    .order("name", { ascending: true });

  if (error) {
    console.error("[logos] list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PNG file is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const planned = planLogoUpload({
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? ""),
      aliasesRaw: String(form.get("aliases") ?? ""),
      bytes,
    });
    if (!planned.ok) {
      return NextResponse.json({ error: planned.error }, { status: 400 });
    }
    const { plan } = planned;

    const { data: existing, error: existingErr } = await supabase
      .from("brand_logos")
      .select("id")
      .eq("slug", plan.slug)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      return NextResponse.json({ error: `A logo named "${plan.name}" is already in the library` }, { status: 409 });
    }

    const path = `${plan.slug}.png`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) {
      const duplicate = /already exists|duplicate/i.test(upErr.message);
      if (duplicate) {
        return NextResponse.json({ error: "That logo file is already in storage" }, { status: 409 });
      }
      throw upErr;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { data, error } = await supabase
      .from("brand_logos")
      .insert({
        name: plan.name,
        slug: plan.slug,
        category: plan.category,
        aliases: plan.aliases,
        variants: { color: pub.publicUrl },
        width: plan.width,
        height: plan.height,
      })
      .select(COLUMNS)
      .single();

    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      if (error.code === "23505") {
        return NextResponse.json({ error: `A logo named "${plan.name}" is already in the library` }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[logos] upload failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
