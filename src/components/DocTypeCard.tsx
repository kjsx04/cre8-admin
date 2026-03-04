"use client";

import { DocType } from "@/lib/types";
import { useRouter } from "next/navigation";

interface DocTypeCardProps {
  docType: DocType;
}

export default function DocTypeCard({ docType }: DocTypeCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!docType.enabled) return;
    router.push(`/docs/${docType.slug}/complete`);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!docType.enabled}
      className={`text-left w-full p-6 rounded-card border transition-all duration-200
        ${
          docType.enabled
            ? "bg-white border-[#E0E0E0] hover:border-green cursor-pointer"
            : "bg-[#F5F5F5] border-[#E0E0E0] opacity-50 cursor-not-allowed"
        }`}
    >
      {/* Coming Soon indicator for disabled cards */}
      {!docType.enabled && (
        <span className="text-xs text-medium-gray mb-3 block">Coming Soon</span>
      )}

      {/* Name */}
      <h3 className="text-[#1A1A1A] font-semibold text-lg mb-1">{docType.name}</h3>

      {/* Description */}
      <p className="text-medium-gray text-sm">{docType.description}</p>

      {/* Arrow indicator for enabled cards */}
      {docType.enabled && (
        <div className="mt-4 text-green text-sm font-semibold flex items-center gap-1">
          Start
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="mt-px"
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
      )}
    </button>
  );
}
