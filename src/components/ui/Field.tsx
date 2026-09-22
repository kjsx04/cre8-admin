"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

interface FieldProps {
  label?: ReactNode;
  /** Grey helper text under the control */
  hint?: ReactNode;
  /** Red message under the control (replaces the hint while present) */
  error?: ReactNode;
  required?: boolean;
  /** id of the control inside, so the label focuses it */
  htmlFor?: string;
  /** Something small on the right of the label row (a link, a toggle) */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Field — label + control + hint/error. The one label style in the app.
 *   <Field label="Property name" required error={errors.name}>
 *     <Input value={name} onChange={…} invalid={!!errors.name} />
 *   </Field>
 * Stack fields with `space-y-4` (16px).
 */
export default function Field({ label, hint, error, required, htmlFor, action, className, children }: FieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      {(label || action) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <label htmlFor={htmlFor} className="text-sm font-medium text-text">
              {label}
              {required && <span className="text-danger-fg ml-0.5">*</span>}
            </label>
          )}
          {action && <span className="text-xs text-text-3">{action}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-fg mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-3 mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}
