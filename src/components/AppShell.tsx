"use client";

import AuthGate from "@/components/AuthGate";
import NavBar from "@/components/NavBar";
import BottomTabBar from "@/components/BottomTabBar";
import { ToastProvider, ConfirmProvider } from "@/components/ui";

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
      <ToastProvider>
        <ConfirmProvider>
          {/* Phones use 100dvh so the bottom tab bar sits right above Safari's toolbar
              or the home bar. Tablets and computers keep h-screen, unchanged. */}
          <div className="h-[100dvh] sm:h-screen bg-canvas flex flex-col">
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
