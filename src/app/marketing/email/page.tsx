"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { Campaign, CampaignFormData } from "@/lib/email/types";
import {
  DateKey,
  isDateKey,
  todayKey,
  addDays,
  addMonths,
  startOfWeekMonday,
  weekKeys,
  monthGridKeys,
  keyRangeToInstants,
  weekLabel,
  monthLabel,
} from "@/lib/email/schedule-dates";
import { expandOccurrences, groupByDay } from "@/lib/email/occurrences";

import ScheduleToolbar from "@/components/email/schedule/ScheduleToolbar";
import WeekPlanner from "@/components/email/schedule/WeekPlanner";
import MonthOverview from "@/components/email/schedule/MonthOverview";
import OffScheduleSection from "@/components/email/schedule/OffScheduleSection";
import PriorityPanel from "@/components/email/schedule/PriorityPanel";
import SettingsPanel from "@/components/email/schedule/SettingsPanel";
import AlertsStrip from "@/components/email/schedule/AlertsStrip";
import { EmailSettings, DEFAULT_SETTINGS } from "@/lib/email/settings";
import CampaignDetail from "@/components/email/CampaignDetail";

type View = "week" | "month";

/** Next 14 needs a Suspense boundary around anything that reads search params */
export default function EmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <EmailSchedule />
    </Suspense>
  );
}

function EmailSchedule() {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // ── Data ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showPriorities, setShowPriorities] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeNote, setOptimizeNote] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/email/campaigns");
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Scheduler settings (the per-day cap drives the amber chips)
  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      try {
        const res = await fetch("/api/email/settings", { headers: { "x-user-email": userEmail } });
        if (res.ok) setSettings(await res.json());
      } catch {
        /* defaults stay */
      }
    })();
  }, [userEmail]);

  // ── View + anchor live in the URL so refresh / share keep place ──
  const view: View = params.get("view") === "month" ? "month" : "week";
  const today = todayKey();
  const rawDate = params.get("date");
  const anchor: DateKey = isDateKey(rawDate) ? rawDate : today;

  const setQuery = useCallback(
    (next: { view?: View; date?: DateKey }) => {
      const q = new URLSearchParams(params.toString());
      q.set("view", next.view ?? view);
      q.set("date", next.date ?? anchor);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, router, pathname, view, anchor]
  );

  const weekStart = startOfWeekMonday(anchor);
  const visibleKeys = view === "week" ? weekKeys(weekStart) : monthGridKeys(anchor);
  const { start, end } = keyRangeToInstants(visibleKeys[0], visibleKeys[visibleKeys.length - 1]);
  const startMs = start.getTime();
  const endMs = end.getTime();

  // Expand recurring campaigns into dated sends for the visible range
  const itemsByDay = useMemo(
    () => groupByDay(expandOccurrences(campaigns, new Date(startMs), new Date(endMs))),
    [campaigns, startMs, endMs]
  );

  // ── Nav ──
  const onPrev = () =>
    view === "week" ? setQuery({ date: addDays(weekStart, -7) }) : setQuery({ date: addMonths(anchor, -1) });
  const onNext = () =>
    view === "week" ? setQuery({ date: addDays(weekStart, 7) }) : setQuery({ date: addMonths(anchor, 1) });
  const onToday = () => setQuery({ date: today });
  const label = view === "week" ? weekLabel(weekStart) : monthLabel(anchor);

  // ── Handlers (unchanged) ──
  const handleUpdate = async (id: string, data: Partial<CampaignFormData>) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update campaign");
      await fetchCampaigns();
      if (selectedCampaign?.id === id) {
        const updated = await res.json();
        setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      setSelectedCampaign(null);
      await fetchCampaigns();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handlePause = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/pause`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Failed to pause campaign");
      await fetchCampaigns();
      if (selectedCampaign?.id === id) {
        const updated = await res.json();
        setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error("Pause failed:", err);
    }
  };

  const handleResume = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/resume`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Failed to resume campaign");
      await fetchCampaigns();
      if (selectedCampaign?.id === id) {
        const updated = await res.json();
        setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error("Resume failed:", err);
    }
  };

  // Re-slot one campaign (after an edit, or from the detail panel)
  const handleReschedule = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: "{}",
      });
      if (!res.ok) throw new Error("Failed to reschedule");
      const updated = await res.json();
      await fetchCampaigns();
      if (selectedCampaign?.id === id) setSelectedCampaign(updated);
    } catch (err) {
      console.error("Reschedule failed:", err);
    }
  };

  // Send a campaign right now (skips the AI)
  const handleSendNow = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/send-now`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send");
      await fetchCampaigns();
      if (selectedCampaign?.id === id) setSelectedCampaign(data);
    } catch (err) {
      console.error("Send now failed:", err);
      window.alert(err instanceof Error ? err.message : "Failed to send");
    }
  };

  // Ask the AI to rebalance the visible week
  const handleOptimize = async () => {
    setOptimizing(true);
    setOptimizeNote(null);
    try {
      const res = await fetch("/api/email/campaigns/optimize-week", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Optimize failed");
      const n = data.moved?.length || 0;
      setOptimizeNote(n === 0 ? "Already balanced" : `Moved ${n} send${n === 1 ? "" : "s"}`);
      await fetchCampaigns();
    } catch (err) {
      setOptimizeNote(err instanceof Error ? err.message : "Optimize failed");
    } finally {
      setOptimizing(false);
      window.setTimeout(() => setOptimizeNote(null), 6000);
    }
  };

  // ── Counts + partitions ──
  const waiting = campaigns.filter((c) => c.status === "draft" || c.status === "paused");
  const finished = campaigns.filter((c) => c.status === "completed" || c.status === "cancelled");
  const onSchedule = campaigns.filter((c) => c.status === "scheduled" || c.status === "active");
  const listingsOnSchedule = new Set(onSchedule.map((c) => c.listing_id)).size;
  const weekSends = weekKeys(weekStart).reduce((n, k) => n + (itemsByDay.get(k)?.length ?? 0), 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bebas text-3xl tracking-wide text-charcoal">Email Campaigns</h1>
          <p className="text-sm text-muted-gray mt-0.5">
            {view === "week" && <>{plural(weekSends, "send")} this week &middot; </>}
            {plural(listingsOnSchedule, "listing")} on schedule &middot; {waiting.length} waiting
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Week | Month toggle */}
          <div className="flex border border-border-light rounded-btn overflow-hidden">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setQuery({ view: v })}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v ? "bg-charcoal text-white" : "text-muted-gray hover:text-charcoal bg-white"
                }`}
              >
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>

          {/* Settings + Priorities panels */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="px-3 py-2 text-sm font-medium text-charcoal bg-white border border-border-light rounded-btn hover:bg-light-gray transition-colors"
            title="Scheduler settings"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setShowPriorities(true)}
            className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border-light rounded-btn hover:bg-light-gray transition-colors"
          >
            Priorities
          </button>

          <button
            type="button"
            onClick={() => router.push("/marketing/email/new")}
            className="px-4 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition"
          >
            + New Campaign
          </button>
        </div>
      </div>

      {/* Alerts: stale content, cadence decay */}
      <AlertsStrip userEmail={userEmail} />

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && <p className="text-center text-red-500 py-8">{error}</p>}

      {/* Schedule */}
      {!loading && !error && (
        <div>
          <ScheduleToolbar
            label={label}
            onPrev={onPrev}
            onNext={onNext}
            onToday={onToday}
            onOptimize={view === "week" ? handleOptimize : undefined}
            optimizing={optimizing}
            optimizeNote={optimizeNote}
          />
          {view === "week" ? (
            <WeekPlanner weekStart={weekStart} itemsByDay={itemsByDay} today={today} maxPerDay={settings.maxSendsPerDay} onSelect={setSelectedCampaign} />
          ) : (
            <MonthOverview
              anchor={anchor}
              itemsByDay={itemsByDay}
              today={today}
              maxPerDay={settings.maxSendsPerDay}
              onSelectDay={(key) => setQuery({ view: "week", date: key })}
            />
          )}
          <OffScheduleSection waiting={waiting} finished={finished} onSelect={setSelectedCampaign} />
        </div>
      )}

      {/* Settings slide-over */}
      {showSettings && (
        <SettingsPanel userEmail={userEmail} onClose={() => setShowSettings(false)} onSaved={setSettings} />
      )}

      {/* Priorities slide-over */}
      {showPriorities && (
        <PriorityPanel
          campaigns={campaigns}
          userEmail={userEmail}
          onClose={() => setShowPriorities(false)}
          onApplied={fetchCampaigns}
        />
      )}

      {/* Campaign detail slide-over */}
      {selectedCampaign && (
        <CampaignDetail
          campaign={selectedCampaign}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onPause={handlePause}
          onResume={handleResume}
          onReschedule={handleReschedule}
          onSendNow={handleSendNow}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </div>
  );
}
