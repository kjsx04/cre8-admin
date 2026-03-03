"use client";

import { Deal } from "@/lib/flow/types";
import {
  formatCurrency,
  formatPercent,
  calcCommission,
  calcBrokerSplit,
  calcAfterHouse,
  calcTakeHome,
} from "@/lib/flow/utils";

interface CommissionCalcProps {
  deal: Deal;
}

export default function CommissionCalc({ deal }: CommissionCalcProps) {
  const commission = calcCommission(deal.price, deal.commission_rate);
  const brokerSplit = calcBrokerSplit(deal.price, deal.commission_rate, deal.broker_split);
  const afterHouse = calcAfterHouse(deal.price, deal.commission_rate, deal.broker_split);
  const houseCut = brokerSplit - afterHouse; // 30% of broker split
  const splits = deal.additional_splits || [];
  const takeHome = calcTakeHome(deal.price, deal.commission_rate, deal.broker_split, splits);

  return (
    <div className="bg-white border border-border-light rounded-card p-4">
      <h3 className="font-bebas text-base tracking-wide uppercase text-charcoal mb-3">Commission Breakdown</h3>

      <div className="space-y-2 text-sm">
        {/* Price */}
        <div className="flex justify-between">
          <span className="text-medium-gray">Sale Price</span>
          <span className="font-medium">{formatCurrency(deal.price)}</span>
        </div>

        {/* Commission rate + amount */}
        <div className="flex justify-between">
          <span className="text-medium-gray">Commission ({formatPercent(deal.commission_rate)})</span>
          <span className="font-medium">{formatCurrency(commission)}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-border-light my-2" />

        {/* Broker split */}
        <div className="flex justify-between">
          <span className="text-medium-gray">Your Split ({formatPercent(deal.broker_split)})</span>
          <span className="font-medium">{formatCurrency(brokerSplit)}</span>
        </div>

        {/* House cut */}
        <div className="flex justify-between">
          <span className="text-medium-gray">House (30%)</span>
          <span className="text-medium-gray">−{formatCurrency(houseCut)}</span>
        </div>

        {/* After house (only show if there are additional splits) */}
        {splits.length > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-medium-gray">After House</span>
              <span className="font-medium">{formatCurrency(afterHouse)}</span>
            </div>

            {/* Additional splits */}
            {splits.map((s, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-medium-gray">
                  {s.label} ({(s.percent * 100).toFixed(0)}%)
                </span>
                <span className="text-medium-gray">
                  −{formatCurrency(afterHouse * s.percent)}
                </span>
              </div>
            ))}
          </>
        )}

        {/* Divider */}
        <div className="border-t border-border-light my-2" />

        {/* Take-home */}
        <div className="flex justify-between items-center">
          <span className="font-semibold text-charcoal">Take-Home</span>
          <span className="font-bold text-green text-lg">{formatCurrency(takeHome)}</span>
        </div>
      </div>
    </div>
  );
}
