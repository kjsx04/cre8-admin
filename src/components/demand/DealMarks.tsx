"use client";

import { Button, Input, Select, cn, FOCUS_RING } from "@/components/ui";
import type { DealFlags } from "@/lib/demand/types";

const FLAGS: { key: keyof DealFlags; label: string }[] = [
  { key: "dealLease", label: "Rent" },
  { key: "dealBuy", label: "Buy" },
  { key: "dealGroundLease", label: "Ground lease" },
  { key: "dealBts", label: "BTS" },
  { key: "freestanding", label: "Freestanding" },
  { key: "inline", label: "Inline" },
];

/** Yes / No / unknown. Click cycles unknown → yes → no. */
export default function DealMarks({
  value,
  onChange,
  onSave,
  saving,
  compact,
}: {
  value: DealFlags;
  onChange: (next: DealFlags) => void;
  onSave?: () => void;
  saving?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FLAGS.map((flag) => {
        const raw = value?.[flag.key];
        const current = raw === true ? true : raw === false ? false : null;
        const text = current === true ? "Yes" : current === false ? "No" : "—";
        return (
          <button
            key={flag.key}
            type="button"
            aria-label={`${flag.label}: ${text}`}
            onClick={() => onChange({ ...value, [flag.key]: current === null ? true : current === true ? false : null })}
            className={cn(
              "h-7 px-2 rounded-control text-xs border border-border",
              current === true ? "bg-surface-2 text-text" : "bg-surface text-text-3",
              FOCUS_RING
            )}
          >
            {flag.label} {text}
          </button>
        );
      })}
      {!compact && (
        <>
      <Input
        small
        className="w-36"
        placeholder="Source"
        aria-label="Deal type source"
        value={value.dealTypesSource || ""}
        onChange={(e) => onChange({ ...value, dealTypesSource: e.target.value || null })}
      />
      <div className="w-28">
        <Select
          small
          aria-label="Deal type confidence"
          value={value.dealTypesConfidence || ""}
          onChange={(e) =>
            onChange({
              ...value,
              dealTypesConfidence: e.target.value === "High" || e.target.value === "Medium" || e.target.value === "Low" ? e.target.value : null,
            })
          }
        >
          <option value="">Confidence</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </Select>
      </div>
      {onSave && (
        <Button size="sm" variant="secondary" loading={saving} onClick={onSave}>
          Save
        </Button>
      )}
        </>
      )}
    </div>
  );
}

export function researchLine(status: string | null, researchedAt: string | null, storeCount: number | null | undefined): string {
  const count = typeof storeCount === "number" && Number.isFinite(storeCount) ? storeCount : 0;
  const stores = `${count.toLocaleString("en-US")} ${count === 1 ? "store" : "stores"}`;
  const label =
    status === "researched" ? "Researched" : status === "in_progress" ? "Researching" : status === "needs_review" ? "Needs review" : "Not researched";
  return [stores, label, researchedAt ? shortDate(researchedAt) : ""].filter(Boolean).join(" · ");
}

export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

const FIELD_LABEL: Record<string, string> = {
  deal_lease: "Rent",
  deal_buy: "Buy",
  deal_ground_lease: "Ground lease",
  deal_bts: "BTS",
  freestanding: "Freestanding",
  inline: "Inline",
  deal_types_source: "Source",
  deal_types_confidence: "Confidence",
};

export function researchFieldLabel(field: string): string {
  return FIELD_LABEL[field] || field;
}

export function researchValueLabel(value: string | null): string {
  if (value === "true") return "yes";
  if (value === "false") return "no";
  if (!value || value === "unknown") return "unknown";
  return value;
}
