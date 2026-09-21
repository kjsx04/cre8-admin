"use client";

import { useEffect, useMemo, useState } from "react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";
import { wrapPreviewHtml } from "@/lib/email/preview-wrapper";
import LivePreviewFrame from "./composer/LivePreviewFrame";
import TestSendControl from "./composer/TestSendControl";

interface EmailPreviewProps {
  campaign: Campaign | CampaignFormData;
  onClose: () => void;
}

/**
 * Read-only preview modal (used from the campaign detail panel).
 * Starts from the campaign row, then overlays live listing CMS fields
 * via /api/email/preview so photos/price match the listing.
 */
export default function EmailPreview({ campaign, onClose }: EmailPreviewProps) {
  const fallbackHtml = useMemo(
    () => wrapPreviewHtml(renderEmailHtml(buildTemplateVars(campaign as unknown as Record<string, unknown>))),
    [campaign]
  );
  const [html, setHtml] = useState(fallbackHtml);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/email/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaign),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.html === "string") {
          setHtml(wrapPreviewHtml(data.html));
        }
      } catch {
        /* keep the campaign-row fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-card shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
          <h3 className="font-bebas text-xl tracking-wide text-charcoal">Email Preview</h3>
          <div className="flex items-center gap-3">
            <TestSendControl campaign={campaign} />
            <button onClick={onClose} className="text-muted-gray hover:text-charcoal text-lg">
              &times;
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#E5E5E5]" data-scroll-pane>
          <LivePreviewFrame html={html} activeField={null} />
        </div>
      </div>
    </div>
  );
}
