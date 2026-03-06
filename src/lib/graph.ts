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

  // Filter to only folders, sort alphabetically
  const url = `${endpoint}?$filter=folder ne null&$orderby=name&$top=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list folders: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.value || []).map((item: Record<string, unknown>) => ({
    id: item.id as string,
    name: item.name as string,
    isFolder: true,
    webUrl: item.webUrl as string,
  }));
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

/* ============================================================
   EXCEL SYNC — /Data/CRE8-Listings.xlsx table "Listings"
   ============================================================ */

/** Column mapping: 31 columns (A through AE), matching the old admin exactly */
export interface ExcelListingData {
  name: string;
  slug: string;
  address: string;
  cityCounty: string;
  acres: number | null;
  listPrice: string;
  listingType: string;     // display name, not ID
  propertyType: string;    // display name, not ID
  zoning: string;
  zoningMunicipality: string;
  propertyOverview: string; // HTML stripped, 500 char max
  brokerNames: string[];    // up to 6
  latitude: number | null;
  longitude: number | null;
  googleMapsLink: string;
  available: boolean;
  sold: boolean;
  featured: boolean;
  packageUrl: string;
  status: string;           // "Live", "Draft", or "Sold"
  webflowId: string;
  buildingSqft: number | null;
  spacesAvailable: string;  // HTML stripped
  crossStreets: string;
  trafficCount: string;
}

/** Build the 31-value row array from ExcelListingData */
function buildExcelRow(data: ExcelListingData): (string | number | null)[] {
  // Pad broker names to 6 slots
  const brokers = [...data.brokerNames];
  while (brokers.length < 6) brokers.push("");

  return [
    data.name,                                    // A (0)
    data.slug,                                    // B (1)
    data.address,                                 // C (2)
    data.cityCounty,                              // D (3)
    data.acres,                                   // E (4)
    data.listPrice,                               // F (5)
    data.listingType,                             // G (6)
    data.propertyType,                            // H (7)
    data.zoning,                                  // I (8)
    data.zoningMunicipality,                      // J (9)
    data.propertyOverview,                        // K (10)
    brokers[0], brokers[1], brokers[2],           // L-N (11-13)
    brokers[3], brokers[4], brokers[5],           // O-Q (14-16)
    data.latitude,                                // R (17)
    data.longitude,                               // S (18)
    data.googleMapsLink,                          // T (19)
    data.available ? "TRUE" : "FALSE",            // U (20)
    data.sold ? "TRUE" : "FALSE",                 // V (21)
    data.featured ? "TRUE" : "FALSE",             // W (22)
    data.packageUrl,                              // X (23)
    data.status,                                  // Y (24)
    data.webflowId,                               // Z (25)
    new Date().toISOString(),                     // AA (26)
    data.buildingSqft,                            // AB (27)
    data.spacesAvailable,                         // AC (28)
    data.crossStreets,                            // AD (29)
    data.trafficCount,                            // AE (30)
  ];
}

const EXCEL_PATH = "Data/CRE8-Listings.xlsx";
const EXCEL_TABLE = "Listings";

/**
 * Sync listing data to Excel — find existing row by Webflow ID, update or create.
 * Retries up to 3 times with 5s delay for lock errors.
 */
export async function syncToExcel(
  accessToken: string,
  driveId: string,
  data: ExcelListingData,
  retries = 3
): Promise<void> {
  const encodedPath = encodeURIComponent(EXCEL_PATH).replace(/%2F/g, "/");
  const tableBase = `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/workbook/tables/${EXCEL_TABLE}`;

  const row = buildExcelRow(data);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Try to find existing row by Webflow ID (column Z, index 25)
      const rowsRes = await fetch(`${tableBase}/rows`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!rowsRes.ok) {
        throw new Error(`Excel rows fetch failed: ${rowsRes.status}`);
      }

      const rowsData = await rowsRes.json();
      const existingRows = rowsData.value || [];

      // Search for matching Webflow ID in column Z (index 25)
      let existingIdx = -1;
      for (let i = 0; i < existingRows.length; i++) {
        const vals = existingRows[i].values?.[0];
        if (vals && vals[25] === data.webflowId) {
          existingIdx = i;
          break;
        }
      }

      if (existingIdx >= 0) {
        // Update existing row
        const patchRes = await fetch(
          `${tableBase}/rows/itemAt(index=${existingIdx})`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ values: [row] }),
          }
        );
        if (!patchRes.ok) {
          const text = await patchRes.text();
          if (text.includes("CannotAcquireLock") && attempt < retries - 1) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          throw new Error(`Excel row update failed: ${patchRes.status}`);
        }
      } else {
        // Create new row
        const postRes = await fetch(`${tableBase}/rows/add`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [row] }),
        });
        if (!postRes.ok) {
          const text = await postRes.text();
          if (text.includes("CannotAcquireLock") && attempt < retries - 1) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          throw new Error(`Excel row create failed: ${postRes.status}`);
        }
      }

      // Success — break out of retry loop
      return;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      // Wait before retry
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
