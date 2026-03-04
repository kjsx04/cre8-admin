"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { GalleryImage } from "@/components/PackageUploader";

/* ============================================================
   Multi-file image uploader — adds photos to the gallery.
   Photos merge into the existing gallery (after PDF pages).
   ============================================================ */
interface PhotoUploaderProps {
  /** Current gallery images (shared with PackageUploader) */
  galleryImages: GalleryImage[];
  /** Called with updated gallery + marketing index */
  onChange: (images: GalleryImage[], marketingIdx: number) => void;
  /** Current marketing index */
  marketingIdx: number;
}

const MAX_PHOTO_SIZE = 4 * 1024 * 1024; // 4MB per photo

export default function PhotoUploader({
  galleryImages,
  onChange,
  marketingIdx,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Store onChange in ref
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const newImages: GalleryImage[] = [];
      const tooLarge: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_PHOTO_SIZE) {
          tooLarge.push(file.name);
          continue;
        }
        newImages.push({
          url: URL.createObjectURL(file),
          blob: file,
          name: file.name,
          fromPdf: false,
        });
      }

      if (tooLarge.length > 0) {
        alert(`These files exceed 4MB and were skipped:\n${tooLarge.join("\n")}`);
      }

      if (newImages.length > 0) {
        const merged = [...galleryImages, ...newImages];
        onChangeRef.current(merged, marketingIdx);
      }
    },
    [galleryImages, marketingIdx]
  );

  // Count non-PDF photos
  const photoCount = galleryImages.filter((img) => !img.fromPdf).length;

  return (
    <div>
      <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5">
        Additional Photos
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-btn px-4 py-5 text-center cursor-pointer transition-colors
          ${dragOver ? "border-green bg-[#F0F9E5]" : "border-[#DDD] hover:border-[#BBB]"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-lg mb-1">&#128247;</div>
        <p className="text-sm text-[#666]">
          {photoCount > 0
            ? `${photoCount} photo${photoCount > 1 ? "s" : ""} added — click to add more`
            : "Drop images here or click to browse"}
        </p>
        <p className="text-xs text-[#777] mt-0.5">
          JPG, PNG accepted — max 4MB each
        </p>
      </div>
    </div>
  );
}
