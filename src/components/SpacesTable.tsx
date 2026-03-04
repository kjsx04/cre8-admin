"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
      {/* Table header */}
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_120px_90px_36px] gap-2 mb-2">
          <span className="text-[10px] font-semibold text-[#777] uppercase tracking-wider">
            Space Name
          </span>
          <span className="text-[10px] font-semibold text-[#777] uppercase tracking-wider">
            Size
          </span>
          <span className="text-[10px] font-semibold text-[#777] uppercase tracking-wider">
            Unit
          </span>
          <span />
        </div>
      )}

      {/* Rows */}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_120px_90px_36px] gap-2 mb-2 items-center"
        >
          {/* Space name */}
          <input
            type="text"
            value={row.label}
            onChange={(e) => updateRow(idx, "label", e.target.value)}
            placeholder="e.g. Suite 101"
            className="bg-white border border-[#E5E5E5] rounded-btn px-3 py-1.5 text-sm text-[#333]
                       placeholder:text-[#BBB] outline-none focus:border-green transition-colors"
          />

          {/* Size */}
          <input
            type="text"
            inputMode="decimal"
            value={row.size}
            onChange={(e) => updateRow(idx, "size", e.target.value)}
            placeholder="e.g. 2500"
            className="bg-white border border-[#E5E5E5] rounded-btn px-3 py-1.5 text-sm text-[#333]
                       placeholder:text-[#BBB] outline-none focus:border-green transition-colors"
          />

          {/* Unit dropdown */}
          <select
            value={row.unit}
            onChange={(e) => updateRow(idx, "unit", e.target.value)}
            className="bg-white border border-[#E5E5E5] rounded-btn px-2 py-1.5 text-sm text-[#333]
                       outline-none focus:border-green transition-colors"
          >
            <option value="SF">SF</option>
            <option value="Acres">Acres</option>
          </select>

          {/* Remove button */}
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="w-8 h-8 rounded-btn border border-[#E5E5E5] flex items-center justify-center
                       text-[#777] hover:text-[#CC3333] hover:border-[#CC3333] transition-colors text-sm"
            title="Remove row"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Add row button */}
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-green font-semibold hover:underline mt-1"
      >
        + Add Space
      </button>
    </div>
  );
}
