"use client";

import { useState, useRef, useCallback } from "react";
import { Check, Upload } from "lucide-react";
import { ExtractedDealData } from "@/lib/flow/types";
import { Button, Spinner, cn } from "@/components/ui";

// Allowed file types
const ACCEPT = ".pdf,.docx,.doc";
const ACCEPT_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

type DropState = "idle" | "dragging" | "extracting" | "done" | "error";

interface FileDropZoneProps {
  /** Called with extracted fields after AI parsing completes */
  onExtracted: (data: ExtractedDealData) => void;
  /** Called with the raw file after successful extraction — for SharePoint upload */
  onFileReady?: (file: File) => void;
  /** Compact single-line layout for edit mode */
  compact?: boolean;
}

// Drop zone border/background per state. Green = dragging (selected) / done (success); red = error.
function zoneClasses(state: DropState): string {
  return state === "dragging"
    ? "border-accent bg-accent-soft cursor-copy"
    : state === "extracting"
      ? "border-border-strong bg-surface-2 cursor-wait"
      : state === "done"
        ? "border-accent/50 bg-accent-soft cursor-pointer"
        : state === "error"
          ? "border-danger/40 bg-danger-bg cursor-pointer"
          : "border-border bg-canvas hover:border-border-strong cursor-pointer";
}

export default function FileDropZone({ onExtracted, onFileReady, compact }: FileDropZoneProps) {
  const [state, setState] = useState<DropState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Process a selected file — read as base64, send to extract API
  const processFile = useCallback(
    async (file: File) => {
      // Validate file type
      if (!ACCEPT_MIME.includes(file.type) && !file.name.match(/\.(pdf|docx|doc)$/i)) {
        setState("error");
        setErrorMsg("Only PDF and Word documents are supported.");
        return;
      }

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setState("error");
        setErrorMsg("File too large. Maximum 10MB.");
        return;
      }

      setFileName(file.name);
      setState("extracting");
      setErrorMsg("");

      try {
        // Read file as base64
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        // Send to extract API (flow-scoped route)
        const res = await fetch("/api/flow/deals/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, data: base64 }),
        });

        if (!res.ok) {
          // Error body may not be JSON (e.g. a 413 from the hosting platform's body-size limit)
          let message = `Extraction failed (HTTP ${res.status})`;
          try {
            const err = await res.json();
            message = err.error || message;
          } catch {
            if (res.status === 413) {
              message = "File too large to upload — try a smaller PDF.";
            }
          }
          throw new Error(message);
        }

        const extracted: ExtractedDealData = await res.json();
        setState("done");
        onExtracted(extracted);
        // Pass the raw file up for SharePoint upload
        onFileReady?.(file);
      } catch (err) {
        console.error("[FileDropZone] Extraction failed:", err);
        setState("error");
        setErrorMsg(err instanceof Error ? err.message : "Extraction failed");
      }
    },
    [onExtracted, onFileReady]
  );

  // Drag event handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => (prev === "extracting" || prev === "done" ? prev : "dragging"));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => (prev === "extracting" || prev === "done" ? prev : "idle"));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // Click-to-browse handler
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // Reset to try another file
  const handleReset = () => {
    setState("idle");
    setFileName("");
    setErrorMsg("");
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Compact mode (single-line, reduced padding for edit forms) ──
  if (compact) {
    return (
      <div className="mb-4">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => state !== "extracting" && inputRef.current?.click()}
          className={cn("border border-dashed rounded-control px-3 py-2 transition-colors duration-150 flex items-center", zoneClasses(state))}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleFileChange}
            className="hidden"
          />

          {state === "idle" && (
            <div className="flex items-center gap-2 w-full">
              <Upload size={16} strokeWidth={1.75} className="flex-shrink-0 text-text-3" />
              <p className="text-xs text-text-2">
                <span className="font-medium text-text">Drop a document</span> to update fields (LOI, PSA, etc.)
              </p>
            </div>
          )}

          {state === "dragging" && (
            <p className="text-xs font-medium text-accent-strong">Drop to extract</p>
          )}

          {state === "extracting" && (
            <div className="flex items-center gap-2">
              {/* Spinner primitive replaces the hand-rolled spinning div */}
              <Spinner size="sm" />
              <p className="text-xs text-text">
                Extracting from <span className="font-medium">{fileName}</span>...
              </p>
            </div>
          )}

          {state === "done" && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Check size={16} strokeWidth={2.5} className="text-accent" />
                <p className="text-xs text-text">
                  Updated from <span className="font-medium">{fileName}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleReset(); }}>
                Try another
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-danger-fg">{errorMsg}</p>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleReset(); }}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full mode (original layout for new deal creation) ──
  return (
    <div className="mb-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => state !== "extracting" && inputRef.current?.click()}
        className={cn("border-2 border-dashed rounded-card px-4 py-6 text-center transition-colors duration-150", zoneClasses(state))}
      >
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* State-specific content */}
        {state === "idle" && (
          <div className="flex flex-col items-center gap-1">
            {/* Upload icon */}
            <Upload size={24} strokeWidth={1.75} className="mb-1 text-text-3" />
            <p className="text-sm text-text-2">
              <span className="font-medium text-text">Drop a document</span> or click to browse
            </p>
            <p className="text-xs text-text-3">PDF or Word — LOI, PSA, escrow timeline</p>
          </div>
        )}

        {state === "dragging" && (
          <div className="flex flex-col items-center gap-1">
            <Upload size={24} strokeWidth={2} className="mb-1 text-accent" />
            <p className="text-sm font-medium text-accent-strong">Drop to extract</p>
          </div>
        )}

        {state === "extracting" && (
          <div className="flex items-center justify-center gap-3">
            <Spinner size="sm" />
            <p className="text-sm text-text">
              Extracting from <span className="font-medium">{fileName}</span>...
            </p>
          </div>
        )}

        {state === "done" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Check icon */}
              <Check size={18} strokeWidth={2.5} className="text-accent" />
              <p className="text-sm text-text">
                Fields extracted from <span className="font-medium">{fileName}</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
            >
              Try another
            </Button>
          </div>
        )}

        {state === "error" && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-danger-fg">{errorMsg}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
