"use client";

import { DocType } from "@/lib/types";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card, Badge, cn } from "@/components/ui";

interface DocTypeCardProps {
  docType: DocType;
}

/**
 * DocTypeCard — one clickable card per document type on the /docs landing page.
 * Uses the shared interactive Card; disabled types are dimmed and not clickable.
 */
export default function DocTypeCard({ docType }: DocTypeCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!docType.enabled) return;
    router.push(`/docs/${docType.slug}/complete`);
  };

  return (
    <Card
      interactive={docType.enabled}
      role="button"
      tabIndex={docType.enabled ? 0 : -1}
      aria-disabled={!docType.enabled}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Enter / Space activate the card like a button
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn("text-left h-full flex flex-col", !docType.enabled && "opacity-50 pointer-events-none")}
    >
      {/* Coming Soon indicator for disabled cards */}
      {!docType.enabled && (
        <div className="mb-3">
          <Badge tone="neutral">Coming soon</Badge>
        </div>
      )}

      {/* Name */}
      <h3 className="text-md font-semibold text-text mb-1">{docType.name}</h3>

      {/* Description */}
      <p className="text-sm text-text-2">{docType.description}</p>

      {/* Arrow indicator for enabled cards */}
      {docType.enabled && (
        <div className="mt-auto pt-4 text-sm font-medium text-text-2 flex items-center gap-1">
          Start
          <ArrowRight size={16} strokeWidth={1.75} />
        </div>
      )}
    </Card>
  );
}
