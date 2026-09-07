"use client";

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFormData } from "@/lib/email/types";

interface TestSendControlProps {
  /** The campaign fields to render and send */
  campaign: Campaign | CampaignFormData;
  /** Disable when the campaign isn't ready (e.g. no listing yet) */
  disabled?: boolean;
}

/**
 * Recipient input + "Send test" button.
 * Sends the real email (from the chosen broker, [TEST] subject) to one address.
 * Defaults the recipient to the signed-in user.
 */
export default function TestSendControl({ campaign, disabled = false }: TestSendControlProps) {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const [recipient, setRecipient] = useState(userEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the default once MSAL resolves the account
  useEffect(() => {
    if (userEmail && !recipient) setRecipient(userEmail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  const recipientValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient.trim());

  async function handleSend() {
    if (!recipientValid) {
      setError("Enter a valid email");
      return;
    }
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/email/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail || recipient.trim(),
        },
        body: JSON.stringify({ campaign, recipientEmail: recipient.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Send failed");
      }
      setSent(true);
      // Let the "Sent" state show briefly, then allow another send
      window.setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="email"
        value={recipient}
        onChange={(e) => {
          setRecipient(e.target.value);
          setSent(false);
          setError(null);
        }}
        placeholder="you@cre8advisors.com"
        disabled={disabled}
        className="w-48 border border-border-light rounded-btn px-3 py-1.5 text-sm text-charcoal placeholder:text-border-medium focus:outline-none focus:ring-1 focus:ring-green disabled:opacity-50"
      />
      {sent ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-green whitespace-nowrap">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sent
        </span>
      ) : error ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 max-w-[180px] truncate" title={error}>{error}</span>
          <button onClick={handleSend} className="text-sm font-medium text-green hover:underline whitespace-nowrap">
            Retry
          </button>
        </div>
      ) : (
        <button
          onClick={handleSend}
          disabled={disabled || sending || !recipientValid}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-light text-charcoal text-sm font-medium rounded-btn hover:bg-light-gray transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {sending ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-charcoal/30 border-t-charcoal rounded-full animate-spin" />
              Sending
            </>
          ) : (
            "Send test"
          )}
        </button>
      )}
    </div>
  );
}
