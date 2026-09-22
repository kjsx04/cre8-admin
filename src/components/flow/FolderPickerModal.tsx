"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { ChevronRight, Folder } from "lucide-react";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, listFolderChildren, FolderItem } from "@/lib/graph";
import { Button, EmptyState, LoadingBlock, Modal, cn } from "@/components/ui";

interface FolderPickerModalProps {
  onSelect: (folderUrl: string, folderPath: string) => void;
  onCancel: () => void;
  /** Optional starting path to open the modal at (e.g. "Deals/Kevin Smith") */
  initialPath?: string;
}

/** Breadcrumb segment for navigation */
interface PathSegment {
  name: string;
  path: string;  // full path up to this segment
}

export default function FolderPickerModal({ onSelect, onCancel, initialPath }: FolderPickerModalProps) {
  const { instance, accounts } = useMsal();
  const [driveId, setDriveId] = useState("");
  const [currentPath, setCurrentPath] = useState(initialPath || "");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Build breadcrumb segments from the current path
  const breadcrumbs: PathSegment[] = [{ name: "Documents", path: "" }];
  if (currentPath) {
    const parts = currentPath.split("/");
    let accumulated = "";
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      breadcrumbs.push({ name: part, path: accumulated });
    }
  }

  // Helper: get a Graph API access token (silent first, popup fallback)
  const getAccessToken = useCallback(async (): Promise<string> => {
    const account = accounts[0];
    if (!account) throw new Error("No MSAL account");
    try {
      const res = await instance.acquireTokenSilent({ ...graphScopes, account });
      return res.accessToken;
    } catch {
      // Silent failed (expired/interaction required) — try popup
      const res = await instance.acquireTokenPopup({ ...graphScopes, account });
      return res.accessToken;
    }
  }, [instance, accounts]);

  // Get drive ID on mount
  useEffect(() => {
    async function init() {
      if (!accounts[0]) {
        setError("Not signed in — please sign in first");
        setLoading(false);
        return;
      }
      try {
        const accessToken = await getAccessToken();
        const siteId = await getSiteId(accessToken);
        const id = await getDriveId(accessToken, siteId);
        setDriveId(id);
      } catch (err) {
        console.error("[FolderPicker] Init error:", err);
        setError("Failed to connect to SharePoint");
        setLoading(false);
      }
    }
    init();
  }, [accounts, getAccessToken]);

  // Load folder contents whenever path or driveId changes
  const loadFolders = useCallback(async () => {
    if (!driveId) return;

    setLoading(true);
    setError("");
    try {
      const accessToken = await getAccessToken();
      const items = await listFolderChildren(accessToken, driveId, currentPath);
      setFolders(items);
    } catch (err) {
      console.error("[FolderPicker] Load error:", err);
      setError("Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, [driveId, currentPath, getAccessToken]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Navigate into a subfolder
  const handleNavigate = (folderName: string) => {
    setCurrentPath(currentPath ? `${currentPath}/${folderName}` : folderName);
  };

  // Navigate to a breadcrumb
  const handleBreadcrumb = (path: string) => {
    setCurrentPath(path);
  };

  // Select current folder
  const handleSelect = () => {
    onSelect("", currentPath);
  };

  // Select a specific subfolder by clicking its select button
  const handleSelectFolder = (folder: FolderItem) => {
    onSelect(folder.webUrl, currentPath ? `${currentPath}/${folder.name}` : folder.name);
  };

  return (
    // Modal primitive — overlay, Escape-to-close, centered panel
    <Modal
      open
      onClose={onCancel}
      size="md"
      title="Select SharePoint folder"
      description="Browse to the folder you want to link to this deal"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {/* Select current folder button */}
          <Button variant="primary" onClick={handleSelect} disabled={!currentPath}>
            {currentPath ? `Use "${breadcrumbs[breadcrumbs.length - 1]?.name}"` : "Navigate to a folder"}
          </Button>
        </>
      }
    >
      {/* Breadcrumb navigation */}
      <div className="pb-3 mb-2 border-b border-border flex items-center gap-1 flex-wrap text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} strokeWidth={1.75} className="text-text-3" />}
            <button
              type="button"
              onClick={() => handleBreadcrumb(crumb.path)}
              className={cn(
                "rounded-control px-1 hover:text-text transition-colors",
                i === breadcrumbs.length - 1 ? "text-text font-medium" : "text-text-2"
              )}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Folder list */}
      <div className="min-h-[200px]">
        {loading ? (
          <LoadingBlock message="Loading folders..." className="py-10" />
        ) : error ? (
          <EmptyState
            compact
            title={error}
            action={<Button variant="secondary" size="sm" onClick={loadFolders}>Retry</Button>}
          />
        ) : folders.length === 0 ? (
          <EmptyState compact icon={<Folder size={20} strokeWidth={1.75} />} title="No subfolders here" />
        ) : (
          <div className="space-y-0.5">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between py-2 px-3 rounded-control hover:bg-surface-2 transition-colors group"
              >
                {/* Folder name — click to navigate */}
                <button
                  type="button"
                  onClick={() => handleNavigate(folder.name)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                >
                  {/* Folder icon */}
                  <Folder size={18} strokeWidth={1.75} className="flex-shrink-0 text-text-2" />
                  <span className="text-sm text-text truncate">{folder.name}</span>
                  {/* Chevron to indicate drillable */}
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className="flex-shrink-0 ml-auto text-text-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </button>

                {/* Select button — pick this folder */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSelectFolder(folder)}
                  className="flex-shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Select
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
