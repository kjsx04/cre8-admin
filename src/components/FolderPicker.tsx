"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, Folder } from "lucide-react";
import { listFolderChildren, FolderItem } from "@/lib/graph";
import { Button, EmptyState, LoadingBlock, Modal, cn, FOCUS_RING } from "@/components/ui";

interface FolderPickerProps {
  /** Graph API access token */
  accessToken: string;
  /** SharePoint drive ID */
  driveId: string;
  /** Current selected folder path (display name) */
  currentPath: string;
  /** Called when the user selects a folder */
  onSelect: (folderPath: string) => void;
  /** Called to close the modal */
  onClose: () => void;
}

/**
 * Modal that lets the user browse SharePoint folders and pick a save location.
 * Built on the shared <Modal> primitive — same props as before.
 */
export default function FolderPicker({
  accessToken,
  driveId,
  currentPath,
  onSelect,
  onClose,
}: FolderPickerProps) {
  // The path we're currently browsing (empty = drive root)
  const [browsePath, setBrowsePath] = useState(
    currentPath.replace(/^\/+/, "").replace(/\/+$/, "")
  );
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load folders whenever browsePath changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listFolderChildren(accessToken, driveId, browsePath)
      .then((items) => {
        if (!cancelled) {
          setFolders(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("FolderPicker error:", err);
          setError("Could not load folders.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, driveId, browsePath]);

  // Navigate into a subfolder
  function navigateInto(folderName: string) {
    setBrowsePath(browsePath ? `${browsePath}/${folderName}` : folderName);
  }

  // Navigate up one level
  function navigateUp() {
    const parts = browsePath.split("/").filter(Boolean);
    parts.pop();
    setBrowsePath(parts.join("/"));
  }

  // Select this folder and close
  function selectCurrent() {
    // Add leading and trailing slashes to match the format used in constants
    const normalized = "/" + browsePath.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
    onSelect(normalized);
    onClose();
  }

  // Split the current path into breadcrumb segments
  const pathSegments = browsePath.split("/").filter(Boolean);

  // Shared look for the breadcrumb links
  const crumb = cn("text-text-2 hover:text-text transition-colors shrink-0 rounded-control", FOCUS_RING);
  // Shared look for each folder row
  const row = cn("w-full flex items-center gap-3 px-3 py-2 rounded-control hover:bg-surface-2 transition-colors text-left", FOCUS_RING);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Choose folder"
      footer={
        <Button block onClick={selectCurrent}>
          Save here{browsePath ? `: ${pathSegments[pathSegments.length - 1]}` : ": Root"}
        </Button>
      }
    >
      {/* Breadcrumb path */}
      <div className="flex items-center gap-1 text-xs overflow-x-auto pb-3 border-b border-border">
        <button type="button" onClick={() => setBrowsePath("")} className={crumb}>
          Root
        </button>
        {pathSegments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <span className="text-text-3">/</span>
            <button
              type="button"
              onClick={() => setBrowsePath(pathSegments.slice(0, i + 1).join("/"))}
              className={crumb}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Folder list */}
      <div className="min-h-[200px] max-h-[45vh] overflow-y-auto pt-2 -mx-2">
        {/* Up button (if not at root) */}
        {browsePath && (
          <button type="button" onClick={navigateUp} className={row}>
            <ChevronLeft size={16} strokeWidth={1.75} className="text-text-3" />
            <span className="text-text-2 text-sm">..</span>
          </button>
        )}

        {loading && <LoadingBlock className="py-8" />}

        {error && <p className="text-danger-fg text-sm text-center py-4">{error}</p>}

        {!loading && !error && folders.length === 0 && (
          <EmptyState compact title="No subfolders" />
        )}

        {!loading &&
          !error &&
          folders.map((folder) => (
            <button key={folder.id} type="button" onClick={() => navigateInto(folder.name)} className={row}>
              <Folder size={16} strokeWidth={1.75} className="text-text-3 shrink-0" />
              <span className="text-text text-sm truncate">{folder.name}</span>
            </button>
          ))}
      </div>
    </Modal>
  );
}
