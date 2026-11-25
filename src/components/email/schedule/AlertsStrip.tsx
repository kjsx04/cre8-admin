"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Alert {
  id: string;
  campaign_id: string;
  type: "stale" | "decay" | string;
  message: string;
  created_at: string;
  listing_name: string;
  email_label: string;
}

/**
 * Alerts above the schedule: campaigns that haven't been touched in a while,
 * or whose cadence was slowed by freshness decay. Click opens the editor;
 * × snoozes the alert for two weeks.
 */
export default function AlertsStrip({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // Phones: all alerts fold into one banner; tap it to show the list
  const [phoneOpen, setPhoneOpen] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      try {
        const res = await apiFetch("/api/email/alerts");
        if (res.ok) setAlerts((await res.json()).alerts || []);
      } catch {
        /* quiet */
      }
    })();
  }, [userEmail]);

  if (alerts.length === 0) return null;

  const dismiss = async (id: string) => {
    setAlerts((a) => a.filter((x) => x.id !== id));
    try {
      await apiFetch("/api/email/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ id, action: "dismiss" }),
      });
    } catch {
      /* quiet */
    }
  };

  // Phone banner wording: "3 stale", "1 slowed", or "2 stale · 1 slowed"
  const staleN = alerts.filter((a) => a.type !== "decay").length;
  const slowedN = alerts.length - staleN;
  const phoneSummary = [staleN ? `${staleN} stale` : "", slowedN ? `${slowedN} slowed` : ""].filter(Boolean).join(" · ");

  return (
    <div className="space-y-1.5">
      {/* Phones only: one banner instead of a stack of rows */}
      <button
        type="button"
        onClick={() => setPhoneOpen((v) => !v)}
        aria-expanded={phoneOpen}
        className="sm:hidden w-full flex items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 px-3 h-11 text-sm"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700">
            Alerts
          </span>
          <span className="font-medium text-charcoal truncate">{phoneSummary}</span>
        </span>
        <span className={`text-muted-gray text-xs transition-transform ${phoneOpen ? "rotate-180" : ""}`}>▼</span>
      </button>

      {/* The rows: always on tablets and computers, on phones only when the banner is open */}
      <div className={`${phoneOpen ? "block" : "hidden"} sm:block space-y-1.5`}>
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-center gap-3 rounded-card border px-3 py-2 text-sm ${
            a.type === "decay" ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
            a.type === "decay" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
          }`}>
            {a.type === "decay" ? "Slowed" : "Stale"}
          </span>
          <button
            type="button"
            onClick={() => router.push(`/marketing/email/${a.campaign_id}/edit`)}
            className="min-w-0 flex-1 text-left text-charcoal hover:underline truncate"
            title="Open in the editor"
          >
            <span className="font-medium">{a.email_label ? `${a.email_label}: ` : ""}{a.listing_name}</span>
            <span className="text-medium-gray"> — {a.message}</span>
          </button>
          <button type="button" onClick={() => dismiss(a.id)} className="text-muted-gray hover:text-charcoal text-base leading-none shrink-0" title="Dismiss for two weeks">
            &times;
          </button>
        </div>
      ))}
      </div>
    </div>
  );
}
