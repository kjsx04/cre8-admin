"use client";

import { ChevronRight } from "lucide-react";
import { Button, Badge } from "@/components/ui";
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

/**
 * Saved campaigns — drafts and paused ones, waiting to go on the calendar.
 *
 * Always starts collapsed. The calendar is what you came to look at, and this
 * list grows without bound, so it should never push the schedule off screen
 * before you have asked to see it.
 */
export default function OffScheduleSection({ waiting, finished, onSelect, onEdit, onSchedule }: OffScheduleSectionProps) {
  const [open, setOpen] = useState(false);
  const [showFinished, setShowFinished] = useState(false);

  if (waiting.length === 0 && finished.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-text"
      >
        <ChevronRight size={16} strokeWidth={1.75} className={`text-text-3 transition-transform ${open ? "rotate-90" : ""}`} />
        Saved campaigns
        <Badge tone="neutral" size="sm">
          {waiting.length}
        </Badge>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {waiting.length === 0 && <p className="text-xs text-text-3">Nothing waiting.</p>}
          {waiting.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onClick={onSelect}
              /* Edit reopens the composer; Schedule sends it to the placement bar */
              actions={
                <>
                  {onEdit && (
                    <Button variant="secondary" size="sm" onClick={() => onEdit(c)}>
                      Edit
                    </Button>
                  )}
                  {onSchedule && (
                    <Button size="sm" onClick={() => onSchedule(c)}>
                      Schedule
                    </Button>
                  )}
                </>
              }
            />
          ))}
          {finished.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFinished((s) => !s)}
              className="mt-2 text-xs text-text-3 hover:text-text underline"
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
