"use client";

import { SP_SITE_URL } from "@/lib/constants";

interface SharePointBreadcrumbProps {
  /** The folder path, e.g. "/CRE8 Advisors/Documents/Drafts/" */
  folderPath: string;
}

/**
 * Renders a SharePoint folder path as clickable breadcrumb segments.
 * Each segment links to that folder in SharePoint Online.
 */
export default function SharePointBreadcrumb({ folderPath }: SharePointBreadcrumbProps) {
  // Split the path into segments, filtering out empty strings
  const segments = folderPath.split("/").filter(Boolean);

  // Build the SharePoint URL for each segment
  // SharePoint folder URL format: {siteUrl}/Shared Documents/path/to/folder
  // The first segment "CRE8 Advisors" is the document library name
  function getSharePointUrl(upToIndex: number): string {
    const pathSegments = segments.slice(0, upToIndex + 1);
    // The library name "CRE8 Advisors" maps to the URL path
    const encodedPath = pathSegments.map(s => encodeURIComponent(s)).join("/");
    return `${SP_SITE_URL}/${encodedPath}`;
  }

  return (
    <div className="flex items-center gap-1 text-sm flex-wrap">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8CC644"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 mr-1"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-text-3">/</span>}
          <a
            href={getSharePointUrl(i)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-2 hover:text-text transition-colors duration-150"
          >
            {segment}
          </a>
        </span>
      ))}
    </div>
  );
}
