"use client";

import AppShell from "@/components/AppShell";
import MarketingSidebar from "@/components/email/MarketingSidebar";

/**
 * Marketing section layout — AppShell + sidebar navigation.
 * All /marketing/* pages render in the right content area.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="flex flex-1 h-[calc(100vh-3.5rem)]">
        <MarketingSidebar />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </AppShell>
  );
}
