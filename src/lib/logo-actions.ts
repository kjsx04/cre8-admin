import { logoFileName, type LogoVariant } from "@/lib/logos";

export { logoFileName };

/** Fetch the full-res PNG. Storage sends Access-Control-Allow-Origin: *. */
export async function fetchPngBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't fetch that logo");
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  return new Blob([await blob.arrayBuffer()], { type: "image/png" });
}

/** Fetch the PNG, then save it. Color files download as `<slug>.png`. */
export async function downloadLogoPng(url: string, slug: string, variant: LogoVariant): Promise<void> {
  const blob = await fetchPngBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = logoFileName(slug, variant);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Put image/png on the clipboard. The promise form keeps the click's user gesture. */
export async function copyLogoPng(url: string): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error("Clipboard isn't available in this browser");
  }
  const png = fetchPngBlob(url);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
