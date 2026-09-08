import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabase } from "@/lib/flow/supabase";
import { requireUser } from "@/lib/email/auth";

/**
 * POST /api/email/assets — upload a processed partner logo (PNG) to Supabase Storage.
 *
 * multipart/form-data with a single `file` field. PNG only, ≤ 2 MB.
 * Files land in the public bucket "email-assets" under partner-logos/<uuid>.png
 * and the response returns the public URL the email template will use.
 */
const BUCKET = "email-assets";
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    if (file.type !== "image/png") {
      return NextResponse.json({ error: "Logo must be a PNG" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logo must be under 2 MB" }, { status: 400 });
    }

    // Bucket is created once; every later call finds it
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 4 * 1024 * 1024,
        allowedMimeTypes: ["image/png"],
      });
      if (error && !/already exists/i.test(error.message)) throw error;
    }

    const path = `partner-logos/${randomUUID()}.png`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    console.error("[email assets] upload failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
