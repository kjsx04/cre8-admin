"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";

/**
 * Miles for one tenant. The gray placeholder is the category default.
 * An empty field stores null, which means "use that default".
 */
export default function SiteSpacingField({
  value,
  fallback,
  onChange,
}: {
  value: number | null;
  fallback: number | null;
  onChange: (value: number | null) => void;
}) {
  const focused = useRef(false);
  const [text, setText] = useState(value == null ? "" : String(value));

  useEffect(() => {
    if (focused.current) return;
    setText(value == null ? "" : String(value));
  }, [value]);

  return (
    <Field label="Site spacing (miles)">
      <Input
        type="text"
        inputMode="decimal"
        placeholder={fallback != null ? String(fallback) : ""}
        aria-label="Site spacing (miles)"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setText(value == null ? "" : String(value));
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "") {
            onChange(null);
            return;
          }
          const miles = Number(next);
          if (Number.isFinite(miles)) onChange(miles);
        }}
      />
    </Field>
  );
}
