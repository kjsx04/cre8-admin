"use client";

import { ExtractedVariable } from "@/lib/types";

interface ReviewFieldProps {
  token: string;
  variable: ExtractedVariable;
  onChange: (token: string, value: string) => void;
  isWrittenVariant?: boolean;
}

export default function ReviewField({
  token,
  variable,
  onChange,
  isWrittenVariant = false,
}: ReviewFieldProps) {
  const showWarning = !isWrittenVariant && (variable.flag || variable.confidence < 0.85);

  // Written variants render as a small auto-generated label, not an input
  if (isWrittenVariant) {
    if (!variable.value) return null; // Don't show empty written fields
    return (
      <div className="flex items-center gap-2 -mt-2 ml-1">
        <span className="text-xs text-medium-gray">Auto:</span>
        <span className="text-xs text-border-gray italic">{variable.value}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Label + confidence flag */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-[#1A1A1A]">{variable.label}</label>
        {showWarning && (
          <span className="text-xs text-yellow-400 flex items-center gap-1" title="Review this field carefully">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {variable.confidence < 0.85 ? "AI wasn't sure — please confirm" : "Verify"}
          </span>
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={variable.value}
        onChange={(e) => onChange(token, e.target.value)}
        className={`w-full px-3 py-2 rounded-btn text-sm text-[#1A1A1A]
          bg-white border transition-colors duration-200
          focus:border-green
          ${showWarning ? "border-yellow-500/50" : "border-[#E0E0E0]"}
        `}
      />

      {/* Confidence bar */}
      {variable.confidence > 0 && (
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1 bg-border-gray rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                variable.confidence >= 0.85 ? "bg-green" : "bg-yellow-500"
              }`}
              style={{ width: `${variable.confidence * 100}%` }}
            />
          </div>
          <span className="text-xs text-border-gray">
            {Math.round(variable.confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
