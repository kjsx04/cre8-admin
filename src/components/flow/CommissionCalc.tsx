"use client";

import { Deal } from "@/lib/flow/types";
import {
  formatCurrency,
  formatPercent,
  getMemberSplit,
} from "@/lib/flow/utils";
import { Card } from "@/components/ui";

interface CommissionCalcProps {
  deal: Deal;
  brokerId?: string;
}

export default function CommissionCalc({ deal, brokerId }: CommissionCalcProps) {
  const commission = (deal.price || 0) * deal.commission_rate;
  const houseCut = commission * 0.30;
  const afterHouse = commission * 0.70;
  const memberSplit = getMemberSplit(deal.deal_members, brokerId || "");
  const myShare = afterHouse * memberSplit;
  const splits = deal.additional_splits || [];
  const deductions = splits.reduce((sum, s) => sum + myShare * s.percent, 0);
  const takeHome = myShare - deductions;
  const memberCount = deal.deal_members?.length || 1;

  return (
    // Card primitive — hairline border, no shadow
    <Card padding="sm">
      <h3 className="text-sm font-semibold text-text mb-3">Commission breakdown</h3>

      <div className="space-y-2 text-sm">
        {/* Total commission */}
        <div className="flex justify-between">
          <span className="text-text-2">Total commission ({formatPercent(deal.commission_rate)})</span>
          <span className="font-medium text-text tabular-nums">{formatCurrency(commission)}</span>
        </div>

        {/* House cut */}
        <div className="flex justify-between">
          <span className="text-text-2">House (30%)</span>
          <span className="text-text-2 tabular-nums">−{formatCurrency(houseCut)}</span>
        </div>

        <div className="border-t border-border" />

        {/* After house */}
        <div className="flex justify-between">
          <span className="text-text-2 font-medium">After house</span>
          <span className="font-medium text-text tabular-nums">{formatCurrency(afterHouse)}</span>
        </div>

        {/* Broker splits — only show individual lines when multiple brokers */}
        {memberCount > 1 && deal.deal_members && (
          <>
            <div className="border-t border-border" />
            {deal.deal_members.map((m) => {
              const split = m.split_percent !== null ? m.split_percent : 1 / memberCount;
              const share = afterHouse * split;
              const isYou = m.broker_id === brokerId;
              return (
                <div key={m.broker_id} className="flex justify-between">
                  <span className={isYou ? "text-text font-medium" : "text-text-2"}>
                    {m.broker_name || (isYou ? "You" : "Broker")} ({(split * 100).toFixed(0)}%)
                  </span>
                  <span className={isYou ? "font-medium text-text tabular-nums" : "text-text-2 tabular-nums"}>
                    {formatCurrency(share)}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* Additional split deductions */}
        {splits.length > 0 && splits.some((s) => s.percent > 0) && (
          <>
            <div className="border-t border-border" />
            {splits.map((s, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-text-2">{s.label} ({(s.percent * 100).toFixed(0)}%)</span>
                <span className="text-text-2 tabular-nums">−{formatCurrency(myShare * s.percent)}</span>
              </div>
            ))}
          </>
        )}

        <div className="border-t border-border" />

        {/* Take-home — green is status here (the money that lands) */}
        <div className="flex justify-between items-center">
          <span className="font-semibold text-text">Take-home</span>
          <span className="font-semibold text-accent-strong text-lg tabular-nums">{formatCurrency(takeHome)}</span>
        </div>
      </div>
    </Card>
  );
}
