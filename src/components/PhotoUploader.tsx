"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Image as ImageIcon } from "lucide-react";
import type { GalleryImage } from "@/components/PackageUploader";
import { Field, cn, useToast } from "@/components/ui";

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
  // Toast replaces the old browser popup for the "file too large" message
  const toast = useToast();

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
        toast.error("Some photos were skipped — over 4MB", { description: tooLarge.join(", ") });
      }

      if (newImages.length > 0) {
        const merged = [...galleryImages, ...newImages];
        onChangeRef.current(merged, marketingIdx);
      }
    },
    [galleryImages, marketingIdx, toast]
  );

  // Count non-PDF photos
  const photoCount = galleryImages.filter((img) => !img.fromPdf).length;

  return (
    <Field label="Additional photos">
      {/* Drop zone — green border only while a file is being dragged over (active state) */}
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
        className={cn(
          "border-2 border-dashed rounded-control px-4 py-5 text-center cursor-pointer transition-colors",
          dragOver ? "border-accent bg-accent-soft" : "border-border-strong hover:border-text-3"
        )}
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
        <ImageIcon size={20} strokeWidth={1.75} className="mx-auto mb-1.5 text-text-3" />
        <p className="text-sm text-text-2">
          {photoCount > 0
            ? `${photoCount} photo${photoCount > 1 ? "s" : ""} added — click to add more`
            : "Drop images here or click to browse"}
        </p>
        <p className="text-xs text-text-3 mt-0.5">
          JPG, PNG accepted — max 4MB each
        </p>
      </div>
    </Field>
  );
}
