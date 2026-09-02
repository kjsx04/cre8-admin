// SharePoint Graph API helpers
// Uses the user's MSAL auth token to interact with SharePoint

import { SP_SITE_URL } from "./constants";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Get the SharePoint site ID for the CRE8 Operations site
 */
export async function getSiteId(accessToken: string): Promise<string> {
  // Extract hostname and site path from SP_SITE_URL
  const url = new URL(SP_SITE_URL);
  const hostname = url.hostname; // cre8advisors.sharepoint.com
  const sitePath = url.pathname.replace(/^\/sites\//, ""); // CRE8Operations

  const response = await fetch(
    `${GRAPH_BASE}/sites/${hostname}:/sites/${sitePath}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get site ID: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Get the default document library drive ID
 */
export async function getDriveId(accessToken: string, siteId: string): Promise<string> {
  const response = await fetch(
    `${GRAPH_BASE}/sites/${siteId}/drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get drive: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Upload a file to a SharePoint folder
 * Returns the SharePoint web URL for the uploaded file
 */
export async function uploadToSharePoint(
  accessToken: string,
  siteId: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  fileContent: ArrayBuffer,
  contentType = "application/octet-stream"
): Promise<string> {
  // Encode the full path for the API
  const fullPath = `${folderPath}${fileName}`.replace(/^\//, "");
  const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, "/");

  const response = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: fileContent,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SharePoint upload failed: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  return data.webUrl;
}

/**
 * Generate the "Open in Word" URL for a SharePoint file
 * This opens the file in Word desktop (falls back to Word Online)
 */
export function getWordUrl(sharePointUrl: string): string {
  // ms-word protocol handler opens the file in Word desktop
  return `ms-word:ofe|u|${sharePointUrl}`;
}

// ── Folder browsing helpers ──

export interface FolderItem {
  id: string;
  name: string;
  isFolder: boolean;
  webUrl: string;
}

/**
 * List children (folders only) of a SharePoint folder.
 * Pass folderPath like "/CRE8 Advisors/Documents" or "" for the drive root.
 */
export async function listFolderChildren(
  accessToken: string,
  driveId: string,
  folderPath: string
): Promise<FolderItem[]> {
  // Build the endpoint — root vs. subpath
  const cleanPath = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const endpoint = cleanPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(cleanPath).replace(/%2F/g, "/")}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  // Fetch all children — $filter on folder facet isn't reliably supported by SharePoint
  const url = `${endpoint}?$select=id,name,webUrl,folder&$top=200`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    // 404 = folder doesn't exist
    if (response.status === 404) return [];
    throw new Error(`Failed to list folders: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  // Filter to folders only client-side, sort alphabetically
  return (data.value || [])
    .filter((item: Record<string, unknown>) => item.folder != null)
    .map((item: Record<string, unknown>) => ({
      id: item.id as string,
      name: item.name as string,
      isFolder: true,
      webUrl: item.webUrl as string,
    }))
    .sort((a: FolderItem, b: FolderItem) => a.name.localeCompare(b.name));
}

/**
 * Create a folder in SharePoint. Graph API auto-creates parent folders.
 * Returns the created folder's web URL.
 */
export async function createFolder(
  accessToken: string,
  driveId: string,
  parentPath: string,
  folderName: string
): Promise<string> {
  const cleanParent = parentPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const endpoint = cleanParent
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(cleanParent).replace(/%2F/g, "/")}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });

  if (!response.ok) {
    // 409 = already exists, which is fine
    if (response.status === 409) {
      return "";
    }
    throw new Error(`Failed to create folder: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.webUrl;
}

/* ============================================================
   DEAL-SPECIFIC HELPERS
   ============================================================ */

/**
 * Create a SharePoint folder for a deal: /Deals/{brokerName}/{dealName}/Documents/
 * Idempotent — handles 409 (already exists) gracefully.
 * Returns the folder's web URL (or empty string if folder already existed).
 */
export async function createDealFolder(
  accessToken: string,
  driveId: string,
  brokerName: string,
  dealName: string
): Promise<string> {
  // Sanitize folder names — remove characters not allowed in SharePoint
  const safeBroker = brokerName.replace(/[<>:"/\\|?*]/g, "").trim();
  const safeDeal = dealName.replace(/[<>:"/\\|?*]/g, "").trim();

  // Create parent folders: Deals → Deals/{broker} → Deals/{broker}/{deal}
  await createFolder(accessToken, driveId, "", "Deals");
  await createFolder(accessToken, driveId, "Deals", safeBroker);
  const dealFolderUrl = await createFolder(accessToken, driveId, `Deals/${safeBroker}`, safeDeal);

  // Create Documents subfolder
  await createFolder(accessToken, driveId, `Deals/${safeBroker}/${safeDeal}`, "Documents");

  // If deal folder already existed (409), build the URL from the path
  if (!dealFolderUrl) {
    // Folder already exists — construct a browse URL (won't have the exact webUrl, but close)
    return "";
  }
  return dealFolderUrl;
}

/**
 * Upload a file to a deal's SharePoint folder.
 * Files under 4MB use simple PUT; larger files are rejected with a warning.
 * Returns the uploaded file's web URL.
 */
export async function uploadDealFile(
  accessToken: string,
  driveId: string,
  brokerName: string,
  dealName: string,
  fileName: string,
  fileContent: ArrayBuffer,
  contentType = "application/octet-stream"
): Promise<string> {
  // 4MB limit for simple PUT upload
  if (fileContent.byteLength > 4 * 1024 * 1024) {
    console.warn("[uploadDealFile] File exceeds 4MB — skipping upload. LOIs/PSAs are typically < 1MB.");
    return "";
  }

  const safeBroker = brokerName.replace(/[<>:"/\\|?*]/g, "").trim();
  const safeDeal = dealName.replace(/[<>:"/\\|?*]/g, "").trim();
  const folderPath = `Deals/${safeBroker}/${safeDeal}/Documents/`;

  return uploadToSharePoint(accessToken, "" /* siteId unused */, driveId, folderPath, fileName, fileContent, contentType);
}

/** Result type for files listed from a SharePoint folder */
export interface SharePointFile {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  lastModified: string;
  mimeType: string;
  downloadUrl: string;
}

/** Item in a folder listing — can be a file or a subfolder */
export interface SharePointItem {
  id: string;
  name: string;
  webUrl: string;
  isFolder: boolean;
  // File-only fields (null for folders)
  size: number;
  lastModified: string;
  mimeType: string;
  downloadUrl: string;
  // Folder-only fields
  childCount: number;
}

/**
 * List files in a SharePoint folder.
 * Returns files sorted by last modified (newest first).
 */
export async function listFolderFiles(
  accessToken: string,
  driveId: string,
  folderPath: string
): Promise<SharePointFile[]> {
  const cleanPath = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const endpoint = cleanPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(cleanPath).replace(/%2F/g, "/")}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  // Only fetch files (not folders), sorted newest first
  const url = `${endpoint}?$filter=file ne null&$orderby=lastModifiedDateTime desc&$select=id,name,webUrl,size,lastModifiedDateTime,file,@microsoft.graph.downloadUrl`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    // 404 = folder doesn't exist yet — return empty
    if (response.status === 404) return [];
    throw new Error(`Failed to list folder files: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.value || []).map((item: Record<string, unknown>) => {
    const fileInfo = item.file as Record<string, unknown> | null;
    return {
      id: item.id as string,
      name: item.name as string,
      webUrl: item.webUrl as string,
      size: item.size as number,
      lastModified: item.lastModifiedDateTime as string,
      mimeType: (fileInfo?.mimeType as string) || "application/octet-stream",
      downloadUrl: (item["@microsoft.graph.downloadUrl"] as string) || "",
    };
  });
}

/**
 * List ALL children (folders + files) of a SharePoint folder.
 * Folders sort first alphabetically, then files by last modified (newest first).
 */
export async function listFolderContents(
  accessToken: string,
  driveId: string,
  folderPath: string
): Promise<SharePointItem[]> {
  const cleanPath = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const endpoint = cleanPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(cleanPath).replace(/%2F/g, "/")}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  const url = `${endpoint}?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder,@microsoft.graph.downloadUrl&$top=200`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to list folder contents: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const items: SharePointItem[] = (data.value || []).map((item: Record<string, unknown>) => {
    const fileInfo = item.file as Record<string, unknown> | null;
    const folderInfo = item.folder as Record<string, unknown> | null;
    return {
      id: item.id as string,
      name: item.name as string,
      webUrl: item.webUrl as string,
      isFolder: !!folderInfo,
      size: (item.size as number) || 0,
      lastModified: (item.lastModifiedDateTime as string) || "",
      mimeType: (fileInfo?.mimeType as string) || "",
      downloadUrl: (item["@microsoft.graph.downloadUrl"] as string) || "",
      childCount: (folderInfo?.childCount as number) || 0,
    };
  });

  // Sort: folders first (alphabetical), then files (newest first)
  items.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    if (a.isFolder && b.isFolder) return a.name.localeCompare(b.name);
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });

  return items;
}

/**
 * Upload a file to a specific SharePoint folder path (for user-linked folders).
 * Uses the folder path directly — no deal folder structure assumed.
 */
export async function uploadToFolder(
  accessToken: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  fileContent: ArrayBuffer,
  contentType = "application/octet-stream"
): Promise<string> {
  if (fileContent.byteLength > 4 * 1024 * 1024) {
    console.warn("[uploadToFolder] File exceeds 4MB — skipping.");
    return "";
  }

  const cleanPath = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const fullPath = `${cleanPath}/${fileName}`;
  const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, "/");

  const response = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: fileContent,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SharePoint upload failed: ${response.status} — ${errorText}`);
  }

  const result = await response.json();
  return result.webUrl;
}

/* ============================================================
   LISTING-SPECIFIC HELPERS
   ============================================================ */

/**
 * Create the full SharePoint folder structure for a listing.
 * Folders: /Listings/Active/{name}/Package/Links/, Maps/Exports/, Photos/, Documents/
 * Idempotent — handles 409 (already exists) gracefully.
 */
export async function createListingFolders(
  accessToken: string,
  driveId: string,
  listingName: string
): Promise<void> {
  // Sanitize folder name — remove characters not allowed in SharePoint
  const safeName = listingName.replace(/[<>:"/\\|?*]/g, "").trim();
  const base = `Listings/Active/${safeName}`;
  const subfolders = [
    "Package",
    "Package/Links",
    "Maps",
    "Maps/Exports",
    "Photos",
    "Documents",
  ];

  // Create parent folders first (Graph API needs them to exist)
  await createFolder(accessToken, driveId, "", "Listings");
  await createFolder(accessToken, driveId, "Listings", "Active");

  // Create listing folder
  await createFolder(accessToken, driveId, "Listings/Active", safeName);

  // Create subfolders sequentially (parent must exist before child)
  for (const sub of subfolders) {
    const parts = sub.split("/");
    const parentPath = parts.length > 1
      ? `${base}/${parts.slice(0, -1).join("/")}`
      : base;
    const folderName = parts[parts.length - 1];
    await createFolder(accessToken, driveId, parentPath, folderName);
  }
}

/**
 * Move a listing folder from one parent to another (e.g. Active → Sold).
 * Uses Graph API PATCH to update the parent reference.
 * Idempotent — returns silently if the source folder doesn't exist (404).
 */
export async function moveListingFolder(
  accessToken: string,
  driveId: string,
  folderName: string,
  fromParent: string,
  toParent: string
): Promise<void> {
  const safeName = folderName.replace(/[<>:"/\\|?*]/g, "").trim();
  const sourcePath = `${fromParent}/${safeName}`;
  const encodedSource = encodeURIComponent(sourcePath).replace(/%2F/g, "/");

  // Get the source folder's item ID
  const getRes = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodedSource}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // 404 = folder doesn't exist at source — nothing to move
  if (getRes.status === 404) return;
  if (!getRes.ok) {
    throw new Error(`Failed to find folder: ${getRes.status}`);
  }

  const folderData = await getRes.json();
  const folderId = folderData.id;

  // Ensure destination parent exists
  const toSegments = toParent.split("/");
  let buildPath = "";
  for (const segment of toSegments) {
    const parent = buildPath || "";
    await createFolder(accessToken, driveId, parent, segment);
    buildPath = buildPath ? `${buildPath}/${segment}` : segment;
  }

  // Get the destination parent's item ID
  const encodedDest = encodeURIComponent(toParent).replace(/%2F/g, "/");
  const destRes = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodedDest}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!destRes.ok) {
    throw new Error(`Failed to find destination folder: ${destRes.status}`);
  }

  const destData = await destRes.json();
  const destId = destData.id;

  // Move the folder by updating its parentReference
  const moveRes = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/items/${folderId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parentReference: { id: destId },
      }),
    }
  );

  if (!moveRes.ok) {
    const errText = await moveRes.text();
    throw new Error(`Failed to move folder: ${moveRes.status} — ${errText}`);
  }
}

