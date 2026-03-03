"use client";

import AuthGate from "@/components/AuthGate";
import NavBar from "@/components/NavBar";

/**
 * AppShell — wraps all authenticated pages with AuthGate + NavBar.
 * Used by both the dashboard and docs sections.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-light-gray flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
      </div>
    </AuthGate>
  );
}
