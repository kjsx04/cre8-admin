"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { cn, FOCUS_RING } from "@/components/ui";
import { BOT_DISPLAY_NAME } from "@/lib/bot-identity";
import { clearBotSession, useBotSession } from "@/lib/bot-session";
import { clearAssistantMemory } from "@/lib/assistant/client-store";

/* Module tabs. Map is last: it's the separate CRE8 Map app, so it opens in a new tab. */
export const MAP_URL = "https://map.cre8advisors.com";

/** Links to another site (the map) open in a new tab so the admin stays open behind them */
const externalProps = (href: string) =>
  href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};

const NAV_ITEMS = [
  { label: "Listings", href: "/" },
  { label: "Flow", href: "/flow" },
  { label: "Docs", href: "/docs" },
  { label: "Marketing", href: "/marketing" },
  { label: "Logos", href: "/logos" },
  { label: "Demand", href: "/demand" },
  { label: "Map", href: MAP_URL },
];

/** "Kevin Smith" → "KS", "kevin@cre8advisors.com" → "K" */
function initialsFor(name?: string, email?: string): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  }
  return (email || "?")[0]!.toUpperCase();
}

/**
 * NavBar — light 52px top bar.
 *   left:   CRE8 logo
 *   center: module tabs (collapse into the avatar menu on small screens)
 *   right:  initials avatar → popover with name, email, sign out
 */
export default function NavBar() {
  const { instance, accounts } = useMsal();
  const pathname = usePathname();
  const botSession = useBotSession();
  const account = accounts[0];
  const userName = botSession ? BOT_DISPLAY_NAME : account?.name || account?.username || "User";
  const userEmail = botSession ? botSession.email : account?.username || "";

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      className={cn(
        "shrink-0 bg-surface border-b border-border px-4 md:px-5 items-center",
        // Phones: logo left, avatar right, and room for the notch / status bar on top.
        "flex justify-between h-[calc(52px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]",
        // Home-screen app only: iOS fades the area under the clock and the fade runs a bit past
        // the status bar, so drop the logo and avatar 14px lower to clear it. Safari is unaffected.
        "max-sm:[@media(display-mode:standalone)]:h-[calc(66px+env(safe-area-inset-top))] max-sm:[@media(display-mode:standalone)]:pt-[calc(env(safe-area-inset-top)+14px)]",
        // Tablets and computers: unchanged 52px bar with centered tabs.
        "sm:grid sm:grid-cols-[1fr_auto_1fr] sm:h-[52px] sm:pt-0"
      )}
    >
      {/* Left: logo */}
      <Link href="/" className={cn("inline-flex items-center w-fit rounded-control", FOCUS_RING)} aria-label="CRE8 Admin home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cre8-logo.svg" alt="CRE8 Advisors" className="h-6 w-auto" />
      </Link>

      {/* Center: module tabs (hidden on phones — they live in the avatar menu there) */}
      <div className="hidden md:flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavTab key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      {/* Right: account menu */}
      <div className="flex items-center justify-end gap-1">
        <AvatarMenu
          initials={botSession ? "BOT" : initialsFor(account?.name, account?.username)}
          name={userName}
          email={userEmail}
          onSignOut={() => {
            // Signing out forgets the assistant chat saved in this browser.
            clearAssistantMemory();
            if (!botSession) return instance.logoutPopup();
            clearBotSession();
            window.location.replace("/");
          }}
          navItems={NAV_ITEMS}
          isActive={isActive}
        />
      </div>
    </nav>
  );
}

function NavTab({ item, active }: { item: { label: string; href: string }; active: boolean }) {
  return (
    <Link
      href={item.href}
      {...externalProps(item.href)}
      className={cn(
        "h-8 px-3 inline-flex items-center rounded-control text-sm font-medium transition-colors duration-150",
        active ? "bg-surface-2 text-text" : "text-text-2 hover:text-text hover:bg-surface-2/60",
        FOCUS_RING
      )}
    >
      {item.label}
    </Link>
  );
}

/* ── Avatar + popover ── */
function AvatarMenu({
  initials,
  name,
  email,
  onSignOut,
  navItems,
  isActive,
}: {
  initials: string;
  name: string;
  email: string;
  onSignOut: () => void;
  navItems: { label: string; href: string }[];
  isActive: (href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2 rounded-pill p-0.5 pr-0.5 md:pr-0.5 hover:bg-surface-2 transition-colors duration-150",
          FOCUS_RING
        )}
      >
        {/* Small tablets show a menu icon next to the avatar so it's obvious the tabs live here.
            Phones don't need it: their tabs are in the bottom tab bar. */}
        <Menu size={18} strokeWidth={1.75} className="hidden sm:block md:hidden text-text-2 ml-1.5" />
        <span className="w-7 h-7 rounded-full bg-ink text-white text-xs font-semibold flex items-center justify-center select-none">
          {initials}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 bg-surface border border-border rounded-modal shadow-popover py-1.5 animate-slide-up z-50"
        >
          {/* Who's signed in */}
          <div className="px-3.5 py-2">
            <p className="text-sm font-medium text-text truncate">{name}</p>
            {email && <p className="text-xs text-text-3 truncate">{email}</p>}
          </div>

          {/* Module tabs, small tablets only (phones use the bottom tab bar) */}
          <div className="hidden sm:block md:hidden border-t border-border my-1 pt-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                {...externalProps(item.href)}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "block px-3.5 py-2 text-sm transition-colors",
                  isActive(item.href) ? "text-text font-medium bg-surface-2" : "text-text-2 hover:bg-surface-2 hover:text-text"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text transition-colors"
            >
              <LogOut size={16} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
