"use client";

import "./globals.css";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "@/lib/msal-config";
import { useEffect, useState } from "react";

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
        {/* Google Fonts: Bebas Neue + Barlow */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap"
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
      <body className="font-dm antialiased">
        {ready ? (
          <MsalProvider instance={msalInstance}>{children}</MsalProvider>
        ) : (
          /* Loading screen while MSAL initializes */
          <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </body>
    </html>
  );
}
