"use client";

import { useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import { BROKER_HEADSHOTS, EMAIL_SENDERS } from "@/lib/email/constants";
import { isCre8BrokerEmail, normalizeEmail } from "@/lib/email/broker-emails";

interface TestSendControlProps {
  /** The campaign fields to render and send */
  campaign: Campaign | CampaignFormData;
  /** Disable when the campaign isn't ready (e.g. no listing yet) */
  disabled?: boolean;
}

/**
 * "test" button → modal of CRE8 broker emails (same roster as the Broker step).
 * Multi-select, then send the real email ([TEST] subject) only to checked addresses.
 */
export default function TestSendControl({ campaign, disabled = false }: TestSendControlProps) {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const defaultIds = useMemo(() => {
    const match = EMAIL_SENDERS.find((s) => userEmail && normalizeEmail(s.email) === normalizeEmail(userEmail));
    return match ? [match.id] : [];
  }, [userEmail]);

  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = EMAIL_SENDERS.filter((s) => selectedIds.includes(s.id));
  const canSend = selected.length > 0 && !sending && !disabled;

  function toggle(id: string) {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setSent(false);
    setError(null);
  }

  function openModal() {
    if (disabled) return;
    setSelectedIds((cur) => (cur.length > 0 ? cur : defaultIds));
    setSent(false);
    setError(null);
    setOpen(true);
  }

  async function handleSend() {
    const emails = selected.map((s) => s.email).filter(isCre8BrokerEmail);
    if (emails.length === 0) {
      setError("Select at least one CRE8 broker");
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
          "x-user-email": userEmail || emails[0],
        },
        body: JSON.stringify({ campaign, recipientEmails: emails }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Send failed");
      }
      setSent(true);
      window.setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className="flex items-center px-3 py-1.5 text-sm font-medium text-medium-gray hover:text-charcoal hover:bg-subtle-gray rounded-btn disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        test
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !sending && setOpen(false)} />
          <div className="relative bg-white rounded-card shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-charcoal">Send test</h3>
            <p className="text-sm text-muted-gray mt-1">CRE8 brokers only. Select who should receive this test.</p>

            <ul className="mt-4 space-y-1">
              {EMAIL_SENDERS.map((s) => {
                const on = selectedIds.includes(s.id);
                const src = BROKER_HEADSHOTS[s.id];
                return (
                  <li key={s.id}>
                    <label className="flex items-center gap-3 px-2 py-2 rounded-card cursor-pointer hover:bg-subtle-gray">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(s.id)}
                        className="accent-[#8CC644]"
                      />
                      <span className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-light-gray">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-charcoal">
                            {s.name.split(" ").map((p) => p[0]).join("")}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-charcoal">{s.name}</span>
                        <span className="block text-xs text-muted-gray truncate">{s.email}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
            {sent && <p className="text-xs text-green mt-3">Sent</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={sending}
                className="px-4 py-2 text-sm font-medium text-muted-gray hover:text-charcoal disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="px-4 py-1.5 bg-green text-charcoal text-sm font-medium rounded-btn hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "Sending…" : selected.length > 1 ? `Send (${selected.length})` : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
