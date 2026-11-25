"use client";

import "./globals.css";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/lib/msal-instance";
import { useEffect, useState } from "react";
import Spinner from "@/components/ui/Spinner";
import Assistant from "@/components/assistant/Assistant";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Phones: add viewport-fit=cover to the viewport tag Next.js writes, so the layout
    // can read the iPhone safe areas (notch and home bar) and keep the bottom tab bar
    // above the home bar. (This root layout is a client component, so it can't use
    // Next's `viewport` export, and a second <meta> tag would be overridden by Next's.)
    document.querySelectorAll('meta[name="viewport"]').forEach((m) => {
      const content = m.getAttribute("content") || "width=device-width, initial-scale=1";
      if (!content.includes("viewport-fit")) m.setAttribute("content", `${content}, viewport-fit=cover`);
    });
  }, []);

  useEffect(() => {
    // MSAL v3 requires initialization before use
    msalInstance.initialize().then(() => {
      // Handle redirect response (if returning from login redirect)
      msalInstance.handleRedirectPromise().then(() => {
        setReady(true);
      });
    });
  }, []);

  return (
    <html lang="en">
      <head>
        {/* Google Fonts: Inter — the admin's only typeface (see tailwind.config.ts fontFamily) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Mapbox GL CSS — used by ParcelPickerModal (must match installed version) */}
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.19.0/mapbox-gl.css"
          rel="stylesheet"
        />
        {/* Home-screen app on iPhone: white status bar area that matches the top bar
            (instead of a blurred grey band), dark status bar text, and the app name. */}
        <meta name="theme-color" content="#FFFFFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CRE8" />
        <title>CRE8 Admin</title>
        <meta name="description" content="CRE8 Advisors admin portal" />
      </head>
      <body className="font-sans antialiased">
        {ready ? (
          <MsalProvider instance={msalInstance}>
            {children}
            {/* The CRE8 Assistant: on every page, above everything, mounted once so it
                never reloads as you move around. Shows only when signed in. */}
            <Assistant />
          </MsalProvider>
        ) : (
          /* Loading screen while MSAL initializes */
          <div className="min-h-screen bg-canvas flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        )}
      </body>
    </html>
  );
}
