"use client";

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Check } from "lucide-react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import { Button, Input } from "@/components/ui";

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
      {/* Small shared input, fixed width so it fits a toolbar */}
      <div className="w-48">
        <Input
          small
          type="email"
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setSent(false);
            setError(null);
          }}
          placeholder="you@cre8advisors.com"
          disabled={disabled}
        />
      </div>
      {sent ? (
        // Green = success
        <span className="flex items-center gap-1.5 text-sm font-medium text-accent-strong whitespace-nowrap">
          <Check size={16} strokeWidth={2} />
          Sent
        </span>
      ) : error ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-danger-fg max-w-[180px] truncate" title={error}>{error}</span>
          <Button size="sm" variant="ghost" onClick={handleSend}>
            Retry
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={handleSend} loading={sending} disabled={disabled || !recipientValid}>
          {sending ? "Sending" : "Send test"}
        </Button>
      )}
    </div>
  );
}
