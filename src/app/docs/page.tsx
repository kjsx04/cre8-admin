"use client";

import { DOC_TYPES } from "@/lib/constants";
import { useRouter } from "next/navigation";

/* Group doc types into categories for Finder-style display */
const CATEGORIES = [
  {
    label: "LOI",
    items: [
      { slug: "loi-land", name: "Land Purchase" },
      { slug: "loi-building", name: "Building Purchase" },
      { slug: "loi-lease", name: "Lease" },
    ],
  },
  {
    label: "Listing Agreement",
    items: [
      { slug: "listing-sale", name: "Sale" },
      { slug: "listing-sale-lease", name: "Sale/Lease" },
      { slug: "listing-lease", name: "Lease" },
    ],
  },
];

export default function DocsPage() {
  const router = useRouter();

  /* Look up enabled status from DOC_TYPES */
  const isEnabled = (slug: string) =>
    DOC_TYPES.find((d) => d.slug === slug)?.enabled ?? false;

  const handleClick = (slug: string) => {
    if (!isEnabled(slug)) return;
    router.push(`/docs/${slug}/complete`);
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <img src="/cre8-logo.svg" alt="CRE8" className="h-7 w-auto" />
          <span className="font-bebas text-[24px] tracking-wide text-[#1a1a1a]">Docs</span>
        </div>
        <p className="text-[#999] text-sm">
          Select a document type to get started.
        </p>
      </div>

      {/* Finder-style grouped list */}
      <div className="flex flex-col gap-6">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            {/* Category heading */}
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#999] mb-2 px-1">
              {cat.label}
            </h2>

            {/* List of items inside a rounded container */}
            <div className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
              {cat.items.map((item, i) => {
                const enabled = isEnabled(item.slug);
                return (
                  <button
                    key={item.slug}
                    onClick={() => handleClick(item.slug)}
                    disabled={!enabled}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors duration-150
                      ${enabled ? "hover:bg-[#F8F8F8] cursor-pointer" : "opacity-40 cursor-not-allowed"}
                      ${i > 0 ? "border-t border-[#E5E5E5]" : ""}`}
                  >
                    <span className="text-[#1a1a1a] text-sm font-medium">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* "Coming Soon" badge for disabled items */}
                      {!enabled && (
                        <span className="text-[10px] text-[#999] uppercase tracking-wide">
                          Coming Soon
                        </span>
                      )}
                      {/* Chevron */}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        className={enabled ? "text-[#999]" : "text-[#CCC]"}
                      >
                        <path
                          d="M6 12L10 8L6 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
