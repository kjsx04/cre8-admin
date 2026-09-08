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
  const inputRef = useRef<HTMLInputElement>(null);
  const processedRef = useRef<HTMLCanvasElement | null>(null);

  const adjusting = !!source;               // a file is chosen and not yet applied
  const hasSaved = !!url && !url.startsWith("data:");

  // ── Pick a file ──
  async function handleFile(file: File) {
    setError(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setError(file.type === "image/svg+xml" ? "SVG isn't supported in email — export a PNG" : "PNG or JPEG only");
      return;
    }
    if (file.size > MAX_FILE) {
      setError("Keep it under 4 MB");
      return;
    }
    try {
      const img = await loadImage(file);
      const canvas = imageToCanvas(img);
      // JPEGs never have transparency; PNGs on a solid background don't either → auto-on
      setRemoveBg(file.type === "image/jpeg" || !hasTransparency(canvas));
      setWhite(false);
      setTolerance(30);
      setSource(canvas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image");
    }
  }

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
    <div {...fieldProps("partner")} tabIndex={-1} className="outline-none space-y-3">
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
          <p className="text-sm text-charcoal">Drop a logo, or click to choose</p>
          <p className="text-[11px] text-muted-gray mt-0.5">PNG or JPEG · optional · goes next to the CRE8 logo</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {/* Swatch — the logo as it will look on the dark header */}
      {previewSrc && (
        <div className="rounded-card bg-[#1A1A1A] px-5 py-4 flex items-center justify-center min-h-[72px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt="Partner logo" className="max-h-10 max-w-[200px] object-contain" />
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
          <button type="button" onClick={clear} className="px-3 py-1.5 text-sm text-muted-gray hover:text-red-500 rounded-btn">
            Remove
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
