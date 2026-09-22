"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Campaign } from "@/lib/email/types";
import { Badge, Button, EmptyState } from "@/components/ui";
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
      {/* Disclosure toggle — chevron rotates when open */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        icon={<ChevronRight size={16} strokeWidth={1.75} className={`transition-transform ${open ? "rotate-90" : ""}`} />}
        className="-ml-2"
      >
        Not on the schedule
        <Badge size="sm">{waiting.length}</Badge>
      </Button>

      {open && (
        <div className="mt-3 space-y-2">
          {waiting.length === 0 && <EmptyState compact title="Nothing waiting" />}
          {waiting.map((c) => (
            <CampaignCard key={c.id} campaign={c} onClick={onSelect} />
          ))}
          {finished.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowFinished((s) => !s)} className="mt-2 -ml-2">
              {showFinished ? "Hide" : "Show"} completed ({finished.length})
            </Button>
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
