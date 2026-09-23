"use client";

import { useState } from "react";
import { Campaign } from "@/lib/email/types";
import CampaignCard from "../CampaignCard";

interface OffScheduleSectionProps {
  waiting: Campaign[];   // draft + paused
  finished: Campaign[];  // completed + cancelled
  onSelect: (campaign: Campaign) => void;
  /** Open the composer for this campaign */
  onEdit?: (campaign: Campaign) => void;
  /** Put it on the calendar (opens the placement bar) */
  onSchedule?: (campaign: Campaign) => void;
}

/** Campaigns that aren't on the grid: drafts and paused (collapsed), plus finished behind a link */
export default function OffScheduleSection({ waiting, finished, onSelect, onEdit, onSchedule }: OffScheduleSectionProps) {
  const [open, setOpen] = useState(waiting.length > 0);
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
            <div key={c.id} className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0">
                <CampaignCard campaign={c} onClick={onSelect} />
              </div>
              {/* Edit reopens the composer; Schedule sends it to the placement bar */}
              <div className="flex flex-col justify-center gap-1.5 shrink-0">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(c)}
                    className="px-3 py-1.5 text-xs font-medium text-medium-gray border border-border-light rounded-btn hover:border-border-medium hover:text-charcoal transition-colors"
                  >
                    Edit
                  </button>
                )}
                {onSchedule && (
                  <button
                    type="button"
                    onClick={() => onSchedule(c)}
                    className="px-3 py-1.5 text-xs font-semibold bg-green text-black rounded-btn hover:brightness-110 transition"
                  >
                    Schedule
                  </button>
                )}
              </div>
            </div>
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
