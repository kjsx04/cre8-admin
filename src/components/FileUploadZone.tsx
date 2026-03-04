"use client";

import { useRef, useState } from "react";

/* ============================================================
   Simple PDF upload zone — used for Alta Survey and Site Plan.
   Shows file name when selected, "Replace" on hover.
   ============================================================ */
interface FileUploadZoneProps {
  /** Label for the upload zone */
  label: string;
  /** Currently selected file (null if none) */
  file: File | null;
  /** Called when file is selected */
  onFileSelect: (file: File) => void;
  /** Existing file URL from Webflow (edit mode) */
  existingUrl?: string;
  /** Accepted file types */
  accept?: string;
  /** Max file size in bytes */
  maxSize?: number;
}

export default function FileUploadZone({
  label,
  file,
  onFileSelect,
  existingUrl,
  accept = ".pdf",
  maxSize = 10 * 1024 * 1024,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.size > maxSize) {
      alert(`File must be under ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }
    onFileSelect(f);
  };

  const hasFile = !!file;
  const hasExisting = !!existingUrl && !file;

  return (
    <div>
      <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5">
        {label}
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
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={`border-2 border-dashed rounded-btn px-4 py-5 text-center cursor-pointer transition-colors
          ${dragOver ? "border-green bg-[#F0F9E5]" : "border-[#DDD] hover:border-[#BBB]"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {hasFile ? (
          <div>
            <div className="text-lg mb-1">&#128196;</div>
            <p className="text-sm text-[#333] font-medium truncate">
              {file.name}
            </p>
            <p className="text-xs text-[#777] mt-0.5">Click to replace</p>
          </div>
        ) : hasExisting ? (
          <div>
            <div className="text-lg mb-1">&#128196;</div>
            <p className="text-sm text-[#333]">Existing file on record</p>
            <p className="text-xs text-[#777] mt-0.5">Click to replace</p>
          </div>
        ) : (
          <div>
            <div className="text-lg mb-1">&#11014;</div>
            <p className="text-sm text-[#666]">Drop PDF here</p>
          </div>
        )}
      </div>
      {hasExisting && (
        <a
          href={existingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-green hover:underline mt-1 inline-block"
        >
          View existing file
        </a>
      )}
    </div>
  );
}
