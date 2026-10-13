"use client";

import AppShell from "@/components/AppShell";

/**
 * Logos section layout — same shell as the other top-level modules
 * (Microsoft sign-in, then the main nav). Not nested under Marketing.
 */
export default function LogosLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
