"use client";

import { useMsal } from "@azure/msal-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

/* Navigation tabs — add more here as new sections are built */
const NAV_ITEMS = [
  { label: "Listings", href: "/" },
  { label: "Docs", href: "/docs" },
  { label: "Flow", href: "/flow" },
  { label: "Marketing", href: "/marketing" },
];

export default function NavBar() {
  const { instance, accounts } = useMsal();
  const pathname = usePathname();
  const account = accounts[0];
  const userName = account?.name || account?.username || "User";

  const handleSignOut = () => {
    instance.logoutPopup();
  };

  /* Check if a nav item is active based on current path */
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="h-14 bg-charcoal border-b border-border-gray flex items-center justify-between px-6">
      {/* Left: Logo + nav tabs */}
      <div className="flex items-center gap-5">
        {/* CRE8 logo */}
        <img
          src="https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/6717f6e1c60fe16248597819_CRE8%20White.svg"
          alt="CRE8 Advisors"
          className="h-7 w-auto"
        />
        <span className="text-border-gray">|</span>

        {/* Nav tabs */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors duration-150
                ${
                  isActive(item.href)
                    ? "text-white bg-dark-gray"
                    : "text-medium-gray hover:text-white"
                }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Right: User name + sign out */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-medium-gray">{userName}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-medium-gray hover:text-white transition-colors duration-200"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}
