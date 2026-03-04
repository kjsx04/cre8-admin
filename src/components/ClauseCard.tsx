"use client";

import { ClauseState } from "@/lib/types";
import { useState } from "react";

interface ClauseCardProps {
  clause: ClauseState;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onVariableChange: (id: string, varToken: string, value: string) => void;
}

export default function ClauseCard({
  clause,
  onToggle,
  onTextChange,
  onVariableChange,
}: ClauseCardProps) {
  // AI drafted clauses start expanded
  const [expanded, setExpanded] = useState(clause.source === "ai_drafted");
  const [editing, setEditing] = useState(false);

  const sourceLabel =
    clause.source === "logic"
      ? "Standard"
      : clause.source === "library"
      ? "Library"
      : "AI Drafted — Review Carefully";

  const sourceBadgeClass =
    clause.source === "ai_drafted"
      ? "bg-yellow-500/15 text-yellow-400"
      : "bg-white/10 text-medium-gray";

  return (
    <div
      className={`border rounded-card p-4 transition-all duration-200 ${
        clause.included
          ? "border-[#E0E0E0] bg-white"
          : "border-[#E0E0E0]/50 bg-[#F5F5F5] opacity-60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {/* Toggle checkbox */}
          <button
            onClick={() => onToggle(clause.id)}
            className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
              clause.included
                ? "bg-green border-green"
                : "bg-transparent border-border-gray"
            }`}
          >
            {clause.included && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6L5 9L10 3"
                  stroke="black"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          <div className="flex-1">
            {/* Clause name + source badge */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#1A1A1A] text-sm font-semibold">{clause.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${sourceBadgeClass}`}>
                {sourceLabel}
              </span>

              {/* Warning icon for AI drafted */}
              {clause.source === "ai_drafted" && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#EAB308"
                  strokeWidth="2"
                  className="flex-shrink-0"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
            </div>

            {/* Summary */}
            <p className="text-medium-gray text-xs">{clause.summary}</p>
          </div>
        </div>
      </div>

      {/* Clause variables (if any) */}
      {clause.included && Object.keys(clause.variables).length > 0 && (
        <div className="mt-3 ml-8 flex flex-wrap gap-3">
          {Object.entries(clause.variables).map(([varToken, value]) => (
            <div key={varToken} className="flex flex-col gap-0.5">
              <label className="text-xs text-medium-gray">
                {varToken.replace(/_/g, " ")}
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => onVariableChange(clause.id, varToken, e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-[#E0E0E0] rounded text-[#1A1A1A]
                           focus:border-green transition-colors w-32"
              />
            </div>
          ))}
        </div>
      )}

      {/* Expand/collapse + edit controls */}
      {clause.included && (
        <div className="mt-3 ml-8 flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-medium-gray hover:text-[#1A1A1A] transition-colors flex items-center gap-1"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <path d="M4 2L8 6L4 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {expanded ? "Hide clause" : "View clause"}
          </button>

          {(clause.source === "library" || clause.source === "ai_drafted") && (
            <button
              onClick={() => setEditing(!editing)}
              className="text-xs text-medium-gray hover:text-green transition-colors"
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
        </div>
      )}

      {/* Expanded clause text */}
      {clause.included && expanded && (
        <div className="mt-3 ml-8">
          {editing ? (
            <textarea
              value={clause.text}
              onChange={(e) => onTextChange(clause.id, e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-xs bg-white border border-[#E0E0E0] rounded
                         text-[#1A1A1A] focus:border-green transition-colors font-dm leading-relaxed"
            />
          ) : (
            <p className="text-xs text-medium-gray leading-relaxed bg-[#F5F5F5] rounded p-3">
              {clause.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
