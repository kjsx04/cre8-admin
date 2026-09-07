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
 * Broker — a row of headshots. Click to add or remove a broker.
 * Every selected broker gets a contact card in the email; the first one picked
 * is the sender. The primary shows a small "From" tag.
 */
export default function BrokerPicker({ brokerIds, onChange, fieldProps }: BrokerPickerProps) {
  const toggle = (id: string) => {
    if (brokerIds.includes(id)) onChange(brokerIds.filter((b) => b !== id));
    else onChange([...brokerIds, id]);
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
              title={active ? `${s.name} — click to remove` : s.name}
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
          "Pick at least one"
        ) : (
          <>
            <span className="text-charcoal font-medium">{selected.map((s) => s.name).join(", ")}</span>
            {selected.length > 1 && <span> · sends from {selected[0].name.split(" ")[0]}</span>}
          </>
        )}
      </div>
    </div>
  );
}
