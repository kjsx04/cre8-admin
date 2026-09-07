"use client";

import { EMAIL_SENDERS, BROKER_HEADSHOTS } from "@/lib/email/constants";
import { FieldProps } from "./fieldProps";

interface BrokerPickerProps {
  /** Selected brokers, in order. The first one is the sender (From address). */
  brokerIds: string[];
  onChange: (ids: string[]) => void;
  fieldProps: FieldProps;
}

/**
 * Broker — a row of headshots.
 *   Single click  → add / remove that broker (they get a contact card in the email)
 *   Double click  → make that broker the sender (the "From" address), adding them if needed
 * The sender is always first in the list and wears the "From" tag.
 */
export default function BrokerPicker({ brokerIds, onChange, fieldProps }: BrokerPickerProps) {
  const toggle = (id: string) => {
    if (brokerIds.includes(id)) onChange(brokerIds.filter((b) => b !== id));
    else onChange([...brokerIds, id]);
  };

  // Double-click: move to the front. The two single clicks that precede a double-click
  // toggle the broker twice (net no change), so this always ends with them selected + first.
  const makeSender = (id: string) => {
    onChange([id, ...brokerIds.filter((b) => b !== id)]);
  };

  const selected = brokerIds
    .map((id) => EMAIL_SENDERS.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div {...fieldProps("broker")} tabIndex={-1} className="outline-none">
      <div className="flex items-center gap-3">
        {EMAIL_SENDERS.map((s) => {
          const idx = brokerIds.indexOf(s.id);
          const active = idx >= 0;
          const src = BROKER_HEADSHOTS[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              onDoubleClick={() => makeSender(s.id)}
              title={
                idx === 0
                  ? `${s.name} — sender`
                  : active
                  ? `${s.name} — click to remove, double-click to send from`
                  : `${s.name} — click to add, double-click to send from`
              }
              className={`relative w-12 h-12 rounded-full transition-all duration-150 ${
                active ? "ring-[3px] ring-green ring-offset-2 opacity-100" : "opacity-50 hover:opacity-90"
              }`}
            >
              <span className="block w-full h-full rounded-full overflow-hidden">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center bg-charcoal text-white text-xs font-semibold">
                    {s.name.split(" ").map((p) => p[0]).join("")}
                  </span>
                )}
              </span>
              {/* "From" tag on the sender */}
              {idx === 0 && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full bg-green text-black text-[9px] font-bold uppercase tracking-wide shadow">
                  From
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-muted-gray">
        {selected.length === 0 ? (
          "Click to add a broker"
        ) : (
          <>
            <span className="text-charcoal font-medium">{selected.map((s) => s.name).join(", ")}</span>
            <span> · sends from {selected[0].name.split(" ")[0]}</span>
          </>
        )}
        <span className="block mt-0.5 text-[11px] text-border-medium">Click to add · Double-click to send from</span>
      </div>
    </div>
  );
}
