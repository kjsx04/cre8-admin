"use client";

import AuthGate from "@/components/AuthGate";
import NavBar from "@/components/NavBar";
import BottomTabBar from "@/components/BottomTabBar";
import { ToastProvider, ConfirmProvider } from "@/components/ui";
import { useEffect } from "react";
import { prefetchMainPages } from "@/lib/page-cache";

/** Runs once signed in: loads Listings, Flow and Marketing data in the background
 *  so those tabs open instantly. Renders nothing. */
function PrefetchMainPages() {
  useEffect(() => {
    prefetchMainPages();
  }, []);
  return null;
}

/**
 * AppShell — wraps every authenticated page.
 *   AuthGate  → Microsoft sign-in
 *   NavBar    → light top bar with module tabs + avatar
 *   main      → scrolls on its own, so sticky table headers work and
 *               sub-layouts (Marketing sidebar) can be `h-full` with no calc()
 *   Toast / Confirm providers → `useToast()` and `useConfirm()` work anywhere below
 *   (The CRE8 Assistant orb is mounted once in src/app/layout.tsx, not here, so it
 *   never reloads when you move between sections.)
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <PrefetchMainPages />
      <ToastProvider>
        <ConfirmProvider>
          {/* Phones: the app frame is pinned to the screen edges (fixed + inset-0), so the
              page itself can never bounce or scroll and drag the top bar or bottom tab bar
              with it. Only <main> scrolls. Tablets and computers keep h-screen, unchanged. */}
          <div className="max-sm:fixed max-sm:inset-0 sm:h-screen bg-canvas flex flex-col">
            <NavBar />
            <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
            {/* Phones only: Listings / Flow / Marketing tab bar */}
            <BottomTabBar />
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </AuthGate>
  );
}
