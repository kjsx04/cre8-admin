"use client";

import { useState, useRef } from "react";
import { ChevronDown, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button, Card, StatusDot, Textarea, cn } from "@/components/ui";

interface AIAssistBarProps {
  docTypeId: string;
  cmsContext: {
    sellerBroker: { name: string; email: string; phone: string } | null;
    cre8Broker: { name: string; email: string; phone: string } | null;
    listing: { name: string; address: string } | null;
  };
  onExtracted: (variables: Record<string, string>) => void;
  onExtracting: (isExtracting: boolean) => void;
}

// Cycling status messages during extraction
const STATUS_MESSAGES = [
  "Reading deal terms...",
  "Extracting variables...",
  "Analyzing terms...",
];

export default function AIAssistBar({
  docTypeId,
  cmsContext,
  onExtracted,
  onExtracting,
}: AIAssistBarProps) {
  const [rawInput, setRawInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start cycling status messages
  function startStatusCycle() {
    let index = 0;
    setStatusMessage(STATUS_MESSAGES[0]);
    statusIntervalRef.current = setInterval(() => {
      index = (index + 1) % STATUS_MESSAGES.length;
      setStatusMessage(STATUS_MESSAGES[index]);
    }, 2000);
  }

  // Stop cycling status messages
  function stopStatusCycle() {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    setStatusMessage("");
  }

  // Handle Extract button click
  async function handleExtract() {
    if (!rawInput.trim()) return;

    setIsExtracting(true);
    setError("");
    onExtracting(true);
    startStatusCycle();

    try {
      const res = await fetch("/api/docs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docTypeId,
          rawInput,
          cmsContext: {
            sellerBroker: cmsContext.sellerBroker || null,
            cre8Broker: cmsContext.cre8Broker || null,
            listing: cmsContext.listing || null,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Extraction failed");
      }

      const result = await res.json();

      // Build flat variables from the extraction result (token → value)
      const flatVars: Record<string, string> = {};
      for (const [token, data] of Object.entries(result.variables || {})) {
        const extracted = data as { value: string };
        if (extracted.value) {
          flatVars[token] = extracted.value;
        }
      }

      onExtracted(flatVars);
    } catch (err) {
      console.error("AI extraction error:", err);
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setIsExtracting(false);
      onExtracting(false);
      stopStatusCycle();
    }
  }

  // Handle photo/image upload — reads image as base64, sends description to extract
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file and append info to the textarea
    const text = `[Uploaded image: ${file.name}] — Please extract deal terms from this document.`;
    setRawInput((prev) => (prev ? `${prev}\n${text}` : text));

    // Clear the input so the same file can be re-selected
    e.target.value = "";
  }

  return (
    // Card primitive, flush padding so the header row can be a full-width toggle
    <Card padding="none" className="overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Green dot = "AI available" status */}
          <StatusDot tone="success" />
          <span className="text-text text-sm font-semibold">AI assist</span>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={cn("text-text-2 transition-transform duration-200", !collapsed && "rotate-180")}
        />
      </button>

      {/* Body — shown when expanded */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* Textarea — shared primitive, same value/onChange/placeholder/disabled */}
          <Textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={
              docTypeId.startsWith("listing_")
                ? "Paste owner info, property details, price, and term dates..."
                : "Describe your deal — buyer, seller, property, price, terms..."
            }
            rows={3}
            disabled={isExtracting}
            className="text-sm"
          />

          {/* Action buttons row */}
          <div className="flex items-center gap-2">
            {/* Extract button (primary — black is action) */}
            <Button
              onClick={handleExtract}
              disabled={!rawInput.trim() || isExtracting}
              loading={isExtracting}
              icon={<Sparkles size={18} strokeWidth={1.75} />}
              className="flex-1"
            >
              {isExtracting
                ? statusMessage
                : docTypeId.startsWith("listing_")
                  ? "Extract fields"
                  : "Update LOI"}
            </Button>

            {/* Photo button — file input for image/document */}
            <label
              title="Upload photo or document"
              className={cn(
                "inline-flex items-center justify-center w-control h-control rounded-control",
                "bg-surface text-text-2 border border-border hover:bg-surface-2 hover:text-text transition-colors cursor-pointer shrink-0",
                isExtracting && "opacity-40 pointer-events-none"
              )}
            >
              <ImageIcon size={18} strokeWidth={1.75} />
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-danger-fg text-xs">{error}</p>
          )}

        </div>
      )}
    </Card>
  );
}
