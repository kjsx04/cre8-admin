"use client";

import "./globals.css";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "@/lib/msal-config";
import { useEffect, useState } from "react";
import Spinner from "@/components/ui/Spinner";

// Create MSAL instance once
const msalInstance = new PublicClientApplication(msalConfig);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <title>CRE8 Admin</title>
        <meta name="description" content="CRE8 Advisors admin portal" />
      </head>
      <body className="font-sans antialiased">
        {ready ? (
          <MsalProvider instance={msalInstance}>{children}</MsalProvider>
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
