"use client";

import { EMAIL_SENDERS, BROKER_HEADSHOTS } from "@/lib/email/constants";

interface BrokerAvatarStackProps {
  brokerIds: string[];
  primaryId?: string;
  max?: number;
}

/** Small overlapping headshots — primary first, "+n" when there are more than `max` */
export default function BrokerAvatarStack({ brokerIds, primaryId, max = 3 }: BrokerAvatarStackProps) {
  const ids = Array.from(new Set([primaryId, ...brokerIds].filter(Boolean))) as string[];
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;

  return (
    <div className="flex -space-x-1.5">
      {shown.map((id) => {
        const sender = EMAIL_SENDERS.find((s) => s.id === id);
        const src = BROKER_HEADSHOTS[id];
        const name = sender?.name || "Broker";
        return (
          <span
            key={id}
            title={name}
            className="w-5 h-5 rounded-full ring-2 ring-white overflow-hidden bg-charcoal text-white text-[8px] font-semibold flex items-center justify-center shrink-0"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={name} className="w-full h-full object-cover" />
            ) : (
              name.split(" ").map((p) => p[0]).join("")
            )}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="w-5 h-5 rounded-full ring-2 ring-white bg-light-gray text-medium-gray text-[8px] font-semibold flex items-center justify-center shrink-0">
          +{extra}
        </span>
      )}
    </div>
  );
}
