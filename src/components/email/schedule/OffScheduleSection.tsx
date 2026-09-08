"use client";

import { useState } from "react";
import { Campaign } from "@/lib/email/types";
import CampaignCard from "../CampaignCard";

interface OffScheduleSectionProps {
  waiting: Campaign[];   // draft + paused
  finished: Campaign[];  // completed + cancelled
  onSelect: (campaign: Campaign) => void;
}

/** Campaigns that aren't on the grid: drafts and paused (collapsed), plus finished behind a link */
export default function OffScheduleSection({ waiting, finished, onSelect }: OffScheduleSectionProps) {
  const [open, setOpen] = useState(false);
  const [showFinished, setShowFinished] = useState(false);

  if (waiting.length === 0 && finished.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-charcoal"
      >
        <span className={`inline-block transition-transform text-muted-gray ${open ? "rotate-90" : ""}`}>▸</span>
        Not on the schedule
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-light-gray text-medium-gray">
          {waiting.length}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {waiting.length === 0 && <p className="text-xs text-muted-gray">Nothing waiting.</p>}
          {waiting.map((c) => (
            <CampaignCard key={c.id} campaign={c} onClick={onSelect} />
          ))}
          {finished.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFinished((s) => !s)}
              className="mt-2 text-xs text-muted-gray hover:text-charcoal underline"
            >
              {showFinished ? "Hide" : "Show"} completed ({finished.length})
            </button>
          )}
          {showFinished && (
            <div className="space-y-2 pt-1">
              {finished.map((c) => (
                <CampaignCard key={c.id} campaign={c} onClick={onSelect} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
