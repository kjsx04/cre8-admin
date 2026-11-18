"use client";

import type { LoiClauseInput } from "@/lib/loi-sections";
import { sectionsFor } from "@/lib/loi-sections";

/**
 * Checkboxes for the letter's sections. Required ones stay on.
 * A saved wording choice fills the text box; edits go out through clausePayload.
 */
export default function LoiSectionList({
  docTypeId,
  clauses,
  onChange,
}: {
  docTypeId: string;
  clauses: LoiClauseInput[];
  onChange: (next: LoiClauseInput[]) => void;
}) {
  const sections = sectionsFor(docTypeId);
  if (sections.length === 0) return null;
  const byId = new Map(clauses.map((clause) => [clause.id, clause]));

  function update(id: string, patch: Partial<LoiClauseInput>) {
    onChange(
      sections.map((section) => {
        const current = byId.get(section.id) || { id: section.id, included: false };
        return section.id === id ? { ...current, ...patch, id } : current;
      })
    );
  }

  return (
    <div className="mb-4">
      <h2 className="font-bebas text-lg tracking-wide text-medium-gray mb-2">SECTIONS</h2>
      <div className="space-y-2">
        {sections.map((section) => {
          const clause = byId.get(section.id);
          const included = section.required || clause?.included !== false;
          return (
            <div key={section.id} className="border border-[#E0E0E0] rounded px-2.5 py-1.5">
              <label className="flex items-center gap-2 text-sm text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={included}
                  disabled={section.required}
                  onChange={(event) => update(section.id, { included: event.target.checked, customText: undefined })}
                />
                <span className={section.required ? "text-medium-gray" : ""}>{section.label}</span>
              </label>
              {included && !section.required && (section.variants.length > 0 || section.insertText) && (
                <div className="mt-1.5 space-y-1.5">
                  <select
                    value={clause?.customText ? "saved" : "letter"}
                    onChange={(event) => {
                      if (event.target.value === "letter") {
                        update(section.id, { included: true, customText: undefined });
                        return;
                      }
                      const variant = section.variants[0];
                      const text = variant?.text || section.insertText || "";
                      update(section.id, { included: true, customText: text });
                    }}
                    className="w-full bg-white border border-[#E0E0E0] rounded px-2 py-1 text-xs text-[#1A1A1A]"
                  >
                    <option value="letter">Letter wording</option>
                    <option value="saved">{section.variants[0]?.label || "Saved wording"}</option>
                  </select>
                  {clause?.customText !== undefined && (
                    <textarea
                      value={clause.customText || ""}
                      rows={3}
                      onChange={(event) => update(section.id, { included: true, customText: event.target.value })}
                      className="w-full bg-white border border-[#E0E0E0] rounded px-2 py-1 text-xs text-[#1A1A1A]"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
