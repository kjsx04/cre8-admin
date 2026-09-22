"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";

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
    // Shared Modal primitive — destructive action, so the confirm button is red
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Mark as sold"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={loading}>
            Mark sold and stop campaigns
          </Button>
        </>
      }
    >
      <p className="text-text-2">
        This will stop <strong>{activeCampaignCount}</strong> active campaign{activeCampaignCount !== 1 ? "s" : ""} for{" "}
        <strong>{listingName}</strong> and cancel any pending sends.
      </p>

      {/* Send announcement toggle */}
      <label className="flex items-center gap-3 cursor-pointer mt-4">
        <input
          type="checkbox"
          checked={sendAnnouncement}
          onChange={(e) => setSendAnnouncement(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-accent"
        />
        <span className="text-sm text-text">
          Send a &ldquo;Just Sold&rdquo; announcement email
        </span>
      </label>
    </Modal>
  );
}
