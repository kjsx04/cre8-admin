"use client";

import { useMemo } from "react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import { buildTemplateVars, renderEmailHtml } from "@/lib/email/constants";
import { wrapPreviewHtml } from "@/lib/email/preview-wrapper";
import { Modal } from "@/components/ui";
import LivePreviewFrame from "./composer/LivePreviewFrame";
import TestSendControl from "./composer/TestSendControl";

interface EmailPreviewProps {
  campaign: Campaign | CampaignFormData;
  onClose: () => void;
}

/**
 * Read-only preview modal (used from the campaign detail panel).
 * Renders the real template client-side — no API call — and offers a test send.
 */
export default function EmailPreview({ campaign, onClose }: EmailPreviewProps) {
  const html = useMemo(
    () => wrapPreviewHtml(renderEmailHtml(buildTemplateVars(campaign as unknown as Record<string, unknown>))),
    [campaign]
  );

  return (
    // Shared Modal primitive — the test-send control sits in the footer
    <Modal open onClose={onClose} size="lg" title="Email preview" footer={<TestSendControl campaign={campaign} />}>
      <div className="bg-canvas rounded-card p-4" data-scroll-pane>
        <LivePreviewFrame html={html} activeField={null} className="rounded-card" />
      </div>
    </Modal>
  );
}
