"use client";

import { useState } from "react";

interface MarkSoldModalProps {
  listingName: string;
  activeCampaignCount: number;
  onConfirm: (sendAnnouncement: boolean) => Promise<void>;
  onClose: () => void;
}

/** Confirmation modal: stop all recurring campaigns for a listing, optionally send Just Sold */
export default function MarkSoldModal({
  listingName,
  activeCampaignCount,
  onConfirm,
  onClose,
}: MarkSoldModalProps) {
  const [sendAnnouncement, setSendAnnouncement] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(sendAnnouncement);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-card shadow-lg w-full max-w-md p-6">
        <h3 className="font-bebas text-xl tracking-wide text-charcoal mb-2">
          Mark as Sold
        </h3>
        <p className="text-sm text-medium-gray mb-4">
          This will stop <strong>{activeCampaignCount}</strong> active campaign{activeCampaignCount !== 1 ? "s" : ""} for{" "}
          <strong>{listingName}</strong> and cancel any pending sends.
        </p>

        {/* Send announcement toggle */}
        <label className="flex items-center gap-3 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={sendAnnouncement}
            onChange={(e) => setSendAnnouncement(e.target.checked)}
            className="w-4 h-4 rounded border-border-light text-green focus:ring-green"
          />
          <span className="text-sm text-charcoal">
            Send a &ldquo;Just Sold&rdquo; announcement email
          </span>
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-gray hover:text-charcoal transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 bg-red-500 text-white text-sm font-semibold rounded-btn hover:bg-red-600 transition disabled:opacity-50"
          >
            {loading ? "Processing..." : "Mark Sold & Stop Campaigns"}
          </button>
        </div>
      </div>
    </div>
  );
}
