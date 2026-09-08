import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";

/**
 * GET /api/email/assets/fetch?url=… — fetch an image from another site on the
 * browser's behalf so the logo cleanup can read its pixels (browsers block
 * reading cross-origin images on a canvas). Used when a logo URL is pasted.
 *
 * Only http(s), only image types, max 6 MB, 10s timeout.
 */
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;

  const url = request.nextUrl.searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(url);
    if (!/^https?:$/.test(target.protocol)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Not a valid image link" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (CRE8 Admin logo fetch)", Accept: "image/*" },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ error: `That link returned ${res.status}` }, { status: 400 });
    }
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.test(type)) {
      return NextResponse.json({ error: "That link isn't an image" }, { status: 400 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "Image is over 6 MB" }, { status: 400 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({ error: aborted ? "That link took too long" : "Couldn't fetch that link" }, { status: 400 });
  }
}
