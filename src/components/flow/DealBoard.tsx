"use client";

import { useState, useRef } from "react";
import { Deal } from "@/lib/flow/types";
import { KanbanColumn, KANBAN_COLUMNS, getKanbanColumn, getNextCriticalDate } from "@/lib/flow/utils";
import DealCard from "./DealCard";

interface DealBoardProps {
  deals: Deal[];                          // all active deals (active + due_diligence + closing)
  brokerId: string;
  onCardClick: (deal: Deal) => void;      // open DealDetail slide-over
  onDrop: (deal: Deal, targetColumn: KanbanColumn) => void;  // handle drag-drop between columns
}

export default function DealBoard({ deals, brokerId, onCardClick, onDrop }: DealBoardProps) {
  // Track which column is being dragged over (for drop zone styling)
  const [dragOverColumn, setDragOverColumn] = useState<KanbanColumn | null>(null);
  // Track the deal being dragged
  const dragDealRef = useRef<Deal | null>(null);

  // Group deals into columns
  const columns: Record<KanbanColumn, Deal[]> = {
    pre_escrow: [],
    due_diligence: [],
    closing: [],
  };

  for (const deal of deals) {
    const col = getKanbanColumn(deal);
    columns[col].push(deal);
  }

  // Sort each column by nearest critical date (most urgent first)
  for (const col of Object.keys(columns) as KanbanColumn[]) {
    columns[col].sort((a, b) => {
      const nextA = getNextCriticalDate(a);
      const nextB = getNextCriticalDate(b);
      if (!nextA && !nextB) return 0;
      if (!nextA) return 1;
      if (!nextB) return -1;
      return nextA.daysAway - nextB.daysAway;
    });
  }

  // ── Drag handlers ──

  const handleDragStart = (e: React.DragEvent, deal: Deal) => {
    dragDealRef.current = deal;
    // Set drag data (required for HTML5 DnD)
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", deal.id);
    // Make the dragged card semi-transparent
    const target = e.currentTarget as HTMLElement;
    setTimeout(() => { target.style.opacity = "0.4"; }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    dragDealRef.current = null;
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, column: KanbanColumn) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  };

  const handleDragLeave = (e: React.DragEvent, column: KanbanColumn) => {
    // Only clear if actually leaving the column (not entering a child element)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
    if (dragOverColumn === column) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColumn: KanbanColumn) => {
    e.preventDefault();
    setDragOverColumn(null);

    const deal = dragDealRef.current;
    if (!deal) return;

    // Same-column drop = no-op
    const sourceColumn = getKanbanColumn(deal);
    if (sourceColumn === targetColumn) return;

    onDrop(deal, targetColumn);
  };

  return (
    <div className="grid grid-cols-3 gap-4 min-w-[720px]">
      {KANBAN_COLUMNS.map((col) => {
        const isOver = dragOverColumn === col.key;
        const colDeals = columns[col.key];

        return (
          <div
            key={col.key}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={(e) => handleDragLeave(e, col.key)}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`rounded-card border border-border-light transition-colors duration-200 p-3 min-h-[200px]
              ${isOver
                ? "border-green bg-green/5"
                : "bg-light-gray"
              }`}
          >
            {/* Column header */}
            <div className="mb-3 px-1">
              <div className="flex items-baseline justify-between">
                <h3 className="font-bebas text-base tracking-wide uppercase text-charcoal">{col.label}</h3>
                <span className="text-xs font-medium text-muted-gray bg-white border border-border-light rounded-btn px-2 py-0.5">
                  {colDeals.length}
                </span>
              </div>
              <p className="text-xs text-muted-gray mt-0.5">{col.description}</p>
            </div>

            {/* Deal cards stacked vertically */}
            {colDeals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-muted-gray">No deals in this stage</p>
              </div>
            ) : (
              <div className="space-y-3">
                {colDeals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    brokerId={brokerId}
                    onClick={() => onCardClick(deal)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, deal)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
