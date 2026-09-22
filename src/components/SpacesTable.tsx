"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { Button, IconButton, Input, Select } from "@/components/ui";

/* ============================================================
   TYPES
   ============================================================ */
interface SpaceRow {
  label: string;
  size: string;
  unit: "SF" | "Acres";
}

interface SpacesTableProps {
  /** Current HTML table string from CMS (or empty) */
  value: string;
  /** Called with serialized HTML table whenever rows change */
  onChange: (html: string) => void;
}

/* ============================================================
   PARSE — convert CMS HTML table back into row objects
   Matches format: <td>Space Name</td><td>2500 SF</td>
   ============================================================ */
function parseHtmlToRows(tableHtml: string): SpaceRow[] {
  if (!tableHtml) return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, "text/html");
    const rows = doc.querySelectorAll("tbody tr");
    const result: SpaceRow[] = [];
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 2) {
        const label = (cells[0].textContent || "").trim();
        const sizeText = (cells[1].textContent || "").trim();
        // Parse "2500 SF" or "3.5 Acres"
        const match = sizeText.match(/^([\d,.]+)\s+(SF|Acres)$/i);
        const size = match ? match[1] : sizeText.replace(/[^\d.]/g, "");
        const unit = match && match[2].toLowerCase() === "acres" ? "Acres" : "SF";
        if (label) result.push({ label, size, unit });
      }
    });
    return result;
  } catch {
    return [];
  }
}

/* ============================================================
   SERIALIZE — convert row objects to styled HTML table for CMS
   Must match the exact format the old admin produces.
   (These inline hex colors are part of the SAVED CMS HTML shown
   on the public site — they are data, not admin UI styling.)
   ============================================================ */
function rowsToHtml(rows: SpaceRow[]): string {
  // Filter out empty rows
  const valid = rows.filter((r) => r.label.trim() && r.size.trim());
  if (valid.length === 0) return "";

  const hs =
    "border-bottom:2px solid #ddd;padding:8px 12px;text-align:left;font-weight:600;";
  const cs = "border-bottom:1px solid #eee;padding:8px 12px;";

  // Escape HTML entities
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let t =
    '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
    `<th style="${hs}">Space</th><th style="${hs}">Size</th>` +
    "</tr></thead><tbody>";

  for (const r of valid) {
    t += `<tr><td style="${cs}">${esc(r.label)}</td><td style="${cs}">${esc(r.size + " " + r.unit)}</td></tr>`;
  }

  t += "</tbody></table>";
  return t;
}

/* ============================================================
   COMPONENT
   ============================================================ */
export default function SpacesTable({ value, onChange }: SpacesTableProps) {
  const [rows, setRows] = useState<SpaceRow[]>(() => parseHtmlToRows(value));
  const initialized = useRef(false);

  // Store onChange ref so it's always current
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Emit HTML whenever rows change (skip initial mount)
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    onChangeRef.current(rowsToHtml(rows));
  }, [rows]);

  // ---- Row manipulation ----
  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { label: "", size: "", unit: "SF" }]);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateRow = useCallback(
    (idx: number, field: keyof SpaceRow, val: string) => {
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, [field]: val } : r
        )
      );
    },
    []
  );

  return (
    <div>
      {/* Column labels (sentence case, small grey) */}
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_120px_100px_36px] gap-2 mb-1.5">
          <span className="text-xs font-medium text-text-3">Space name</span>
          <span className="text-xs font-medium text-text-3">Size</span>
          <span className="text-xs font-medium text-text-3">Unit</span>
          <span />
        </div>
      )}

      {/* Rows — tight grid, so gap-2 stays */}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_120px_100px_36px] gap-2 mb-2 items-center"
        >
          {/* Space name */}
          <Input
            type="text"
            value={row.label}
            onChange={(e) => updateRow(idx, "label", e.target.value)}
            placeholder="e.g. Suite 101"
          />

          {/* Size */}
          <Input
            type="text"
            inputMode="decimal"
            value={row.size}
            onChange={(e) => updateRow(idx, "size", e.target.value)}
            placeholder="e.g. 2500"
          />

          {/* Unit dropdown */}
          <Select
            value={row.unit}
            onChange={(e) => updateRow(idx, "unit", e.target.value)}
          >
            <option value="SF">SF</option>
            <option value="Acres">Acres</option>
          </Select>

          {/* Remove button */}
          <IconButton
            label="Remove row"
            variant="secondary"
            icon={<X size={18} strokeWidth={1.75} />}
            onClick={() => removeRow(idx)}
            className="hover:text-danger"
          />
        </div>
      ))}

      {/* Add row button */}
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus size={18} strokeWidth={1.75} />}
        onClick={addRow}
        className="mt-1"
      >
        Add space
      </Button>
    </div>
  );
}
