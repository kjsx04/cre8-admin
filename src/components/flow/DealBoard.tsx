"use client";

import { useState, useRef } from "react";
import { Deal } from "@/lib/flow/types";
import { getNextCriticalDate } from "@/lib/flow/utils";
import DealCard from "./DealCard";

// Generic column config — works for both the Sale board (3 columns) and the Lease board (5 columns)
export interface BoardColumn<K extends string> {
  key: K;
  label: string;
  description: string;
}

interface DealBoardProps<K extends string> {
  deals: Deal[];                          // deals to show on this board
  brokerId: string;
  columns: BoardColumn<K>[];              // column definitions (order = display order)
  getColumn: (deal: Deal) => K;           // maps a deal to its column key
  onCardClick: (deal: Deal) => void;      // open DealDetail slide-over
  onDrop: (deal: Deal, targetColumn: K) => void;  // handle drag-drop between columns
}

export default function DealBoard<K extends string>({ deals, brokerId, columns, getColumn, onCardClick, onDrop }: DealBoardProps<K>) {
  // Track which column is being dragged over (for drop zone styling)
  const [dragOverColumn, setDragOverColumn] = useState<K | null>(null);
  // Track the deal being dragged
  const dragDealRef = useRef<Deal | null>(null);

  // Group deals into columns
  const grouped: Record<string, Deal[]> = {};
  for (const col of columns) grouped[col.key] = [];

  for (const deal of deals) {
    const col = getColumn(deal);
    (grouped[col] || (grouped[col] = [])).push(deal);
  }

  // Sort each column by nearest critical date (most urgent first)
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => {
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

  const handleDragOver = (e: React.DragEvent, column: K) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  };

  const handleDragLeave = (e: React.DragEvent, column: K) => {
    // Only clear if actually leaving the column (not entering a child element)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
    if (dragOverColumn === column) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColumn: K) => {
    e.preventDefault();
    setDragOverColumn(null);

    const deal = dragDealRef.current;
    if (!deal) return;

    // Same-column drop = no-op
    const sourceColumn = getColumn(deal);
    if (sourceColumn === targetColumn) return;

    onDrop(deal, targetColumn);
  };

  // Grid sizing: 3 columns for the Sale board, 5 for the Lease board
  const gridCls = columns.length === 5
    ? "grid grid-cols-5 gap-3 min-w-[1080px]"
    : "grid grid-cols-3 gap-4 min-w-[720px]";

  return (
    <div className={gridCls}>
      {columns.map((col) => {
        const isOver = dragOverColumn === col.key;
        const colDeals = grouped[col.key] || [];

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
            </div>

            {/* Deal cards stacked vertically — empty columns stay blank (still valid drop targets) */}
            {colDeals.length > 0 && (
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
