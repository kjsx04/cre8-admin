"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { cn, FOCUS_RING } from "@/components/ui";

/* Module tabs — add more here as new sections are built */
const NAV_ITEMS = [
  { label: "Listings", href: "/" },
  { label: "Flow", href: "/flow" },
  { label: "Docs", href: "/docs" },
  { label: "Marketing", href: "/marketing" },
  { label: "Intel", href: "/intel" },
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
  const account = accounts[0];
  const userName = account?.name || account?.username || "User";
  const userEmail = account?.username || "";

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="h-[52px] shrink-0 bg-surface border-b border-border px-4 md:px-5 grid grid-cols-[1fr_auto_1fr] items-center">
      {/* Left: logo */}
      <Link href="/" className={cn("inline-flex items-center w-fit rounded-control", FOCUS_RING)} aria-label="CRE8 Admin home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cre8-logo.svg" alt="CRE8 Advisors" className="h-6 w-auto" />
      </Link>

      {/* Center: module tabs (hidden on phones — they live in the avatar menu there) */}
      <div className="hidden md:flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "h-8 px-3 inline-flex items-center rounded-control text-sm font-medium transition-colors duration-150",
              isActive(item.href) ? "bg-surface-2 text-text" : "text-text-2 hover:text-text hover:bg-surface-2/60",
              FOCUS_RING
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Right: avatar menu */}
      <div className="flex items-center justify-end">
        <AvatarMenu
          initials={initialsFor(account?.name, account?.username)}
          name={userName}
          email={userEmail}
          onSignOut={() => instance.logoutPopup()}
          navItems={NAV_ITEMS}
          isActive={isActive}
        />
      </div>
    </nav>
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
        {/* On phones show a menu icon next to the avatar so it's obvious the tabs live here */}
        <Menu size={18} strokeWidth={1.75} className="md:hidden text-text-2 ml-1.5" />
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

          {/* Module tabs, phones only */}
          <div className="md:hidden border-t border-border my-1 pt-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
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
