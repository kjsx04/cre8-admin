"use client";

import type { ReactNode } from "react";
import type { LoiClauseInput } from "@/lib/loi-sections";
import { sectionsFor } from "@/lib/loi-sections";

/**
 * Every letter section can be turned off. The label sits on the left and the
 * checkbox on the right. A checked row opens its wording and fields underneath.
 */
export default function LoiSectionList({
  docTypeId,
  clauses,
  onChange,
  renderFields,
}: {
  docTypeId: string;
  clauses: LoiClauseInput[];
  onChange: (next: LoiClauseInput[]) => void;
  renderFields?: (tokens: string[]) => ReactNode;
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
          const included = clause ? clause.included !== false : false;
          const hasWording = section.variants.length > 0 || !!section.insertText;
          const fieldTokens = section.fields || [];
          const showOptions = included && (hasWording || fieldTokens.length > 0);
          const wording = clause?.customText !== undefined ? clause.customText : (section.insertText || "");
          return (
            <div key={section.id} className="border border-[#E0E0E0] rounded px-2.5 py-1.5">
              <label className="flex items-center gap-3 text-sm text-[#1A1A1A] cursor-pointer">
                <span className="flex-1">{section.label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[#8CC644]"
                  checked={included}
                  onChange={(event) => update(section.id, { included: event.target.checked })}
                />
              </label>
              {showOptions && (
                <div className="mt-2 space-y-2 border-t border-[#E0E0E0] pt-2">
                  {hasWording && (
                    <>
                      <select
                        value={clause?.customText !== undefined ? "saved" : "letter"}
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
                      <textarea
                        value={wording}
                        rows={4}
                        placeholder="Letter wording"
                        onChange={(event) => update(section.id, { included: true, customText: event.target.value })}
                        className="w-full bg-white border border-[#E0E0E0] rounded px-2 py-1 text-xs text-[#1A1A1A]"
                      />
                    </>
                  )}
                  {renderFields && fieldTokens.length > 0 && renderFields(fieldTokens)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
