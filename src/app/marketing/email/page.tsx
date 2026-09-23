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
import CalendarToolsMenu from "@/components/email/schedule/CalendarToolsMenu";
import AlertsStrip from "@/components/email/schedule/AlertsStrip";
import { EmailSettings, DEFAULT_SETTINGS } from "@/lib/email/settings";
import { needsTemplateSync } from "@/lib/email/template-version";
import { ChoiceButton } from "@/components/email/composer/composer-ui";
import CampaignDetail from "@/components/email/CampaignDetail";
import PlacementBar, { type PlacementResult } from "@/components/email/schedule/PlacementBar";

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
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllNote, setSyncAllNote] = useState<string | null>(null);

  // ── Placing a saved draft on the calendar (?place=<id>) ──
  const [placing, setPlacing] = useState(false);
  const [placeResult, setPlaceResult] = useState<PlacementResult | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);   // ring the email that just landed
  const [movedIds, setMovedIds] = useState<Set<string>>(new Set()); // flash the ones that shuffled
  const [rankMax, setRankMax] = useState(1);

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
    (next: { view?: View; date?: DateKey; place?: string }) => {
      const q = new URLSearchParams(params.toString());
      q.set("view", next.view ?? view);
      q.set("date", next.date ?? anchor);
      if (next.place) q.set("place", next.place);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, router, pathname, view, anchor]
  );

  // The draft we were sent here to place, if any
  const placeId = params.get("place");
  const placingCampaign = useMemo(
    () => (placeId ? campaigns.find((c) => c.id === placeId) || null : null),
    [placeId, campaigns]
  );

  /** Drop ?place= from the URL and clear the placement state */
  const closePlacement = useCallback(() => {
    const q = new URLSearchParams(params.toString());
    q.delete("place");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    setPlaceResult(null);
    setPlaceError(null);
  }, [params, router, pathname]);

  /** Highlight the placed email and anything that moved, then fade it out */
  const flashPlacement = useCallback((placed: string, moves: { id: string }[]) => {
    setPlacedId(placed);
    setMovedIds(new Set(moves.map((m) => m.id)));
    window.setTimeout(() => {
      setPlacedId(null);
      setMovedIds(new Set());
    }, 2600);
  }, []);

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

  // ── Place / undo ──
  const handlePlace = useCallback(
    async (body: Record<string, unknown>) => {
      if (!placeId) return;
      setPlacing(true);
      setPlaceError(null);
      try {
        const res = await fetch(`/api/email/campaigns/${placeId}/place`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-email": userEmail },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Placement failed");

        setPlaceResult({
          placedAt: data.placed_at || null,
          moves: data.moves || [],
          undoToken: data.undo_token,
          test: !!data.test,
        });
        // Jump to the week it landed in, reload, then light everything up
        if (data.placed_at) {
          const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date(data.placed_at));
          if (isDateKey(key)) setQuery({ view: "week", date: key });
        }
        await fetchCampaigns();
        flashPlacement(placeId, data.moves || []);
      } catch (err) {
        setPlaceError(err instanceof Error ? err.message : "Placement failed");
      } finally {
        setPlacing(false);
      }
    },
    [placeId, userEmail, setQuery, fetchCampaigns, flashPlacement]
  );

  const handleUndoPlace = useCallback(async () => {
    if (!placeId || !placeResult) return;
    setPlacing(true);
    try {
      const res = await fetch(`/api/email/campaigns/${placeId}/place/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ undo_token: placeResult.undoToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Undo failed");
      setPlaceResult(null);
      await fetchCampaigns();
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setPlacing(false);
    }
  }, [placeId, placeResult, userEmail, fetchCampaigns]);

  // How high Custom can go — listings already on the schedule, plus this one
  useEffect(() => {
    if (!placeId || !userEmail) return;
    fetch("/api/email/priorities", { headers: { "x-user-email": userEmail } })
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((d) => setRankMax(Math.max(1, (d.listings || []).length + 1)))
      .catch(() => {});
  }, [placeId, userEmail]);
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

  const handleSyncTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/sync-template`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to sync template");
      if (data.provider_sync && data.provider_sync.ok === false) {
        throw new Error(data.provider_sync.error || "Template synced, but the scheduled send wasn't updated");
      }
      await fetchCampaigns();
      if (selectedCampaign?.id === id) setSelectedCampaign(data);
    } catch (err) {
      console.error("Sync template failed:", err);
      window.alert(err instanceof Error ? err.message : "Failed to sync template");
    }
  };

  const handleSyncAllTemplates = async () => {
    setSyncingAll(true);
    setSyncAllNote(null);
    try {
      const res = await fetch("/api/email/campaigns/sync-templates", {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to sync templates");
      const n = Number(data.synced || 0);
      const failed = Array.isArray(data.errors) ? data.errors.length : 0;
      if (n === 0 && failed === 0) {
        setSyncAllNote("Already on the current template");
      } else if (failed > 0) {
        setSyncAllNote(`Synced ${n}, ${failed} failed`);
      } else {
        setSyncAllNote(n === 1 ? "Synced 1 campaign" : `Synced ${n} campaigns`);
      }
      await fetchCampaigns();
    } catch (err) {
      setSyncAllNote(err instanceof Error ? err.message : "Failed to sync templates");
    } finally {
      setSyncingAll(false);
      window.setTimeout(() => setSyncAllNote(null), 6000);
    }
  };

  const handleRefreshListing = async (id: string) => {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/refresh-listing`, {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to refresh listing");
      if (data.provider_sync && data.provider_sync.ok === false) {
        throw new Error(data.provider_sync.error || "Listing refreshed, but the scheduled send wasn't updated");
      }
      await fetchCampaigns();
      if (selectedCampaign?.id === id) setSelectedCampaign(data);
    } catch (err) {
      console.error("Refresh listing failed:", err);
      window.alert(err instanceof Error ? err.message : "Failed to refresh listing");
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
  const staleTemplateCount = campaigns.filter(needsTemplateSync).length;
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
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            {(["week", "month"] as const).map((v) => (
              <ChoiceButton key={v} selected={view === v} onClick={() => setQuery({ view: v })}>
                {v === "week" ? "Week" : "Month"}
              </ChoiceButton>
            ))}
          </div>

          <CalendarToolsMenu
            staleCount={staleTemplateCount}
            syncing={syncingAll}
            onOpenSettings={() => setShowSettings(true)}
            onOpenPriorities={() => setShowPriorities(true)}
            onSyncAll={handleSyncAllTemplates}
          />
          {syncAllNote && (
            <span className="max-w-[160px] truncate text-[11px] text-muted-gray">{syncAllNote}</span>
          )}

          <button
            type="button"
            onClick={() => router.push("/marketing/email/new")}
            className="px-4 py-2 bg-green text-black uppercase tracking-wide text-sm font-semibold rounded-btn hover:brightness-110 transition"
          >
            ADD
          </button>
        </div>
      </div>

      {/* Placing a saved draft (arrived here from the composer or an off-schedule card) */}
      {placingCampaign && (
        <PlacementBar
          campaign={placingCampaign}
          rankMax={rankMax}
          placing={placing}
          result={placeResult}
          error={placeError}
          onPlace={handlePlace}
          onUndo={handleUndoPlace}
          onDone={closePlacement}
        />
      )}

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
            <WeekPlanner weekStart={weekStart} itemsByDay={itemsByDay} today={today} maxPerDay={settings.maxSendsPerDay} onSelect={setSelectedCampaign} placedId={placedId} movedIds={movedIds} />
          ) : (
            <MonthOverview
              anchor={anchor}
              itemsByDay={itemsByDay}
              today={today}
              maxPerDay={settings.maxSendsPerDay}
              onSelectDay={(key) => setQuery({ view: "week", date: key })}
            />
          )}
          <OffScheduleSection
            waiting={waiting}
            finished={finished}
            onSelect={setSelectedCampaign}
            onEdit={(c: Campaign) => router.push(`/marketing/email/${c.id}/edit`)}
            onSchedule={(c: Campaign) => setQuery({ place: c.id })}
          />
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
          onSyncTemplate={handleSyncTemplate}
          onRefreshListing={handleRefreshListing}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </div>
  );
}
