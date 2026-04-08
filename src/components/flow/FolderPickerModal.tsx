"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, listFolderChildren, FolderItem } from "@/lib/graph";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white rounded-card border border-border-light w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border-light">
          <h3 className="font-dm font-semibold text-lg text-charcoal">Select SharePoint Folder</h3>
          <p className="text-xs text-muted-gray mt-1">Browse to the folder you want to link to this deal</p>
        </div>

        {/* Breadcrumb navigation */}
        <div className="px-4 py-2 border-b border-border-light flex items-center gap-1 flex-wrap text-sm">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-gray">/</span>}
              <button
                onClick={() => handleBreadcrumb(crumb.path)}
                className={`hover:text-green transition-colors ${
                  i === breadcrumbs.length - 1
                    ? "text-charcoal font-medium"
                    : "text-medium-gray"
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-sm text-muted-gray">Loading folders...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={loadFolders} className="text-xs text-green hover:underline mt-2">
                Retry
              </button>
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-gray">No subfolders here</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between py-2 px-3 rounded-btn hover:bg-light-gray transition-colors group"
                >
                  {/* Folder name — click to navigate */}
                  <button
                    onClick={() => handleNavigate(folder.name)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    {/* Folder icon */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#F59E0B" stroke="#D97706" strokeWidth="1" className="flex-shrink-0">
                      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="text-sm text-charcoal truncate">{folder.name}</span>
                    {/* Chevron to indicate drillable */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" className="flex-shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  {/* Select button — pick this folder */}
                  <button
                    onClick={() => handleSelectFolder(folder)}
                    className="text-xs text-green font-medium hover:underline flex-shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-light flex items-center justify-between">
          {/* Select current folder button */}
          <button
            onClick={handleSelect}
            disabled={!currentPath}
            className="text-sm text-green font-medium hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
          >
            {currentPath ? `Use "${breadcrumbs[breadcrumbs.length - 1]?.name}"` : "Navigate to a folder"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-medium-gray hover:text-charcoal transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
