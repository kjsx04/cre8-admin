"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Columns3, LayoutList, Mail } from "lucide-react";
import { cn, FOCUS_RING } from "@/components/ui";

/*
 * BottomTabBar — phones only (under 640px wide).
 *
 * The iPhone app gets a native-style tab bar at the bottom instead of the
 * top-bar tabs. Only the three sections used on the phone are here:
 * Listings, Flow and Marketing. Map (the separate CRE8 Map app) is in the
 * desktop top bar only. Docs, Logos and Demand are computer-only,
 * so they are not reachable from a phone at all.
 *
 * Tablets and computers never see this bar (`sm:hidden`), so their layout
 * is unchanged.
 */
const PHONE_TABS = [
  { label: "Listings", href: "/", icon: LayoutList },
  { label: "Flow", href: "/flow", icon: Columns3 },
  { label: "Marketing", href: "/marketing/email", icon: Mail }, // straight to Email (skips the /marketing redirect hop)
];

export default function BottomTabBar() {
  const pathname = usePathname() || "/";

  // Same rule as the top bar: "/" only matches the home page exactly
  // Marketing lights up on any /marketing page (Email, Analyze, ...), not only /marketing/email.
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/listings")
      : href.startsWith("/marketing")
        ? pathname.startsWith("/marketing")
        : pathname.startsWith(href);

  return (
    <nav
      aria-label="Sections"
      // Sits under the scrolling page (part of the AppShell column, not floating),
      // and pads itself above the iPhone home bar.
      className={cn(
        "sm:hidden shrink-0 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]",
        // Home-screen app: always leave room for the home bar. iOS doesn't always report
        // the safe area to web apps, so use at least 26px.
        "[@media(display-mode:standalone)]:pb-[max(env(safe-area-inset-bottom),26px)]"
      )}
    >
      <div className="grid grid-cols-3 h-[60px]">
        {PHONE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              // The map is another site: open it in a new tab (on iPhone, a sheet over the app)
              {...(tab.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                // Active tab gets the CRE8 green; the rest stay quiet
                active ? "text-accent-strong" : "text-text-3",
                FOCUS_RING
              )}
            >
              <Icon size={22} strokeWidth={active ? 2 : 1.75} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
