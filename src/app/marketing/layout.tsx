"use client";

import AppShell from "@/components/AppShell";
import MarketingSidebar from "@/components/email/MarketingSidebar";

/**
 * Marketing section layout — AppShell + sidebar navigation.
 * AppShell's <main> already scrolls and fills the viewport, so this is just
 * a full-height row: sidebar on the left, page content scrolling on the right.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="flex h-full min-h-0">
        <MarketingSidebar />
        <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
      </div>
    </AppShell>
  );
}
