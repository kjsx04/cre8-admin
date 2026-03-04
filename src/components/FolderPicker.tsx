"use client";

import { useState, useEffect } from "react";
import { listFolderChildren, FolderItem } from "@/lib/graph";

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

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="bg-white border border-[#E0E0E0] rounded-card w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E0E0E0] flex items-center justify-between">
          <h2 className="font-bebas text-xl tracking-wide text-[#1A1A1A]">CHOOSE FOLDER</h2>
          <button
            onClick={onClose}
            className="text-medium-gray hover:text-[#1A1A1A] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Breadcrumb path */}
        <div className="px-4 py-2 border-b border-[#E0E0E0] flex items-center gap-1 text-xs overflow-x-auto">
          <button
            onClick={() => setBrowsePath("")}
            className="text-medium-gray hover:text-green transition-colors flex-shrink-0"
          >
            Root
          </button>
          {pathSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[#CCCCCC]">/</span>
              <button
                onClick={() => setBrowsePath(pathSegments.slice(0, i + 1).join("/"))}
                className="text-medium-gray hover:text-green transition-colors"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {/* Up button (if not at root) */}
          {browsePath && (
            <button
              onClick={navigateUp}
              className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-[#F5F5F5] transition-colors text-left"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="text-medium-gray text-sm">..</span>
            </button>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center py-4">{error}</p>
          )}

          {!loading && !error && folders.length === 0 && (
            <p className="text-medium-gray text-sm text-center py-4">No subfolders</p>
          )}

          {!loading &&
            !error &&
            folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => navigateInto(folder.name)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-[#F5F5F5] transition-colors text-left"
              >
                {/* Folder icon */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8CC644"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="text-[#1A1A1A] text-sm truncate">{folder.name}</span>
              </button>
            ))}
        </div>

        {/* Footer — select this folder */}
        <div className="p-4 border-t border-[#E0E0E0]">
          <button
            onClick={selectCurrent}
            className="w-full bg-green text-black font-semibold text-sm py-2.5 rounded-btn
                       hover:brightness-110 transition-all duration-200"
          >
            Save Here{browsePath ? `: ${pathSegments[pathSegments.length - 1]}` : ": Root"}
          </button>
        </div>
      </div>
    </div>
  );
}
