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
 * Listings, Flow and Marketing. Docs, Logos and Demand are computer-only,
 * so they are not reachable from a phone at all.
 *
 * Tablets and computers never see this bar (`sm:hidden`), so their layout
 * is unchanged.
 */
const PHONE_TABS = [
  { label: "Listings", href: "/", icon: LayoutList },
  { label: "Flow", href: "/flow", icon: Columns3 },
  { label: "Marketing", href: "/marketing", icon: Mail },
];

export default function BottomTabBar() {
  const pathname = usePathname() || "/";

  // Same rule as the top bar: "/" only matches the home page exactly
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/listings") : pathname.startsWith(href));

  return (
    <nav
      aria-label="Sections"
      // Sits under the scrolling page (part of the AppShell column, not floating),
      // and pads itself above the iPhone home bar.
      className="sm:hidden shrink-0 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-3 h-14">
        {PHONE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
