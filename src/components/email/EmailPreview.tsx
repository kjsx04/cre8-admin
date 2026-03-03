"use client";

import { useState, useEffect } from "react";
import { Campaign, CampaignFormData } from "@/lib/email/types";

interface EmailPreviewProps {
  campaign: Campaign | CampaignFormData;
  onClose: () => void;
}

/** Modal rendering the full HTML email preview via the preview API */
export default function EmailPreview({ campaign, onClose }: EmailPreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Send test email state
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Fetch preview HTML on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_label: campaign.email_label,
            heading_text: campaign.heading_text || campaign.listing_name,
            body_text: campaign.body_text || "",
            photo_url: campaign.photo_url || "",
            highlights: campaign.highlights || [],
            listing_page_url: campaign.listing_page_url || "",
            listing_name: campaign.listing_name,
            broker_id: campaign.broker_id,
            broker_name: campaign.broker_name,
            broker_email: campaign.broker_email,
            broker_phone: campaign.broker_phone || "",
          }),
        });

        if (!res.ok) throw new Error("Failed to load preview");
        const data = await res.json();
        setHtml(data.html);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Send a real test email to kevin@cre8advisors.com via SendGrid */
  async function handleSendTest() {
    setSendingTest(true);
    setTestError(null);
    setTestSent(false);

    try {
      const res = await fetch("/api/email/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign,
          recipientEmail: "kevin@cre8advisors.com",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Send failed");
      }

      setTestSent(true);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-card shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
          <h3 className="font-bebas text-xl tracking-wide text-charcoal">
            Email Preview
          </h3>
          <div className="flex items-center gap-3">
            {/* Send Test Email button */}
            {testSent ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green">
                {/* Checkmark icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sent!
              </span>
            ) : testError ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">{testError}</span>
                <button
                  onClick={handleSendTest}
                  className="text-sm font-medium text-green hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : (
              <button
                onClick={handleSendTest}
                disabled={sendingTest || !html}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green text-black text-sm font-semibold rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sendingTest ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Test Email"
                )}
              </button>
            )}
            {/* Close button */}
            <button
              onClick={onClose}
              className="text-muted-gray hover:text-charcoal text-lg"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-y-auto p-4 bg-light-gray">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-center text-red-500 py-8">{error}</p>
          )}
          {html && (
            <iframe
              srcDoc={html}
              title="Email Preview"
              className="w-full border-0 rounded-card bg-white"
              style={{ minHeight: "600px" }}
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </div>
    </div>
  );
}
