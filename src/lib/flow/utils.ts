import { Deal, CriticalDate, AdditionalSplit, DealMember, DealStatus, DealDate, DealDiffItem, StageSuggestion, ExtractedDealData } from "./types";

// ── Date helpers ──

/** Add days to a date, returns new Date */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Days between two dates (positive = future, negative = past) */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Format date as "Mar 15, 2026" */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00"); // force local timezone
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format date as "YYYY-MM-DD" for form inputs */
export function toInputDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 10);
}

// ── Currency + percent formatting ──

/** Format number as "$1,234,567" */
export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Format decimal as "3%" (0.03 → "3%") */
export function formatPercent(value: number): string {
  return (value * 100).toFixed(1).replace(/\.0$/, "") + "%";
}

// ── Commission calculations ──

/** Total commission = price × rate */
export function calcCommission(price: number | null, rate: number): number {
  if (!price) return 0;
  return price * rate;
}

/** Broker's split = commission × split rate */
export function calcBrokerSplit(price: number | null, rate: number, split: number): number {
  return calcCommission(price, rate) * split;
}

/** After house = broker split × 0.70 (house takes 30%) */
export function calcAfterHouse(price: number | null, rate: number, split: number): number {
  return calcBrokerSplit(price, rate, split) * 0.70;
}

/** Sum of deductions = afterHouse × each additional split percent */
export function calcDeductions(afterHouse: number, splits: AdditionalSplit[]): number {
  return splits.reduce((sum, s) => sum + afterHouse * s.percent, 0);
}

/** Take-home = after house − all additional split deductions */
export function calcTakeHome(
  price: number | null,
  rate: number,
  split: number,
  additionalSplits: AdditionalSplit[] = []
): number {
  const afterHouse = calcAfterHouse(price, rate, split);
  return afterHouse - calcDeductions(afterHouse, additionalSplits);
}

/**
 * Calculate a single member's take-home from a deal.
 * memberSplit: the member's share of the broker side (decimal, e.g. 0.50 = 50%).
 * If null, returns the full deal take-home (for backward compat / solo deals).
 */
export function calcMemberTakeHome(
  price: number | null,
  rate: number,
  brokerSplit: number,
  additionalSplits: AdditionalSplit[] = [],
  memberSplit: number | null = null
): number {
  const afterHouse = calcAfterHouse(price, rate, brokerSplit);
  // Apply the member's share of the broker side first
  const memberShare = memberSplit !== null ? afterHouse * memberSplit : afterHouse;
  // Then subtract the member's portion of additional splits (referral fees, etc.)
  const deductions = additionalSplits.reduce((sum, s) => sum + memberShare * s.percent, 0);
  return memberShare - deductions;
}

/**
 * Get the effective split for a specific broker from a deal's member list.
 * Returns the decimal split (e.g. 0.50 for 50%). If broker not found, returns 1 (full share).
 */
export function getMemberSplit(members: DealMember[] | undefined, brokerId: string): number {
  if (!members || members.length === 0) return 1;
  const member = members.find((m) => m.broker_id === brokerId);
  if (!member) return 1;
  // If split_percent is null, it's an even split across all members
  if (member.split_percent === null) return 1 / members.length;
  return member.split_percent;
}

// ── Critical dates from dynamic deal_dates ──

/**
 * Build CriticalDate array from deal.deal_dates (dynamic rows from deal_dates table).
 * Falls back to legacy computed dates if deal_dates isn't populated.
 */
export function getCriticalDates(deal: Deal): CriticalDate[] {
  const dates: CriticalDate[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to add a date entry
  const add = (label: string, date: Date | null) => {
    if (!date) return;
    const daysAway = daysBetween(today, date);
    const isPast = daysAway < 0;
    // Color coding: gray if past, red ≤3 days, yellow 4-14 days, green 15+ days
    let urgency: "green" | "yellow" | "red" | "gray" = "green";
    if (isPast) urgency = "gray";
    else if (daysAway <= 3) urgency = "red";
    else if (daysAway <= 14) urgency = "yellow";
    dates.push({ label, date, isPast, daysAway, urgency });
  };

  // Always show escrow open as first entry if set
  if (deal.escrow_open_date) {
    add("Escrow Open", new Date(deal.escrow_open_date + "T00:00:00"));
  }

  // Use dynamic deal_dates if available
  if (deal.deal_dates && deal.deal_dates.length > 0) {
    // Sort by sort_order, then by date
    const sorted = [...deal.deal_dates].sort((a, b) => a.sort_order - b.sort_order);
    for (const dd of sorted) {
      add(dd.label, new Date(dd.date + "T00:00:00"));
    }
  } else {
    // Legacy fallback — compute from old day-count fields
    if (deal.escrow_open_date && deal.feasibility_days) {
      const escrowOpen = new Date(deal.escrow_open_date + "T00:00:00");
      const feasEnd = addDays(escrowOpen, deal.feasibility_days);
      add("Feasibility Ends", feasEnd);

      if (deal.dd_extension_date) {
        add("DD Extension", new Date(deal.dd_extension_date + "T00:00:00"));
      }

      if (deal.inside_close_days) {
        const insideClose = addDays(feasEnd, deal.inside_close_days);
        add("Inside Close", insideClose);

        if (deal.outside_close_days) {
          add("Outside Close", addDays(insideClose, deal.outside_close_days));
        }
      }
    } else if (deal.dd_extension_date) {
      add("DD Extension", new Date(deal.dd_extension_date + "T00:00:00"));
    }
  }

  return dates;
}

/** Get the next upcoming critical date (soonest future date) */
export function getNextCriticalDate(deal: Deal): CriticalDate | null {
  const dates = getCriticalDates(deal);
  // Find the nearest future date, or the most recently passed one if all are past
  const future = dates.filter(d => !d.isPast).sort((a, b) => a.daysAway - b.daysAway);
  if (future.length > 0) return future[0];
  // All dates past — return the most recent one
  const past = dates.filter(d => d.isPast).sort((a, b) => b.daysAway - a.daysAway);
  return past[0] || null;
}

// ── Countdown display text ──

export function countdownText(daysAway: number): string {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  if (daysAway === -1) return "1 day ago";
  if (daysAway < 0) return `${Math.abs(daysAway)} days ago`;
  return `${daysAway} days`;
}

// ── Kanban board helpers ──

/** The three columns on the Kanban board */
export type KanbanColumn = "pre_escrow" | "due_diligence" | "closing";

/** Column display config */
export const KANBAN_COLUMNS: { key: KanbanColumn; label: string; description: string }[] = [
  { key: "pre_escrow", label: "Pre-Escrow", description: "No effective date set yet" },
  { key: "due_diligence", label: "Escrow", description: "Escrow is opened, DD period active" },
  { key: "closing", label: "Closing", description: "Past due diligence, money is hard" },
];

/** Map a deal to its Kanban column based on status */
export function getKanbanColumn(deal: Deal): KanbanColumn {
  if (deal.status === "closing") return "closing";
  if (deal.status === "due_diligence") return "due_diligence";
  // "active" deals go to pre_escrow unless they have an effective_date
  if (deal.effective_date) return "due_diligence";
  return "pre_escrow";
}

/** Check if a deal_date label is an extension (case-insensitive) */
export function isExtensionDate(label: string): boolean {
  return label.toLowerCase().includes("extension");
}

/** Result from checking whether a deal should auto-advance */
export type AdvancementResult =
  | { action: "advance"; newStatus: DealStatus }
  | { action: "prompt_extension"; datePassed: DealDate }
  | null;

/**
 * Check if a deal should auto-advance based on dates.
 * - active → due_diligence: if effective_date is today or past
 * - due_diligence → closing: only if ALL non-extension deal_dates have passed
 *   (extension dates trigger a prompt instead of silent advance)
 */
export function checkStatusAdvancement(deal: Deal): AdvancementResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Active → Due Diligence: effective_date is today or past
  if (deal.status === "active" && deal.effective_date) {
    const effDate = new Date(deal.effective_date + "T00:00:00");
    if (effDate <= today) {
      return { action: "advance", newStatus: "due_diligence" };
    }
  }

  // Due Diligence → Closing: check deal_dates
  // Only advance when ALL non-extension dates have passed.
  // If any non-extension date is still future, DD is still active.
  // A past extension date triggers a prompt regardless.
  if (deal.status === "due_diligence" && deal.deal_dates && deal.deal_dates.length > 0) {
    let pastExtension: DealDate | null = null;
    let anyFutureNonExtension = false;

    for (const dd of deal.deal_dates) {
      const ddDate = new Date(dd.date + "T00:00:00");
      const isPast = ddDate <= today;

      if (isExtensionDate(dd.label)) {
        // Track the first past extension date for prompt
        if (isPast && !pastExtension) {
          pastExtension = dd;
        }
      } else if (!isPast) {
        // A non-extension date is still in the future — DD is still active
        anyFutureNonExtension = true;
      }
    }

    // Past extension date → prompt takes priority
    if (pastExtension) {
      return { action: "prompt_extension", datePassed: pastExtension };
    }

    // Only advance if ALL non-extension dates have passed
    if (!anyFutureNonExtension) {
      return { action: "advance", newStatus: "closing" };
    }
  }

  return null;
}

/** Get the highlight config for a drop target column */
export function getDropHighlightConfig(column: KanbanColumn): {
  fields: string[];
  banner: string;
} {
  switch (column) {
    case "pre_escrow":
      return {
        fields: ["effective_date"],
        banner: "Clear or update the Effective Date",
      };
    case "due_diligence":
      return {
        fields: ["effective_date", "escrow_open_date"],
        banner: "Set the Effective Date and Escrow Open Date",
      };
    case "closing":
      return {
        fields: ["deal_dates_section"],
        banner: "Verify that due diligence dates have passed",
      };
  }
}

// ── Status display helpers ──

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  due_diligence: "Due Diligence",
  closing: "Closing",
  closed: "Closed",
  cancelled: "Cancelled",
};

// ── Deal update diff builder — compares AI extraction against current deal ──

/** Field definitions for scalar comparison */
const DIFF_FIELD_DEFS: { key: string; label: string; format?: (v: unknown) => string }[] = [
  { key: "deal_name", label: "Deal Name" },
  { key: "property_address", label: "Property Address" },
  { key: "deal_type", label: "Deal Type" },
  { key: "price", label: "Price", format: (v) => formatCurrency(Number(v)) },
  { key: "commission_rate", label: "Commission Rate", format: (v) => `${v}%` },
  { key: "effective_date", label: "Effective Date", format: (v) => formatDate(String(v)) },
  { key: "escrow_open_date", label: "Escrow Open Date", format: (v) => formatDate(String(v)) },
  { key: "notes", label: "Notes" },
];

/**
 * Build a diff between the current deal and AI-extracted data.
 * Returns an array of DealDiffItem for each changed or new field.
 */
export function buildDealDiff(deal: Deal, extracted: ExtractedDealData): DealDiffItem[] {
  const items: DealDiffItem[] = [];

  // ── Scalar fields ──
  for (const def of DIFF_FIELD_DEFS) {
    const extractedVal = (extracted as Record<string, unknown>)[def.key];
    if (extractedVal === undefined || extractedVal === null || extractedVal === "") continue;

    // Get current value from deal
    const currentVal = (deal as unknown as Record<string, unknown>)[def.key];

    // Normalize for comparison
    let currentNorm = currentVal != null ? String(currentVal) : "";
    let extractedNorm = String(extractedVal);

    // Special handling: commission_rate stored as decimal (0.03) vs extracted as "3"
    if (def.key === "commission_rate" && currentVal != null) {
      currentNorm = String(Number(currentVal) * 100);
    }

    // Skip if values match
    if (currentNorm === extractedNorm) continue;

    // Format for display
    const fmt = def.format || ((v: unknown) => String(v ?? "—"));
    let currentDisplay = "—";
    if (currentVal != null && currentVal !== "") {
      if (def.key === "commission_rate") {
        currentDisplay = `${Number(currentVal) * 100}%`;
      } else {
        currentDisplay = fmt(currentVal);
      }
    }
    const proposedDisplay = fmt(extractedVal);

    items.push({
      field: def.key,
      label: def.label,
      currentValue: currentDisplay,
      proposedValue: proposedDisplay,
      rawCurrent: currentVal,
      rawProposed: extractedVal,
      accepted: true,
      edited: false,
      type: "scalar",
    });
  }

  // ── Deal dates ──
  if (extracted.deal_dates && extracted.deal_dates.length > 0) {
    const existingDates = deal.deal_dates || [];

    for (const ed of extracted.deal_dates) {
      if (!ed.label) continue;

      // Try to find a matching existing date by label (case-insensitive)
      const match = existingDates.find(
        (dd) => dd.label.toLowerCase() === ed.label.toLowerCase()
      );

      // Build the display value for the proposed date
      let proposedDisplay = "";
      if (ed.date) {
        proposedDisplay = formatDate(ed.date);
      }
      if (ed.offset_days) {
        const ref = ed.offset_reference || "escrow open";
        proposedDisplay += proposedDisplay ? ` (${ed.offset_days}d after ${ref})` : `${ed.offset_days} days after ${ref}`;
      }

      if (match) {
        // Existing date — check if changed
        const currentDisplay = formatDate(match.date);
        if (ed.date && ed.date === match.date) continue; // same date, skip
        if (!ed.date && ed.offset_days === match.offset_days) continue; // same offset, skip

        items.push({
          field: `deal_date:${ed.label}`,
          label: ed.label,
          currentValue: currentDisplay,
          proposedValue: proposedDisplay || "—",
          rawCurrent: match,
          rawProposed: ed,
          accepted: true,
          edited: false,
          type: "date_changed",
        });
      } else {
        // New date
        items.push({
          field: `deal_date:${ed.label}`,
          label: `${ed.label} (new)`,
          currentValue: "—",
          proposedValue: proposedDisplay || "—",
          rawCurrent: null,
          rawProposed: ed,
          accepted: true,
          edited: false,
          type: "date_new",
        });
      }
    }
  }

  return items;
}

/**
 * Suggest a stage move based on the document type and extracted data.
 * Returns null if no stage change is suggested.
 */
export function suggestStageMove(deal: Deal, extracted: ExtractedDealData): StageSuggestion | null {
  // Active → Escrow: PSA with effective date
  if (deal.status === "active") {
    if (extracted.document_type === "psa" && extracted.effective_date) {
      return {
        message: "This PSA includes an effective date — move to Escrow?",
        newStatus: "due_diligence",
      };
    }
    if (extracted.effective_date) {
      return {
        message: "This document includes an effective date — move to Escrow?",
        newStatus: "due_diligence",
      };
    }
  }

  // Due Diligence → Closing: if all DD dates have passed (rare from a document drop, but possible)
  if (deal.status === "due_diligence" && deal.deal_dates && deal.deal_dates.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allPassed = deal.deal_dates
      .filter((dd) => !isExtensionDate(dd.label))
      .every((dd) => new Date(dd.date + "T00:00:00") <= today);

    if (allPassed) {
      return {
        message: "All due diligence dates have passed — move to Closing?",
        newStatus: "closing",
      };
    }
  }

  return null;
}

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-green/10 text-green border-green/30",
  due_diligence: "bg-amber-50 text-amber-700 border-amber-200",
  closing: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-charcoal/5 text-charcoal border-charcoal/20",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};
