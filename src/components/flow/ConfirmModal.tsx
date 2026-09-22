"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** "red" = destructive (cancel deal, delete). Anything else = normal primary button. */
  confirmColor?: "green" | "red";
  showDateInput?: boolean;       // for close deal — ask for actual close date
  showTextInput?: boolean;       // for cancel deal — ask for reason
  textInputLabel?: string;
  onConfirm: (extra?: string) => void;
  onCancel: () => void;
}

/**
 * ConfirmModal — Flow's confirm dialog, now built on the shared Modal.
 * Same props as before, so DealDetail / DealBoard didn't change.
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor = "green",
  showDateInput,
  showTextInput,
  textInputLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [inputValue, setInputValue] = useState("");

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={confirmColor === "red" ? "danger" : "primary"} onClick={() => onConfirm(inputValue || undefined)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-text-2">{message}</p>

      {/* Optional date input (for close deal) */}
      {showDateInput && (
        <Field label="Close date" className="mt-4">
          <Input type="date" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
        </Field>
      )}

      {/* Optional text input (for cancel reason) */}
      {showTextInput && (
        <Field label={textInputLabel || "Reason"} hint="Optional" className="mt-4">
          <Textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)} rows={2} className="min-h-[64px]" />
        </Field>
      )}
    </Modal>
  );
}
