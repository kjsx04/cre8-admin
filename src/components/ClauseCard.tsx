"use client";

import { ClauseState } from "@/lib/types";
import { useState } from "react";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { Badge, Button, Field, Input, Textarea, cn } from "@/components/ui";

interface ClauseCardProps {
  clause: ClauseState;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onVariableChange: (id: string, varToken: string, value: string) => void;
}

/**
 * ClauseCard — one optional clause (flexible-mode LOIs). Toggle it on/off,
 * fill its variables, expand to read or edit the text.
 */
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
      : "AI drafted — review carefully";

  return (
    <div
      className={cn(
        "border rounded-card p-4 transition-colors duration-200 bg-surface",
        clause.included ? "border-border" : "border-border bg-surface-2 opacity-60"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {/* Toggle checkbox — green = included (status) */}
          <button
            type="button"
            onClick={() => onToggle(clause.id)}
            aria-pressed={clause.included}
            aria-label={clause.included ? "Exclude clause" : "Include clause"}
            className={cn(
              "mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
              clause.included ? "bg-accent border-accent text-white" : "bg-surface border-border-strong"
            )}
          >
            {clause.included && <Check size={12} strokeWidth={2.5} />}
          </button>

          <div className="flex-1">
            {/* Clause name + source badge */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-text text-sm font-semibold">{clause.label}</span>
              <Badge tone={clause.source === "ai_drafted" ? "warning" : "neutral"}>
                {sourceLabel}
              </Badge>

              {/* Warning icon for AI drafted */}
              {clause.source === "ai_drafted" && (
                <AlertTriangle size={14} strokeWidth={1.75} className="text-warning-fg flex-shrink-0" />
              )}
            </div>

            {/* Summary */}
            <p className="text-text-2 text-xs">{clause.summary}</p>
          </div>
        </div>
      </div>

      {/* Clause variables (if any) */}
      {clause.included && Object.keys(clause.variables).length > 0 && (
        <div className="mt-4 ml-8 flex flex-wrap gap-4">
          {Object.entries(clause.variables).map(([varToken, value]) => (
            // Field + Input primitives — same value/onChange as before
            <Field key={varToken} label={varToken.replace(/_/g, " ")} className="w-36">
              <Input
                type="text"
                small
                value={value}
                onChange={(e) => onVariableChange(clause.id, varToken, e.target.value)}
              />
            </Field>
          ))}
        </div>
      )}

      {/* Expand/collapse + edit controls */}
      {clause.included && (
        <div className="mt-3 ml-8 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            icon={
              <ChevronRight
                size={16}
                strokeWidth={1.75}
                className={cn("transition-transform", expanded && "rotate-90")}
              />
            }
          >
            {expanded ? "Hide clause" : "View clause"}
          </Button>

          {(clause.source === "library" || clause.source === "ai_drafted") && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? "Done" : "Edit"}
            </Button>
          )}
        </div>
      )}

      {/* Expanded clause text */}
      {clause.included && expanded && (
        <div className="mt-3 ml-8">
          {editing ? (
            <Textarea
              value={clause.text}
              onChange={(e) => onTextChange(clause.id, e.target.value)}
              rows={6}
              className="text-xs leading-relaxed"
            />
          ) : (
            <p className="text-xs text-text-2 leading-relaxed bg-surface-2 rounded-control p-3">
              {clause.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
