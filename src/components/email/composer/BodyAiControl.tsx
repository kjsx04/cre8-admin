"use client";

import { useEffect, useState } from "react";
import { BodyLength } from "@/lib/email/listing-context";

const OPTIONS: { id: BodyLength; label: string }[] = [
  { id: "2-sentences", label: "2 sentences" },
  { id: "1-paragraph", label: "1 paragraph" },
  { id: "2-paragraphs", label: "2 paragraphs" },
];

interface BodyAiControlProps {
  listingIds: string[];
  kind: "single" | "group";
  userEmail: string;
  disabled?: boolean;
  onInsert: (text: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export default function BodyAiControl({
  listingIds,
  kind,
  userEmail,
  disabled,
  onInsert,
  onUndo,
  canUndo,
}: BodyAiControlProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function generate(length: BodyLength) {
    if (loading || disabled || listingIds.length === 0) return;
    setLoading(true);
    setError(null);
    setOpen(false);
    try {
      const res = await fetch("/api/email/body-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ listingIds, length, kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Draft failed (${res.status})`);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) throw new Error("Empty draft");
      onInsert(text);
      setToast(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't write a draft");
    } finally {
      setLoading(false);
    }
  }

  const blocked = disabled || listingIds.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={blocked || loading}
          onClick={() => {
            setError(null);
            setOpen((v) => !v);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-card border border-border-light bg-white text-[12px] font-medium text-medium-gray hover:text-charcoal hover:border-green/40 hover:bg-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={blocked ? "Pick a listing first" : "Draft body copy from the listing"}
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-medium-gray/30 border-t-medium-gray rounded-full animate-spin" />
              Writing…
            </>
          ) : (
            "Use AI"
          )}
        </button>
        {open && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => generate(o.id)}
                className="px-2.5 py-1 rounded-card border border-transparent bg-white text-[12px] font-medium text-medium-gray hover:text-charcoal hover:border-green/40 hover:bg-green/10 transition-colors"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {toast && (
        <p className="text-[11px] text-medium-gray">
          AI draft inserted — edit freely
          {canUndo && (
            <>
              {" · "}
              <button type="button" onClick={onUndo} className="underline hover:text-charcoal">
                Undo
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
