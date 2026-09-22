"use client";

import { ExtractedVariable } from "@/lib/types";
import { AlertTriangle } from "lucide-react";
import { Field, Input } from "@/components/ui";

interface ReviewFieldProps {
  token: string;
  variable: ExtractedVariable;
  onChange: (token: string, value: string) => void;
  isWrittenVariant?: boolean;
}

/**
 * ReviewField — one AI-extracted variable with a confidence bar.
 * Low confidence / flagged fields get a warning next to the label.
 */
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
        <span className="text-xs text-text-2">Auto:</span>
        <span className="text-xs text-text-3">{variable.value}</span>
      </div>
    );
  }

  return (
    // Field primitive gives us the label; the warning rides in its `action` slot
    <Field
      label={variable.label}
      action={
        showWarning ? (
          <span className="text-warning-fg flex items-center gap-1" title="Review this field carefully">
            <AlertTriangle size={14} strokeWidth={1.75} />
            {variable.confidence < 0.85 ? "AI wasn't sure — please confirm" : "Verify"}
          </span>
        ) : undefined
      }
    >
      {/* Input — same value/onChange as before */}
      <Input
        type="text"
        value={variable.value}
        onChange={(e) => onChange(token, e.target.value)}
        className={showWarning ? "border-warning-fg/50" : undefined}
      />

      {/* Confidence bar */}
      {variable.confidence > 0 && (
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1 bg-surface-2 rounded-pill overflow-hidden">
            <div
              className={`h-full rounded-pill transition-all ${
                variable.confidence >= 0.85 ? "bg-accent" : "bg-warning-fg"
              }`}
              style={{ width: `${variable.confidence * 100}%` }}
            />
          </div>
          <span className="text-xs text-text-3">
            {Math.round(variable.confidence * 100)}%
          </span>
        </div>
      )}
    </Field>
  );
}
