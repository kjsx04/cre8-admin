"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { FieldProps } from "./fieldProps";

interface PhotoPickerProps {
  /** Listing gallery (may be empty when the listing isn't in the CMS) */
  gallery: { url: string; alt?: string }[];
  photoUrl: string;
  onChange: (url: string) => void;
  fieldProps: FieldProps;
}

/**
 * Hero photo — 2-up grid of the listing's gallery, click to choose.
 * A small link reveals a URL box for a photo that isn't in the gallery.
 */
export default function PhotoPicker({ gallery, photoUrl, onChange, fieldProps }: PhotoPickerProps) {
  const [showUrl, setShowUrl] = useState(false);

  return (
    <div {...fieldProps("photo")} tabIndex={-1} className="outline-none">
      {gallery.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {gallery.map((img, i) => {
            const active = photoUrl === img.url;
            return (
              // Photo tile — green ring + check = selected (status)
              <button
                key={i}
                type="button"
                onClick={() => onChange(img.url)}
                className={`relative aspect-[4/3] rounded-control overflow-hidden transition-all duration-150 ${
                  active
                    ? "ring-[3px] ring-accent ring-offset-2 opacity-100"
                    : "opacity-75 hover:opacity-100 ring-1 ring-border"
                }`}
                title={img.alt || `Photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt || `Listing photo ${i + 1}`} className="w-full h-full object-cover" />
                {active && (
                  <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent text-black flex items-center justify-center">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* URL box: always when there's no gallery, otherwise behind a small link */}
      {gallery.length === 0 || showUrl ? (
        <div className={gallery.length > 0 ? "mt-3" : ""}>
          <Input
            value={photoUrl}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Photo URL"
          />
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowUrl(true)} className="mt-2 -ml-2">
          Paste a photo URL instead
        </Button>
      )}
    </div>
  );
}
