"use client";

import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/lib/msal-instance";
import { useEffect, useState } from "react";
import Spinner from "@/components/ui/Spinner";
import Assistant from "@/components/assistant/Assistant";

/**
 * RootClient — the browser-side part of the root layout.
 *
 * Moved out of layout.tsx so layout.tsx can be a server component. That lets it
 * export `viewport` (with viewport-fit=cover) the official Next.js way, so the
 * iPhone safe-area spacing is in the page from the first byte and survives
 * tapping between tabs. (It used to be patched in here with JavaScript, and
 * Next.js wiped the patch on every navigation.)
 */
export default function RootClient({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // MSAL v3 requires initialization before use
    msalInstance.initialize().then(() => {
      // Handle redirect response (if returning from login redirect)
      msalInstance.handleRedirectPromise().then(() => {
        setReady(true);
      });
    });
  }, []);

  if (!ready) {
    // Loading screen while MSAL initializes
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <MsalProvider instance={msalInstance}>
      {children}
      {/* The CRE8 Assistant: on every page, above everything, mounted once so it
          never reloads as you move around. Shows only when signed in. */}
      <Assistant />
    </MsalProvider>
  );
}
