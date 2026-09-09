"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";

// Sidebar modules — add more as new marketing features are built
const MODULES = [
  { label: "Email", href: "/marketing/email", icon: "M" },
];

export default function MarketingSidebar() {
  const pathname = usePathname();
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  // Open email alerts (stale content / cadence slowed) → badge on the Email module
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
    <aside className="w-48 bg-white border-r border-border-light flex flex-col py-4 shrink-0">
      <h3 className="px-4 text-xs font-semibold text-muted-gray uppercase tracking-wider mb-3">
        Modules
      </h3>
      <nav className="flex flex-col gap-0.5 px-2">
        {MODULES.map((mod) => {
          const active = pathname.startsWith(mod.href);
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-btn text-sm font-medium transition-colors duration-150
                ${active
                  ? "bg-[#F0F0F0] text-[#1A1A1A] border-l-2 border-green"
                  : "text-medium-gray hover:bg-light-gray hover:text-charcoal"
                }`}
            >
              {/* Icon placeholder — simple letter badge */}
              <span
                className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold
                  ${active ? "bg-green text-black" : "bg-light-gray text-medium-gray"}`}
              >
                {mod.icon}
              </span>
              {mod.label}
              {mod.href === "/marketing/email" && alertCount > 0 && (
                <span
                  className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                  title={`${alertCount} campaign${alertCount === 1 ? "" : "s"} need attention`}
                >
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
