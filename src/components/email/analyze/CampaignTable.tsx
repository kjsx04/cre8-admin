"use client";

import { Table, THead, TR, TH, TD, Badge, type Tone } from "@/components/ui";
import { type CampaignStat } from "@/lib/email/analytics";

/** Below this many delivered emails a percentage is noise, so it's shown greyed with its base. */
const THIN_SAMPLE = 30;

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  completed: "neutral",
  cancelled: "danger",
};

interface CampaignTableProps {
  rows: CampaignStat[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Every campaign that has produced data, side by side.
 *
 * Rates on a tiny sample are greyed rather than hidden: a recurring campaign
 * that only goes to two hand-typed recipients really does have a 100% open
 * rate, and pretending otherwise is as misleading as printing it in bold.
 */
export default function CampaignTable({ rows, selectedId, onSelect }: CampaignTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-3 py-6 text-center">No campaign has reported an event yet.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Campaign</TH>
          <TH align="right">Sends</TH>
          <TH align="right">Delivered</TH>
          <TH align="right">Opened</TH>
          <TH align="right">Clicked</TH>
          <TH align="right">Running</TH>
          <TH align="right">Status</TH>
        </TR>
      </THead>
      <tbody>
        {rows.map((c) => {
          const thin = c.reach.delivered < THIN_SAMPLE;
          return (
            <TR key={c.id} active={c.id === selectedId} onClick={() => onSelect(c.id)}>
              <TD>
                <span className="block font-medium text-text truncate max-w-[280px]">{c.name}</span>
                <span className="block text-xs text-text-3 truncate max-w-[280px]">
                  {[c.label, c.type === "recurring" ? c.frequency : "one-time"].filter(Boolean).join(" · ")}
                </span>
              </TD>
              <TD align="right" className="tabular-nums">{c.sends}</TD>
              <TD align="right" className="tabular-nums">
                {c.reach.delivered}
                <span className="text-text-3"> / {c.reach.emails}</span>
              </TD>
              <TD align="right" className={`tabular-nums ${thin ? "text-text-3" : ""}`}>
                {pct(c.human.openRate)}
              </TD>
              <TD align="right" className={`tabular-nums ${thin ? "text-text-3" : ""}`}>
                {pct(c.human.clickRate)}
              </TD>
              <TD align="right" className="tabular-nums text-text-2">{c.daysRunning}d</TD>
              <TD align="right">
                <Badge tone={STATUS_TONE[c.status || ""] || "neutral"} size="sm">
                  {c.status || "unknown"}
                </Badge>
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;
}
