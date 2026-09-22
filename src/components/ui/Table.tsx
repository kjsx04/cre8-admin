"use client";

import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Table primitives — a real <table> with a sticky header.
 * Wrap in <Card padding="none" className="overflow-auto"> so the header sticks
 * while the rows scroll.
 *
 *   <Table>
 *     <THead><TR><TH>Name</TH><TH align="right">Price</TH></TR></THead>
 *     <tbody>{rows.map(r => <TR key={r.id} onClick={…}><TD>{r.name}</TD><TD align="right" mono>{r.price}</TD></TR>)}</tbody>
 *   </Table>
 *
 * This is the ONE place uppercase text survives (the header labels).
 */
export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full border-collapse text-sm text-text", className)} {...rest}>
      {children}
    </table>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("sticky top-0 z-10 bg-surface-2", className)} {...rest}>
      {children}
    </thead>
  );
}

interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Highlight the row (selected / active) */
  active?: boolean;
}

export function TR({ className, active, onClick, children, ...rest }: TRProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border last:border-b-0 transition-colors duration-100",
        onClick && "cursor-pointer hover:bg-surface-2/60",
        active && "bg-accent-soft/60",
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

interface CellProps {
  align?: "left" | "right" | "center";
  /** Tabular monospace figures — prices, APNs, ids */
  mono?: boolean;
  /** Stop the cell from wrapping */
  nowrap?: boolean;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

export function TH({ align = "left", className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      className={cn("h-10 px-4 text-label uppercase font-semibold text-text-3 whitespace-nowrap border-b border-border", ALIGN[align], className)}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({ align = "left", mono, nowrap, className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cn("h-11 px-4 align-middle", ALIGN[align], mono && "font-mono text-xs tabular-nums", nowrap && "whitespace-nowrap", className)}
      {...rest}
    >
      {children}
    </td>
  );
}

/** Convenience: a full-width row with centered content (empty / loading states inside a table) */
export function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  );
}
