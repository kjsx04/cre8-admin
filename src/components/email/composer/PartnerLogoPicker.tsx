"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { FieldProps } from "./fieldProps";
import {
  loadImage,
  imageToCanvas,
  cloneCanvas,
  hasTransparency,
  removeBackground,
  makeWhite,
  trimTransparent,
  canvasToDataUrl,
  canvasToPngBlob,
} from "@/lib/email/logo-image";

interface PartnerLogoPickerProps {
  /** Saved (hosted) logo URL, or a data: URL while adjusting, or "" */
  url: string;
  /** Live preview while adjusting — data URL + its pixel size */
  onPreview: (dataUrl: string, width: number, height: number) => void;
  /** Uploaded and ready */
  onApply: (result: { url: string; width: number; height: number }) => void;
  onRemove: () => void;
  fieldProps: FieldProps;
}

const MAX_FILE = 4 * 1024 * 1024;

/**
 * Section 3 — Partner Logo (optional).
 * Drop a PNG or JPEG → clean it up on a dark swatch (remove white background,
 * make it white) → Apply uploads the processed PNG and puts it in the header
 * next to the CRE8 logo.
 */
export default function PartnerLogoPicker({ url, onPreview, onApply, onRemove, fieldProps }: PartnerLogoPickerProps) {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null); // untouched upload
  const [removeBg, setRemoveBg] = useState(false);
  const [tolerance, setTolerance] = useState(30);
  const [white, setWhite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const processedRef = useRef<HTMLCanvasElement | null>(null);

  const adjusting = !!source;               // a file is chosen and not yet applied
  const hasSaved = !!url && !url.startsWith("data:");

  // ── Pick a file (drop, click, or paste) ──
  // Anything the browser can draw on a canvas is fine as INPUT — it always leaves as a PNG.
  async function handleFile(file: File) {
    setError(null);
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
      setError("That isn't an image — try PNG, JPEG, WebP or SVG");
      return;
    }
    if (file.size > MAX_FILE) {
      setError("Keep it under 4 MB");
      return;
    }
    try {
      const img = await loadImage(file);
      const canvas = imageToCanvas(img);
      // JPEGs never have transparency; PNGs/others on a solid background don't either → auto-on
      setRemoveBg(file.type === "image/jpeg" || !hasTransparency(canvas));
      setWhite(false);
      setTolerance(30);
      setSource(canvas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image");
    }
  }

  // ── Paste: an image from the clipboard, or an image link ──
  async function handlePastedUrl(text: string) {
    const url = text.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return false;
    setError(null);
    setFetching(true);
    try {
      const res = await fetch(`/api/email/assets/fetch?url=${encodeURIComponent(url)}`, {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't fetch that link");
      }
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
      await handleFile(new File([blob], `pasted-logo.${ext}`, { type: blob.type }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't fetch that link");
    } finally {
      setFetching(false);
    }
    return true;
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      // Don't hijack pastes into text fields elsewhere on the page
      const active = document.activeElement as HTMLElement | null;
      const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && !rootRef.current?.contains(active);
      if (typing) return;

      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (imageItem) {
        const f = imageItem.getAsFile();
        if (f) {
          e.preventDefault();
          handleFile(f);
        }
        return;
      }
      const text = e.clipboardData?.getData("text/plain") || "";
      if (/^https?:\/\/\S+$/i.test(text.trim())) {
        e.preventDefault();
        handlePastedUrl(text);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  // ── Re-process whenever a toggle changes; push a live preview to the email ──
  useEffect(() => {
    if (!source) return;
    const c = cloneCanvas(source);
    if (removeBg) removeBackground(c, tolerance);
    if (white) makeWhite(c);
    const trimmed = trimTransparent(c);
    processedRef.current = trimmed;
    onPreview(canvasToDataUrl(trimmed), trimmed.width, trimmed.height);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, removeBg, tolerance, white]);

  // ── Upload the processed PNG ──
  async function apply() {
    const c = processedRef.current;
    if (!c) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await canvasToPngBlob(c);
      if (blob.size > 2 * 1024 * 1024) throw new Error("Processed logo is over 2 MB — try a smaller image");
      const form = new FormData();
      form.append("file", blob, "logo.png");
      const res = await fetch("/api/email/assets", {
        method: "POST",
        headers: { "x-user-email": userEmail },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onApply({ url: data.url, width: c.width, height: c.height });
      setSource(null);
      processedRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setSource(null);
    processedRef.current = null;
    setError(null);
    onRemove();
  }

  const previewSrc = adjusting ? url : hasSaved ? url : "";

  return (
    <div
      {...fieldProps("partner")}
      ref={(el) => {
        fieldProps("partner").ref(el);
        rootRef.current = el as HTMLDivElement | null;
      }}
      tabIndex={-1}
      className="outline-none space-y-3"
    >
      {/* Drop zone (only when nothing is chosen/saved) */}
      {!adjusting && !hasSaved && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-btn border border-dashed px-4 py-5 text-center transition-colors ${
            dragOver ? "border-green bg-[#F0F9E5]" : "border-border-medium hover:border-muted-gray"
          }`}
        >
          <p className="text-sm text-charcoal">{fetching ? "Fetching…" : "Drop, paste, or click to choose a logo"}</p>
          <p className="text-[11px] text-muted-gray mt-0.5">Paste a copied image or an image link · optional · goes next to the CRE8 logo</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {/* Swatch — the logo as it will look on the dark header */}
      {previewSrc && (
        <div className="relative rounded-card bg-[#1A1A1A] px-5 py-4 flex items-center justify-center min-h-[72px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt="Partner logo" className="max-h-10 max-w-[200px] object-contain" />
          {/* Small × in the corner — removes the logo (or cancels while adjusting) */}
          <button
            type="button"
            onClick={clear}
            title={adjusting ? "Cancel" : "Remove logo"}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/15 hover:bg-white/30 text-white text-xs leading-none flex items-center justify-center transition-colors"
          >
            &times;
          </button>
        </div>
      )}

      {/* Cleanup controls while adjusting */}
      {adjusting && (
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
            <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="accent-[#8CC644]" />
            Remove white background
          </label>
          {removeBg && (
            <div className="flex items-center gap-3 pl-6">
              <span className="text-[11px] text-muted-gray w-16">Tolerance</span>
              <input
                type="range"
                min={5}
                max={80}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="flex-1 accent-[#8CC644]"
              />
              <span className="text-[11px] text-muted-gray w-6 text-right">{tolerance}</span>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
            <input type="checkbox" checked={white} onChange={(e) => setWhite(e.target.checked)} className="accent-[#8CC644]" />
            Make it white
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={apply}
              disabled={uploading}
              className="px-4 py-1.5 bg-green text-black text-sm font-semibold rounded-btn hover:brightness-110 transition disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Apply"}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="px-3 py-1.5 text-sm text-charcoal hover:bg-light-gray rounded-btn">
              Choose another
            </button>
            <button type="button" onClick={clear} className="px-3 py-1.5 text-sm text-muted-gray hover:text-charcoal rounded-btn">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved state */}
      {hasSaved && !adjusting && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="px-3 py-1.5 text-sm text-charcoal bg-white border border-border-light rounded-btn hover:bg-light-gray">
            Replace
          </button>
          <span className="text-[11px] text-muted-gray">or paste a new one</span>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
