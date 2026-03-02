/**
 * Email Campaign System — Constants & Config
 *
 * Senders, segments, labels, colors, and the HTML email template renderer.
 * Dev mode uses a single Gmail sender; production swaps to cre8advisors.com domain.
 */

import { EmailSender, EmailSegment, EmailTemplateVars } from "./types";

// ── Broker senders ──
// In dev: all emails send from the single verified Gmail address.
// In production: verify cre8advisors.com domain in SendGrid, then these emails work directly.
export const EMAIL_SENDERS: EmailSender[] = [
  { id: "6987ab84b1ac0ee1e143f72f", name: "Rommie Mojahed", email: "Rommie@cre8Advisors.com", phone: "602.702.4663" },
  { id: "6987abdaa473a39098593f50", name: "Andy Kroot",     email: "Andy@CRE8Advisors.com",   phone: "602.430.8589" },
  { id: "6987fada67c88dd8b9b89e39", name: "Lindsey Dulle",  email: "Lindsey@cre8advisors.com", phone: "602.317.7713" },
  { id: "6987fb2fa8757569eefd70fa", name: "Chad Shipley",   email: "Chad@cre8advisors.com",    phone: "480.220.5954" },
  { id: "6987fb6d372758be66e14cb8", name: "Kevin Smith",    email: "Kevin@cre8advisors.com",   phone: "518.428.8316" },
];

// ── Contact segments ──
// "All Contacts" and "Test" are enabled; others disabled until SendGrid lists are built.
export const EMAIL_SEGMENTS: EmailSegment[] = [
  { id: "all",       name: "All Contacts",  enabled: true  },
  { id: "test",      name: "Test",          enabled: true  },
  { id: "brokers",   name: "Brokers",       enabled: false },
  { id: "investors", name: "Investors",     enabled: false },
  { id: "owners",    name: "Owners",        enabled: false },
  { id: "land",      name: "Land Buyers",   enabled: false },
];

// ── Email labels (campaign type badges) ──
export const EMAIL_LABELS = ["Just Listed", "Just Sold"] as const;

// ── Type colors for calendar events + badges ──
export const TYPE_COLORS: Record<string, string> = {
  "Just Listed": "#3B82F6", // Blue
  "Just Sold":   "#EF4444", // Red
};
// Fallback for custom labels / recurring
export const RECURRING_COLOR = "#8CC644"; // CRE8 green

// ── Status display config ──
export const STATUS_LABELS: Record<string, string> = {
  draft:     "Draft",
  scheduled: "Scheduled",
  active:    "Active",
  paused:    "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  draft:     "#999999",
  scheduled: "#3B82F6",
  active:    "#8CC644",
  paused:    "#F59E0B",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

// ── CRE8 branding constants for email template ──
const CRE8_LOGO_URL = "https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/6717f6e1c60fe16248597819_CRE8%20White.svg";
const CRE8_SITE_URL = "https://cre8advisors.com";

/**
 * Render the full HTML email for a campaign.
 * Used by both the preview endpoint and SendGrid Single Send creation.
 * Inline styles only — email clients strip <style> tags.
 */
export function renderEmailHtml(vars: EmailTemplateVars): string {
  // Build highlights list items
  const highlightRows = vars.highlights
    .filter((h) => h.trim())
    .map(
      (h) =>
        `<tr><td style="padding:4px 0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#333333;">${escapeHtml(h)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(vars.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'DM Sans',Arial,sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header: CRE8 logo on dark background -->
          <tr>
            <td style="background-color:#1A1A1A;padding:20px 32px;text-align:center;">
              <img src="${CRE8_LOGO_URL}" alt="CRE8 Advisors" width="140" style="display:inline-block;" />
            </td>
          </tr>

          <!-- Label badge -->
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <span style="display:inline-block;background-color:${vars.labelColor};color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 12px;border-radius:4px;">
                ${escapeHtml(vars.label)}
              </span>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <h1 style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:24px;font-weight:700;color:#1A1A1A;line-height:1.3;">
                ${escapeHtml(vars.heading)}
              </h1>
            </td>
          </tr>

          <!-- Body text -->
          ${vars.bodyText ? `
          <tr>
            <td style="padding:12px 32px 0 32px;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#666666;line-height:1.6;">
                ${escapeHtml(vars.bodyText)}
              </p>
            </td>
          </tr>` : ""}

          <!-- Property photo -->
          ${vars.photoUrl ? `
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <img src="${vars.photoUrl}" alt="Property" width="536" style="display:block;width:100%;border-radius:6px;" />
            </td>
          </tr>` : ""}

          <!-- Highlights -->
          ${highlightRows ? `
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:6px;padding:16px;">
                ${highlightRows}
              </table>
            </td>
          </tr>` : ""}

          <!-- CTA button -->
          ${vars.listingUrl ? `
          <tr>
            <td style="padding:24px 32px 0 32px;text-align:center;">
              <a href="${vars.listingUrl}" target="_blank" style="display:inline-block;background-color:#8CC644;color:#ffffff;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:6px;">
                View Full Listing
              </a>
            </td>
          </tr>` : ""}

          <!-- Broker contact -->
          <tr>
            <td style="padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5;padding-top:16px;">
                <tr>
                  <td style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#1A1A1A;font-weight:700;">
                    ${escapeHtml(vars.brokerName)}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#666666;padding-top:2px;">
                    CRE8 Advisors
                  </td>
                </tr>
                <tr>
                  <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#666666;padding-top:2px;">
                    <a href="mailto:${vars.brokerEmail}" style="color:#3B82F6;text-decoration:none;">${escapeHtml(vars.brokerEmail)}</a>
                    ${vars.brokerPhone ? ` &middot; ${escapeHtml(vars.brokerPhone)}` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#1A1A1A;padding:16px 32px;text-align:center;">
              <a href="${CRE8_SITE_URL}" style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#999999;text-decoration:none;">
                cre8advisors.com
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/** Escape HTML special characters to prevent XSS in email content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
