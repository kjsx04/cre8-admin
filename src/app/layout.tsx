import "./globals.css";
import type { Metadata, Viewport } from "next";
import RootClient from "./RootClient";

/*
 * Root layout (server component).
 *
 * KEY PART — `viewport` below: viewport-fit=cover tells iOS to report the
 * notch / status bar / home bar sizes, which the top bar and bottom tab bar
 * use for their spacing. Declaring it here means Next.js writes it into the
 * page and keeps it on every navigation. Before, it was added by JavaScript
 * after load and got reset whenever you tapped a tab — that's what made the
 * bottom bar drop and the top bar slide under the clock.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // White status-bar area that matches the top bar
  themeColor: "#FFFFFF",
};

export const metadata: Metadata = {
  title: "CRE8 Admin",
  description: "CRE8 Advisors admin portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <link href="https://api.mapbox.com/mapbox-gl-js/v3.19.0/mapbox-gl.css" rel="stylesheet" />
        {/* Home-screen app on iPhone: dark status bar text and the app name */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CRE8" />
      </head>
      <body className="font-sans antialiased">
        <RootClient>{children}</RootClient>
      </body>
    </html>
  );
}
