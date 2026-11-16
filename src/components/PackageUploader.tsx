"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/* ============================================================
   TYPES
   ============================================================ */
export interface GalleryImage {
  /** Object URL for preview (or existing Webflow URL) */
  url: string;
  /** Raw blob for upload (null if existing asset) */
  blob: Blob | null;
  /** Page number (from PDF conversion) */
  pageNum?: number;
  /** Whether this came from a PDF conversion */
  fromPdf?: boolean;
  /** Display name */
  name: string;
  /** Whether this is an existing Webflow asset (don't re-upload) */
  isExisting?: boolean;
}

export interface PackageAssets {
  /** The raw PDF file selected by the user (null if not changed) */
  packageFile: File | null;
  /** Gallery images — from PDF pages + additional photos */
  galleryImages: GalleryImage[];
  /** Index of the image to use as marketing/floorplan pic */
  marketingIdx: number;
}

interface PackageUploaderProps {
  assets: PackageAssets;
  onChange: (assets: PackageAssets) => void;
  /** Existing package PDF URL (edit mode) */
  existingPackageUrl?: string;
}

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

/* ------------------------------------------------------------
   Webflow's CMS image fields reject anything over 4MB. The catch
   is that it fails SILENTLY — the upload succeeds, but Webflow
   drops that image from the gallery/marketing field, so the
   listing keeps showing the previous package with no error.
   Large-format brochure pages (wide Illustrator artboards) render
   to 5-6MB JPGs at the old fixed 2x scale, which is exactly how
   that happens. So every page we render is capped on BOTH
   dimensions and file size before it ever leaves the browser.
   ------------------------------------------------------------ */
const MAX_IMAGE_SIZE = 3.5 * 1024 * 1024; // stay comfortably under Webflow's 4MB
const TARGET_LONG_EDGE = 2400; // px — plenty for the full-screen lightbox
const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45]; // tried in order until it fits

/** Canvas → JPEG blob at a given quality */
function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality)
  );
}

/**
 * Renders one PDF page to a JPEG that Webflow will actually accept.
 *
 * 1. Picks a scale so the long edge lands near TARGET_LONG_EDGE
 *    (never upscales past 2x — small pages behave exactly as before).
 * 2. Encodes at decreasing quality until the file is under MAX_IMAGE_SIZE.
 * 3. If even the lowest quality is too big, re-renders at 70% of the
 *    dimensions and tries again (repeats up to 3 times).
 */
async function renderPageToJpeg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any
): Promise<Blob> {
  // Natural page size in PDF points (scale 1)
  const base = page.getViewport({ scale: 1 });
  const longEdge = Math.max(base.width, base.height);
  let scale = Math.min(2, TARGET_LONG_EDGE / longEdge);

  for (let attempt = 0; attempt < 4; attempt++) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    let blob: Blob | null = null;
    for (const q of JPEG_QUALITIES) {
      blob = await canvasToJpeg(canvas, q);
      if (blob.size <= MAX_IMAGE_SIZE) return blob;
    }

    // Still too big at the lowest quality — shrink and try the whole thing again
    scale *= 0.7;
    if (attempt === 3 && blob) return blob; // give up gracefully rather than hang
  }

  // Unreachable in practice, but keeps TypeScript happy
  return canvasToJpeg(document.createElement("canvas"), 0.5);
}

/* ============================================================
   COMPONENT
   ============================================================ */
export default function PackageUploader({
  assets,
  onChange,
  existingPackageUrl,
}: PackageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Store onChange in ref
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ---- Handle PDF file selection ----
  const handlePdfFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_PDF_SIZE) {
        alert("PDF must be under 10MB");
        return;
      }
      if (!file.type.includes("pdf")) {
        alert("Please select a PDF file");
        return;
      }

      setConverting(true);
      setProgress("Loading PDF...");

      try {
        // Dynamic import of pdf.js (heavy library — only load when needed)
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        // Read file into array buffer
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

        const images: GalleryImage[] = [];
        const baseName = file.name.replace(/\.pdf$/i, "");

        // Convert each page to JPG
        for (let p = 1; p <= pdf.numPages; p++) {
          setProgress(`Converting page ${p} of ${pdf.numPages}...`);
          const page = await pdf.getPage(p);

          // Render + compress so the result is always under Webflow's 4MB
          // image limit (see MAX_IMAGE_SIZE note above)
          const blob = await renderPageToJpeg(page);

          images.push({
            url: URL.createObjectURL(blob),
            blob,
            pageNum: p,
            fromPdf: true,
            name: `${baseName}-p${p}.jpg`,
          });
        }

        // Keep non-PDF images (additional photos), replace PDF images
        const nonPdfImages = assets.galleryImages.filter((img) => !img.fromPdf);
        const newAssets: PackageAssets = {
          packageFile: file,
          galleryImages: [...images, ...nonPdfImages],
          marketingIdx: 0,
        };
        onChangeRef.current(newAssets);
      } catch (err) {
        console.error("PDF conversion failed:", err);
        alert("Failed to convert PDF. Please try again.");
      } finally {
        setConverting(false);
        setProgress("");
      }
    },
    [assets.galleryImages]
  );

  // ---- Drag & drop handlers ----
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handlePdfFile(file);
    },
    [handlePdfFile]
  );

  // ---- Preview grid actions ----
  const setStar = useCallback(
    (idx: number) => {
      onChangeRef.current({ ...assets, marketingIdx: idx });
    },
    [assets]
  );

  const removeImage = useCallback(
    (idx: number) => {
      const img = assets.galleryImages[idx];
      if (img && !img.isExisting) URL.revokeObjectURL(img.url);
      const newImages = assets.galleryImages.filter((_, i) => i !== idx);
      let newMarketingIdx = assets.marketingIdx;
      if (newMarketingIdx >= newImages.length) {
        newMarketingIdx = Math.max(0, newImages.length - 1);
      } else if (idx < newMarketingIdx) {
        newMarketingIdx--;
      }
      onChangeRef.current({
        ...assets,
        galleryImages: newImages,
        marketingIdx: newMarketingIdx,
      });
    },
    [assets]
  );

  // ---- Drag reorder ----
  const dragIdx = useRef<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx;
  }, []);

  const handleDragDrop = useCallback(
    (dropIdx: number) => {
      if (dragIdx.current === null || dragIdx.current === dropIdx) return;
      const newImages = [...assets.galleryImages];
      const [moved] = newImages.splice(dragIdx.current, 1);
      newImages.splice(dropIdx, 0, moved);

      // Update marketing index to follow the starred image
      let newMarketingIdx = assets.marketingIdx;
      if (dragIdx.current === assets.marketingIdx) {
        newMarketingIdx = dropIdx;
      } else if (
        dragIdx.current < assets.marketingIdx &&
        dropIdx >= assets.marketingIdx
      ) {
        newMarketingIdx--;
      } else if (
        dragIdx.current > assets.marketingIdx &&
        dropIdx <= assets.marketingIdx
      ) {
        newMarketingIdx++;
      }

      dragIdx.current = null;
      onChangeRef.current({
        ...assets,
        galleryImages: newImages,
        marketingIdx: newMarketingIdx,
      });
    },
    [assets]
  );

  const hasPackage = assets.packageFile || existingPackageUrl;
  const hasImages = assets.galleryImages.length > 0;

  return (
    <div>
      {/* Upload zone */}
      <div
        onClick={() => !converting && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-btn px-6 py-8 text-center cursor-pointer transition-colors
          ${dragOver ? "border-green bg-[#F0F9E5]" : "border-[#DDD] hover:border-[#BBB]"}
          ${converting ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePdfFile(file);
            e.target.value = "";
          }}
        />
        {converting ? (
          <div>
            <div className="text-2xl mb-2">&#9203;</div>
            <p className="text-sm text-[#666]">{progress}</p>
          </div>
        ) : hasPackage && !hasImages ? (
          <div>
            <div className="text-2xl mb-2">&#128196;</div>
            <p className="text-sm text-[#333] font-medium">
              {assets.packageFile?.name || "Package PDF"}
            </p>
            <p className="text-xs text-[#777] mt-1">
              Click or drop to replace
            </p>
          </div>
        ) : (
          <div>
            <div className="text-2xl mb-2">&#11014;</div>
            <p className="text-sm text-[#666]">
              Drop PDF here or click to browse
            </p>
            <p className="text-xs text-[#777] mt-1">
              Auto-converts to JPG previews (max 10MB)
            </p>
          </div>
        )}
      </div>

      {/* Existing package indicator (edit mode, no new upload) */}
      {existingPackageUrl && !assets.packageFile && !hasImages && (
        <div className="flex items-center gap-2 mt-2 text-xs text-[#777]">
          <span>&#128196;</span>
          <span>Existing package on file</span>
          <a
            href={existingPackageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green hover:underline"
          >
            View
          </a>
        </div>
      )}

      {/* Preview grid */}
      {hasImages && (
        <div className="grid grid-cols-4 gap-3 mt-4">
          {assets.galleryImages.map((img, idx) => {
            const isMarketing = idx === assets.marketingIdx;
            return (
              <div
                key={`${img.name}-${idx}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDragDrop(idx);
                }}
                className={`relative rounded-btn overflow-hidden border-2 cursor-grab active:cursor-grabbing
                  ${isMarketing ? "border-green" : "border-[#E5E5E5]"}`}
              >
                {/* Image thumbnail */}
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full aspect-[4/3] object-cover"
                />

                {/* Page number badge */}
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {img.pageNum ? `P${img.pageNum}` : idx + 1}
                </div>

                {/* Star button (set as marketing pic) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStar(idx);
                  }}
                  className={`absolute top-1 right-7 w-6 h-6 rounded flex items-center justify-center text-sm
                    ${isMarketing ? "bg-green text-black" : "bg-black/40 text-white/70 hover:text-white"}`}
                  title="Set as marketing image"
                >
                  &#9733;
                </button>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(idx);
                  }}
                  className="absolute top-1 right-1 w-6 h-6 rounded bg-black/40 text-white/70
                             hover:text-white hover:bg-[#CC3333] flex items-center justify-center text-xs"
                  title="Remove"
                >
                  &#10005;
                </button>

                {/* Marketing label */}
                {isMarketing && (
                  <div className="absolute bottom-1 right-1 bg-green text-black text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                    Marketing
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
