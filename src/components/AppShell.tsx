"use client";

import AuthGate from "@/components/AuthGate";
import NavBar from "@/components/NavBar";
import { ToastProvider, ConfirmProvider } from "@/components/ui";

/**
 * AppShell — wraps every authenticated page.
 *   AuthGate  → Microsoft sign-in
 *   NavBar    → light top bar with module tabs + avatar
 *   main      → scrolls on its own, so sticky table headers work and
 *               sub-layouts (Marketing sidebar) can be `h-full` with no calc()
 *   Toast / Confirm providers → `useToast()` and `useConfirm()` work anywhere below
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ToastProvider>
        <ConfirmProvider>
          <div className="h-screen bg-canvas flex flex-col">
            <NavBar />
            <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </AuthGate>
  );
}
