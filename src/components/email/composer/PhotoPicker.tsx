"use client";

import { useState } from "react";
import { FieldProps } from "./fieldProps";

interface PhotoPickerProps {
  /** Listing gallery (may be empty when the listing isn't in the CMS) */
  gallery: { url: string; alt?: string }[];
  photoUrl: string;
  onChange: (url: string) => void;
  fieldProps: FieldProps;
}

const INPUT = "w-full border border-border-light rounded-btn px-3 py-2 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green";

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
              <button
                key={i}
                type="button"
                onClick={() => onChange(img.url)}
                className={`relative aspect-[4/3] rounded-md overflow-hidden transition-all duration-150 ${
                  active
                    ? "ring-[3px] ring-green ring-offset-2 opacity-100"
                    : "opacity-75 hover:opacity-100 ring-1 ring-border-light"
                }`}
                title={img.alt || `Photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt || `Listing photo ${i + 1}`} className="w-full h-full object-cover" />
                {active && (
                  <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green text-black flex items-center justify-center shadow">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* URL box: always when there's no gallery, otherwise behind a small link */}
      {gallery.length === 0 || showUrl ? (
        <input
          value={photoUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Photo URL"
          className={`${INPUT} ${gallery.length > 0 ? "mt-3" : ""} text-xs`}
        />
      ) : (
        <button type="button" onClick={() => setShowUrl(true)} className="mt-2 text-[11px] text-muted-gray hover:text-charcoal">
          Paste a photo URL instead
        </button>
      )}
    </div>
  );
}
