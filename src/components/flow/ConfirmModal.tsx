"use client";

import { useState } from "react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: "green" | "red";
  showDateInput?: boolean;       // for close deal — ask for actual close date
  showTextInput?: boolean;       // for cancel deal — ask for reason
  textInputLabel?: string;
  onConfirm: (extra?: string) => void;
  onCancel: () => void;
}

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

  const btnClass = confirmColor === "red"
    ? "bg-red-500 hover:bg-red-600 text-white"
    : "bg-green hover:bg-green/90 text-black uppercase tracking-wide";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white rounded-card border border-border-light p-6 w-full max-w-md mx-4">
        <h3 className="font-dm font-semibold text-lg text-charcoal mb-2">{title}</h3>
        <p className="text-sm text-medium-gray mb-4">{message}</p>

        {/* Optional date input (for close deal) */}
        {showDateInput && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-charcoal mb-1">Close Date</label>
            <input
              type="date"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full border border-border-light rounded-btn px-3 py-2 text-sm"
            />
          </div>
        )}

        {/* Optional text input (for cancel reason) */}
        {showTextInput && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-charcoal mb-1">
              {textInputLabel || "Reason"} <span className="text-muted-gray font-normal">(optional)</span>
            </label>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={2}
              className="w-full border border-border-light rounded-btn px-3 py-2 text-sm resize-none"
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-medium-gray border border-border-light rounded-btn
                       hover:border-border-medium transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(inputValue || undefined)}
            className={`px-4 py-2 text-sm font-medium rounded-btn transition-colors duration-200 ${btnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
