"use client";

import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Field, useToast, cn } from "@/components/ui";

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
  // Toast (not a native browser dialog) for the size check
  const toast = useToast();

  const handleFile = (f: File) => {
    if (f.size > maxSize) {
      toast.error(`File must be under ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }
    onFileSelect(f);
  };

  const hasFile = !!file;
  const hasExisting = !!existingUrl && !file;

  return (
    // Field primitive supplies the label; the "View existing file" link sits in its action slot
    <Field
      label={label}
      action={
        hasExisting ? (
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-2 hover:text-text hover:underline"
          >
            View existing file
          </a>
        ) : undefined
      }
    >
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
        className={cn(
          "border-2 border-dashed rounded-control px-4 py-5 text-center cursor-pointer transition-colors",
          // Green = "drop is active" (selected state), otherwise neutral hairline
          dragOver ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"
        )}
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
          <div className="flex flex-col items-center">
            <FileText size={20} strokeWidth={1.75} className="text-text-2 mb-1" />
            <p className="text-sm text-text font-medium truncate max-w-full">
              {file.name}
            </p>
            <p className="text-xs text-text-3 mt-0.5">Click to replace</p>
          </div>
        ) : hasExisting ? (
          <div className="flex flex-col items-center">
            <FileText size={20} strokeWidth={1.75} className="text-text-2 mb-1" />
            <p className="text-sm text-text">Existing file on record</p>
            <p className="text-xs text-text-3 mt-0.5">Click to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload size={20} strokeWidth={1.75} className="text-text-3 mb-1" />
            <p className="text-sm text-text-2">Drop PDF here</p>
          </div>
        )}
      </div>
    </Field>
  );
}
