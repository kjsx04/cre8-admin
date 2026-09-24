"use client";

import { ExternalLink } from "lucide-react";
import { type LinkStat } from "@/lib/email/analytics";

/**
 * What people actually clicked — human clicks only.
 *
 * Ranking by raw clicks would put whichever link the scanners hit first at the
 * top of every email, which is the opposite of useful.
 */
export default function TopLinks({ links }: { links: LinkStat[] }) {
  if (links.length === 0) {
    return <p className="text-sm text-text-3 py-6 text-center">No clicks have passed the filter yet.</p>;
  }

  const max = links[0].clicks;

  return (
    <ul className="space-y-2.5">
      {links.map((l) => (
        <li key={l.url}>
          <div className="flex items-baseline justify-between gap-3">
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex items-center gap-1.5 text-sm text-text hover:text-accent-strong truncate"
              title={l.url}
            >
              <span className="truncate">{prettyUrl(l.url)}</span>
              <ExternalLink size={14} strokeWidth={1.75} className="shrink-0 text-text-3" />
            </a>
            <span className="shrink-0 text-sm tabular-nums text-text-2">
              {l.clicks}
              <span className="text-text-3"> · {l.clickers} {l.clickers === 1 ? "person" : "people"}</span>
            </span>
          </div>
          {/* A bar rather than a percentage: the comparison between links is the point */}
          <div className="mt-1 h-1 rounded-pill bg-surface-2 overflow-hidden">
            <div className="h-full rounded-pill bg-accent-strong" style={{ width: `${(l.clicks / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Strip the scheme and trailing slash — the host and path are what identify a link */
function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
