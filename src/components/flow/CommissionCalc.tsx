"use client";

import { Deal } from "@/lib/flow/types";
import {
  formatCurrency,
  formatPercent,
  getMemberSplit,
} from "@/lib/flow/utils";

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
    <div className="bg-white border border-border-light rounded-card p-4">
      <h3 className="font-bebas text-base tracking-wide uppercase text-charcoal mb-3">Commission Breakdown</h3>

      <div className="space-y-2 text-sm">
        {/* Total commission */}
        <div className="flex justify-between">
          <span className="text-medium-gray">Total Commission ({formatPercent(deal.commission_rate)})</span>
          <span className="font-medium">{formatCurrency(commission)}</span>
        </div>

        {/* House cut */}
        <div className="flex justify-between">
          <span className="text-medium-gray">House (30%)</span>
          <span className="text-medium-gray">−{formatCurrency(houseCut)}</span>
        </div>

        <div className="border-t border-border-light" />

        {/* After house */}
        <div className="flex justify-between">
          <span className="text-medium-gray font-medium">After House</span>
          <span className="font-medium">{formatCurrency(afterHouse)}</span>
        </div>

        {/* Broker splits — only show individual lines when multiple brokers */}
        {memberCount > 1 && deal.deal_members && (
          <>
            <div className="border-t border-border-light" />
            {deal.deal_members.map((m) => {
              const split = m.split_percent !== null ? m.split_percent : 1 / memberCount;
              const share = afterHouse * split;
              const isYou = m.broker_id === brokerId;
              return (
                <div key={m.broker_id} className="flex justify-between">
                  <span className={isYou ? "text-charcoal font-medium" : "text-medium-gray"}>
                    {m.broker_name || (isYou ? "You" : "Broker")} ({(split * 100).toFixed(0)}%)
                  </span>
                  <span className={isYou ? "font-medium" : "text-medium-gray"}>
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
            <div className="border-t border-border-light" />
            {splits.map((s, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-medium-gray">{s.label} ({(s.percent * 100).toFixed(0)}%)</span>
                <span className="text-medium-gray">−{formatCurrency(myShare * s.percent)}</span>
              </div>
            ))}
          </>
        )}

        <div className="border-t border-border-light" />

        {/* Take-home */}
        <div className="flex justify-between items-center">
          <span className="font-semibold text-charcoal">Take-Home</span>
          <span className="font-bold text-green text-lg">{formatCurrency(takeHome)}</span>
        </div>
      </div>
    </div>
  );
}
