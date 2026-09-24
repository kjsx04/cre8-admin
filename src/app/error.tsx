"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

/**
 * What the app shows when a page throws.
 *
 * There was no error boundary at all, so any client-side exception produced
 * Next's bare "Application error: a client-side exception has occurred" with
 * nothing to act on and nothing to report.
 *
 * The common cause here is deploying while a tab is open: the running page
 * asks for a JS chunk that the new build replaced, and the fetch 404s. That is
 * fixed by reloading, so this does it automatically — once, guarded by
 * sessionStorage, because a reload loop is worse than an error message.
 * Anything else shows the real message so it can be reported.
 */

const RELOAD_FLAG = "cre8-chunk-reload";

/** A stale-deploy failure, rather than a bug in the page */
function isStaleBuild(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(text);
}

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    console.error("[cre8-admin] page error:", error);

    if (!isStaleBuild(error)) return;
    setStale(true);
    try {
      // Only ever auto-reload once per tab
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    } catch {
      /* private window — the button below still works */
    }
  }, [error]);

  // Clear the guard once a page renders successfully again
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-text tracking-tight">
          {stale ? "There's a newer version" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm text-text-2">
          {stale
            ? "This page was loaded before the last update. Reloading picks up the new one."
            : "The page failed to load. Reloading usually clears it."}
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        </div>

        {/* The actual message, so a report can say something more useful than "it broke" */}
        {!stale && (
          <p className="mt-5 text-xs text-text-3 break-words">
            {error.message}
            {error.digest && ` · ${error.digest}`}
          </p>
        )}
      </div>
    </div>
  );
}
