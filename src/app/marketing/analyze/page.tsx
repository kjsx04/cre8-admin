"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { RefreshCw, Info } from "lucide-react";

import { PageContainer, PageHeader, Card, CardHeader, Button, LoadingBlock, EmptyState } from "@/components/ui";
import { StatCard, StatGrid } from "@/components/email/analyze/StatCard";
import CampaignPicker, { type PickerOption } from "@/components/email/analyze/CampaignPicker";
import BarChart from "@/components/email/analyze/BarChart";
import TopLinks from "@/components/email/analyze/TopLinks";
import CampaignTable from "@/components/email/analyze/CampaignTable";
import type { AnalyticsSummary, QualityReasonLabel } from "@/lib/email/analyze-labels";
import { REASON_LABELS, pct, num, shortDate } from "@/lib/email/analyze-labels";

/** Next 14 needs a Suspense boundary around anything reading search params */
export default function AnalyzePage() {
  return (
    <Suspense fallback={<PageContainer><LoadingBlock message="Loading" /></PageContainer>}>
      <Analyze />
    </Suspense>
  );
}

function Analyze() {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Scope lives in the URL so a view survives a refresh and can be sent to someone
  const campaignId = params.get("campaign");
  const scope = campaignId && campaignId !== "all" ? campaignId : null;

  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!userEmail) return;
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (scope) qs.set("campaign", scope);
        if (force) qs.set("refresh", "1");
        const res = await fetch(`/api/email/analytics?${qs}`, { headers: { "x-user-email": userEmail } });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load analytics");
        setData(body.data as AnalyticsSummary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userEmail, scope]
  );

  useEffect(() => {
    load();
  }, [load]);

  const setScope = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("campaign", id);
    else next.delete("campaign");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  const options: PickerOption[] = useMemo(
    () =>
      (data?.perCampaign || []).map((c) => ({
        id: c.id,
        name: c.name,
        note: `${num(c.reach.delivered)} delivered`,
      })),
    [data]
  );

  const selected = data?.perCampaign.find((c) => c.id === scope) || null;
  const title = selected ? selected.name : "All campaigns";

  return (
    <PageContainer>
      <PageHeader
        title="Analyze"
        description={
          data && data.firstSendAt
            ? `${num(data.reach.emails)} emails across ${data.sends} send${data.sends === 1 ? "" : "s"} since ${shortDate(data.firstSendAt)}`
            : "Email performance, with scanner traffic filtered out"
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => load(true)}
              loading={refreshing}
              icon={<RefreshCw size={18} strokeWidth={1.75} />}
              title="Re-read the event table"
            >
              Refresh
            </Button>
            <CampaignPicker options={options} value={scope} onChange={setScope} />
          </>
        }
      />

      {loading && <LoadingBlock message="Crunching events" />}

      {!loading && error && (
        <Card>
          <p className="text-sm text-danger-fg">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => load(true)}>
            Try again
          </Button>
        </Card>
      )}

      {!loading && !error && data && data.reach.emails === 0 && (
        <EmptyState
          title="Nothing to analyze yet"
          description={
            scope
              ? "This campaign hasn't reported a delivery, open or click. Pick another campaign, or switch back to All."
              : "No campaign has sent yet, or the Resend webhook isn't delivering events."
          }
        />
      )}

      {!loading && !error && data && data.reach.emails > 0 && (
        <div className="space-y-6">
          <Filtered data={data} scopeName={title} />

          <section>
            <h2 className="text-sm font-semibold text-text mb-2.5">Reach</h2>
            <StatGrid>
              <StatCard
                label="Emails sent"
                value={num(data.reach.emails)}
                hint={`${data.sends} send${data.sends === 1 ? "" : "s"} · ${data.daysRunning} day${data.daysRunning === 1 ? "" : "s"}`}
              />
              <StatCard
                label="Delivered"
                value={num(data.reach.delivered)}
                hint={pct(data.reach.deliveryRate) + " of sent"}
              />
              <StatCard
                label="Bounced"
                value={pct(data.reach.bounceRate)}
                hint={`${num(data.reach.hardBounces)} hard · ${num(data.reach.softBounces)} soft`}
                title="Hard bounces are dead addresses and get suppressed automatically. Soft bounces retire after three in a row."
              />
              <StatCard
                label="Unsubscribes"
                value={num(data.unsubscribes)}
                hint={`${num(data.complaints)} spam complaint${data.complaints === 1 ? "" : "s"}`}
                muted={data.unsubscribes === 0 && data.complaints === 0}
              />
            </StatGrid>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-text mb-2.5">Engagement</h2>
            <StatGrid>
              <StatCard
                label="Open rate"
                value={pct(data.human.openRate)}
                hint={`${num(data.human.uniqueOpeners)} of ${num(data.reach.delivered)} delivered`}
                title={`Unfiltered, Resend reports ${pct(data.raw.openRate)} from ${num(data.raw.uniqueOpeners)} openers.`}
              />
              <StatCard
                label="Click rate"
                value={pct(data.human.clickRate)}
                hint={`${num(data.human.uniqueClickers)} people clicked`}
                title={`Unfiltered, Resend reports ${pct(data.raw.clickRate)} from ${num(data.raw.uniqueClickers)} clickers — almost all of it link scanners.`}
              />
              <StatCard
                label="Click to open"
                value={pct(data.human.clickToOpenRate)}
                hint="Of people who opened, how many clicked"
              />
              <StatCard
                label="Total clicks"
                value={num(data.human.clicks)}
                hint={`${num(data.human.opens)} opens`}
                title={`Resend reported ${num(data.raw.clicks)} clicks and ${num(data.raw.opens)} opens before filtering.`}
              />
            </StatGrid>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="What people clicked" description="Human clicks only" />
              <TopLinks links={data.links} />
            </Card>

            <Card>
              <CardHeader
                title="When people click"
                description="Phoenix time, by hour of day"
              />
              <BarChart
                data={data.clicksByHour}
                labelFor={hourLabel}
                labelEvery={3}
                unit="click"
                emptyMessage="No clicks have passed the filter yet."
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Clicks by weekday" description="When the list actually engages" />
              <BarChart data={data.clicksByWeekday} labelFor={dayLabel} unit="click" />
            </Card>
            <Card>
              <CardHeader title="Sends by weekday" description="When we choose to send" />
              <BarChart data={data.sendsByWeekday} labelFor={dayLabel} unit="send" />
            </Card>
          </div>

          <Card padding="none" className="overflow-auto">
            <div className="p-5 pb-0">
              <CardHeader
                title="Every campaign"
                description="Click a row to narrow the dashboard to it"
              />
            </div>
            <CampaignTable rows={data.perCampaign} selectedId={scope} onSelect={setScope} />
          </Card>

          <p className="text-xs text-text-3">
            Updated {new Date(data.generatedAt).toLocaleString("en-US", { timeZone: "America/Phoenix" })} Phoenix time.
            Test sends are excluded.
          </p>
        </div>
      )}
    </PageContainer>
  );
}

/**
 * The filtering disclosure.
 *
 * This sits above the numbers rather than in a footnote because it is the
 * single most surprising thing on the page: nine out of ten reported clicks
 * are thrown away. Someone comparing this screen to the Resend dashboard needs
 * to see why the two disagree before they read anything else.
 */
function Filtered({ data, scopeName }: { data: AnalyticsSummary; scopeName: string }) {
  if (data.noise.filteredClicks === 0 && data.noise.filteredOpens === 0) return null;

  return (
    <div className="flex items-start gap-2.5 bg-info-bg border border-border rounded-card px-4 py-3">
      <Info size={18} strokeWidth={1.75} className="shrink-0 mt-0.5 text-info-fg" />
      <div className="min-w-0 text-sm text-text-2">
        <p className="text-text">
          <span className="font-medium">{pct(data.noise.filteredClickShare)} of clicks on {scopeName} were machines, not people.</span>{" "}
          Corporate mail gateways open every link before the recipient sees the email.
        </p>
        <p className="mt-1 text-xs">
          Filtered out: {num(data.noise.filteredClicks)} clicks and {num(data.noise.filteredOpens)} opens
          {data.noise.reasons.length > 0 && (
            <> — {data.noise.reasons.map((r) => `${num(r.count)} ${REASON_LABELS[r.reason as QualityReasonLabel] || r.reason}`).join(", ")}</>
          )}
          . Every rate on this page is after filtering; hover a number to see what Resend reported.
        </p>
      </div>
    </div>
  );
}

const HOURS = ["12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const hourLabel = (h: number) => HOURS[h] || String(h);
const dayLabel = (d: number) => DAYS[d] || String(d);
