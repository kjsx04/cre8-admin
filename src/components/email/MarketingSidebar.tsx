"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Mail } from "lucide-react";
import { Badge, cn, FOCUS_RING } from "@/components/ui";

// Sidebar modules — add more as new marketing features are built
const MODULES = [{ label: "Email", href: "/marketing/email", icon: Mail }];

/**
 * MarketingSidebar — second-level rail for the Marketing section.
 * Shows the open-alert count on Email (stale content / cadence slowed).
 */
export default function MarketingSidebar() {
  const pathname = usePathname();
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const [alertCount, setAlertCount] = useState(0);
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/email/alerts", { headers: { "x-user-email": userEmail } });
        if (res.ok && !cancelled) setAlertCount(((await res.json()).alerts || []).length);
      } catch {
        /* quiet */
      }
    };
    load();
    const t = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [userEmail, pathname]);

  // The campaign composer wants the whole width — hide the module rail there
  if (/^\/marketing\/email\/(new|[^/]+\/edit)/.test(pathname || "")) return null;

  return (
    <aside className="w-56 bg-surface border-r border-border flex flex-col py-4 shrink-0 hidden md:flex">
      <p className="px-5 text-xs font-medium text-text-3 mb-2">Marketing</p>
      <nav className="flex flex-col gap-0.5 px-3">
        {MODULES.map((mod) => {
          const active = pathname.startsWith(mod.href);
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={cn(
                "flex items-center gap-2.5 h-9 px-2.5 rounded-control text-sm font-medium transition-colors duration-150",
                active ? "bg-accent-soft text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
                FOCUS_RING
              )}
            >
              <Icon size={18} strokeWidth={1.75} className={cn("shrink-0", active ? "text-accent-strong" : "text-text-3")} />
              {mod.label}
              {mod.href === "/marketing/email" && alertCount > 0 && (
                <Badge tone="warning" size="sm" className="ml-auto" title={`${alertCount} campaign${alertCount === 1 ? "" : "s"} need attention`}>
                  {alertCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
