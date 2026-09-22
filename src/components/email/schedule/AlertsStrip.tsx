"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Badge, IconButton } from "@/components/ui";

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

  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      try {
        const res = await fetch("/api/email/alerts", { headers: { "x-user-email": userEmail } });
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
      await fetch("/api/email/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ id, action: "dismiss" }),
      });
    } catch {
      /* quiet */
    }
  };

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-card border border-border bg-surface pl-4 pr-2 py-2 text-sm">
          {/* Kind badge: decay = info tone, stale = warning tone */}
          <Badge tone={a.type === "decay" ? "info" : "warning"} size="sm" className="shrink-0">
            {a.type === "decay" ? "Slowed" : "Stale"}
          </Badge>
          {/* Whole message opens the editor — a plain text link, not a boxed button */}
          <button
            type="button"
            onClick={() => router.push(`/marketing/email/${a.campaign_id}/edit`)}
            className="min-w-0 flex-1 text-left text-text hover:underline truncate"
            title="Open in the editor"
          >
            <span className="font-medium">{a.email_label ? `${a.email_label}: ` : ""}{a.listing_name}</span>
            <span className="text-text-2"> — {a.message}</span>
          </button>
          <IconButton size="sm" label="Dismiss for two weeks" icon={<X size={16} strokeWidth={1.75} />} onClick={() => dismiss(a.id)} />
        </div>
      ))}
    </div>
  );
}
