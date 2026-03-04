"use client";

import { useState, useRef, useCallback } from "react";
import { ExtractedDealData } from "@/lib/flow/types";

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
          const err = await res.json();
          throw new Error(err.error || "Extraction failed");
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
          className={`
            border border-dashed rounded-btn px-3 py-2 transition-colors duration-200 flex items-center
            ${state === "dragging"
              ? "border-green bg-green/5 cursor-copy"
              : state === "extracting"
                ? "border-border-medium bg-light-gray cursor-wait"
                : state === "done"
                  ? "border-green/50 bg-green/5 cursor-pointer"
                  : state === "error"
                    ? "border-red-300 bg-red-50 cursor-pointer"
                    : "border-border-light bg-subtle-gray hover:border-border-medium cursor-pointer"
            }
          `}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" className="flex-shrink-0">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-xs text-medium-gray">
                <span className="font-medium text-charcoal">Drop a document</span> to update fields (LOI, PSA, etc.)
              </p>
            </div>
          )}

          {state === "dragging" && (
            <p className="text-xs font-medium text-green">Drop to extract</p>
          )}

          {state === "extracting" && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-charcoal">
                Extracting from <span className="font-medium">{fileName}</span>...
              </p>
            </div>
          )}

          {state === "done" && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-xs text-charcoal">
                  Updated from <span className="font-medium">{fileName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleReset(); }}
                className="text-xs text-muted-gray hover:text-charcoal transition-colors"
              >
                Try another
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-red-600">{errorMsg}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleReset(); }}
                className="text-xs text-muted-gray hover:text-charcoal transition-colors"
              >
                Try again
              </button>
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
        className={`
          border-2 border-dashed rounded-card px-4 py-5 text-center transition-colors duration-200
          ${state === "dragging"
            ? "border-green bg-green/5 cursor-copy"
            : state === "extracting"
              ? "border-border-medium bg-light-gray cursor-wait"
              : state === "done"
                ? "border-green/50 bg-green/5 cursor-pointer"
                : state === "error"
                  ? "border-red-300 bg-red-50 cursor-pointer"
                  : "border-border-light bg-subtle-gray hover:border-border-medium cursor-pointer"
          }
        `}
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" className="mb-1">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-medium-gray">
              <span className="font-medium text-charcoal">Drop a document</span> or click to browse
            </p>
            <p className="text-xs text-muted-gray">PDF or Word — LOI, PSA, escrow timeline</p>
          </div>
        )}

        {state === "dragging" && (
          <div className="flex flex-col items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2" className="mb-1">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm font-medium text-green">Drop to extract</p>
          </div>
        )}

        {state === "extracting" && (
          <div className="flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-green border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-charcoal">
              Extracting from <span className="font-medium">{fileName}</span>...
            </p>
          </div>
        )}

        {state === "done" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Check icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-sm text-charcoal">
                Fields extracted from <span className="font-medium">{fileName}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              className="text-xs text-muted-gray hover:text-charcoal transition-colors"
            >
              Try another
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              className="text-xs text-muted-gray hover:text-charcoal transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
