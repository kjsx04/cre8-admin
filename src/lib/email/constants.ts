/**
 * Email Campaign System — Constants & Config
 *
 * Senders, segments, labels, colors, broker maps, company info,
 * the buildTemplateVars() helper, and the full HTML email template renderer.
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
const CRE8_ADDRESS = "14050 N 83rd Ave, Suite 290, Peoria, AZ 85381";
const CRE8_PHONE = "602.888.2738";
const CRE8_LINKEDIN = "https://www.linkedin.com/company/cre8-advisors";
const CRE8_INSTAGRAM = "https://www.instagram.com/cre8advisors";

// ── Broker headshot URLs (square PNGs from Webflow CDN) ──
const BROKER_HEADSHOTS: Record<string, string> = {
  "6987ab84b1ac0ee1e143f72f": "https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/674df7c6e8ac15213b103fbb_Rommie%20Square.png",
  "6987abdaa473a39098593f50": "https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/674df7c62928977ac46368d0_Andy%20Square.png",
  "6987fada67c88dd8b9b89e39": "https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/674df7c60e361af25a1df351_Lindsey%20Square.png",
  "6987fb2fa8757569eefd70fa": "https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/674df94cb2df1528325e4331_Chad%20Square.png",
  "6987fb6d372758be66e14cb8": "https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/674df83087f7eb9ee3c964bd_Kevin%20Square.png",
};

// ── Broker titles ──
const BROKER_TITLES: Record<string, string> = {
  "6987ab84b1ac0ee1e143f72f": "Partner",                // Rommie
  "6987abdaa473a39098593f50": "Partner",                // Andy
  "6987fada67c88dd8b9b89e39": "Senior Advisor",         // Lindsey
  "6987fb2fa8757569eefd70fa": "Senior Advisor",         // Chad
  "6987fb6d372758be66e14cb8": "Advisor",                // Kevin
};

/**
 * Build EmailTemplateVars from a campaign-like record.
 * Centralizes the mapping so preview, SendGrid creation, and cron routes all use one source.
 * Accepts any object with campaign-shaped fields (Campaign, CampaignFormData, or raw body).
 */
export function buildTemplateVars(
  data: Record<string, unknown>
): EmailTemplateVars {
  // Lazy import to avoid circular — getTypeColor is in utils.ts which imports from constants
  // Instead, inline the color lookup here since TYPE_COLORS is in this file
  const label = (data.email_label as string) || "Just Listed";
  const labelColor = TYPE_COLORS[label] || RECURRING_COLOR;
  const heading = (data.heading_text as string) || (data.listing_name as string) || "Property Listing";
  const brokerId = (data.broker_id as string) || "";

  return {
    label,
    labelColor,
    heading,
    bodyText: (data.body_text as string) || "",
    photoUrl: (data.photo_url as string) || "",
    highlights: (data.highlights as string[]) || [],
    listingUrl: (data.listing_page_url as string) || "",
    brokerName: (data.broker_name as string) || "",
    brokerEmail: (data.broker_email as string) || "",
    brokerPhone: (data.broker_phone as string) || "",
    // New fields — auto-derived from campaign data
    preheaderText: `${label}: ${heading}`,
    brokerHeadshotUrl: BROKER_HEADSHOTS[brokerId] || "",
    brokerTitle: BROKER_TITLES[brokerId] || "Advisor",
    propertyAddress: (data.property_address as string) || "",
  };
}

/**
 * Parse a highlight string on the first ":" into label + value.
 * "Price: $2,000,000" → { label: "Price", value: "$2,000,000" }
 * "10 Acres" → { label: "", value: "10 Acres" }
 */
function parseHighlight(h: string): { label: string; value: string } {
  const idx = h.indexOf(":");
  if (idx > 0 && idx < h.length - 1) {
    return { label: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() };
  }
  return { label: "", value: h.trim() };
}

/**
 * Render the full HTML email for a campaign.
 * Used by both the preview endpoint and SendGrid Single Send creation.
 * Dark premium CRE8 brand — table-based layout with all inline styles
 * for maximum email client compatibility.
 */
export function renderEmailHtml(vars: EmailTemplateVars): string {
  // Parse highlights into label/value pairs for the stats grid
  const highlights = vars.highlights.filter((h) => h.trim()).map(parseHighlight);

  // Build 2-column stats grid cells
  // Pair them up, odd last item goes full-width
  let statsGridHtml = "";
  if (highlights.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < highlights.length; i += 2) {
      const left = highlights[i];
      const right = i + 1 < highlights.length ? highlights[i + 1] : null;

      if (right) {
        // Two-column row with 8px gutter
        rows.push(`
                            <tr>
                              <td width="50%" style="padding:0 4px 8px 0;vertical-align:top;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td style="background-color:#111111;border-radius:6px;padding:14px 16px;">
                                      ${left.label ? `<p style="margin:0 0 4px 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888888;line-height:1.3;">${escapeHtml(left.label)}</p>` : ""}
                                      <p style="margin:0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;line-height:1.3;">${escapeHtml(left.value)}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td width="50%" style="padding:0 0 8px 4px;vertical-align:top;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td style="background-color:#111111;border-radius:6px;padding:14px 16px;">
                                      ${right.label ? `<p style="margin:0 0 4px 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888888;line-height:1.3;">${escapeHtml(right.label)}</p>` : ""}
                                      <p style="margin:0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;line-height:1.3;">${escapeHtml(right.value)}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>`);
      } else {
        // Odd last item — full width
        rows.push(`
                            <tr>
                              <td colspan="2" style="padding:0 0 8px 0;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td style="background-color:#111111;border-radius:6px;padding:14px 16px;">
                                      ${left.label ? `<p style="margin:0 0 4px 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888888;line-height:1.3;">${escapeHtml(left.label)}</p>` : ""}
                                      <p style="margin:0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;line-height:1.3;">${escapeHtml(left.value)}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>`);
      }
    }
    statsGridHtml = rows.join("");
  }

  // CTA text varies by campaign type
  const ctaText = vars.label === "Just Sold" ? "VIEW PROPERTY DETAILS" : "VIEW FULL LISTING";

  // ~60 zero-width spacers to push body text out of inbox preview snippet
  const preheaderSpacer = "&zwnj;&nbsp;".repeat(60);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(vars.heading)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&display=swap');

    /* Light mode default — white outer background, dark card */
    :root { color-scheme: light dark; supported-color-schemes: light dark; }

    /* Dark mode: keep the dark card intact, darken outer bg to match */
    @media (prefers-color-scheme: dark) {
      .body, .body-table { background-color: #111111 !important; }
      .card-bg { background-color: #1A1A1A !important; }
    }
    u + .body { background-color: #FFFFFF !important; }
    [data-ogsc] .body { background-color: #FFFFFF !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background-color:#FFFFFF;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader — hidden inbox preview text -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(vars.preheaderText)}${preheaderSpacer}
  </div>

  <!-- Outer wrapper table — white background, dark card floats on top -->
  <table role="presentation" class="body-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email card — 600px desktop, fluid on mobile -->
        <table role="presentation" class="card-bg" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#1A1A1A;">

          <!-- Combined header — Label + Heading on left, CRE8 logo on right -->
          <tr>
            <td style="background-color:#1A1A1A;padding:28px 32px;">
              <!--[if mso]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
              <v:fill type="tile" color="#1A1A1A"/>
              <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
              <![endif]-->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Left: Label + Heading + Address -->
                  <td valign="top" style="padding-right:16px;">
                    <!-- Label — green uppercase text -->
                    <p style="margin:0 0 10px 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#8CC644;line-height:1.4;">
                      ${escapeHtml(vars.label)}
                    </p>
                    <!-- Heading — Bebas Neue -->
                    <h1 style="margin:0;font-family:'Bebas Neue','Arial Narrow',Arial,sans-serif;font-size:32px;font-weight:400;color:#FFFFFF;line-height:1.15;letter-spacing:0.5px;">
                      ${escapeHtml(vars.heading)}
                    </h1>
                    ${vars.propertyAddress ? `
                    <p style="margin:6px 0 0 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;color:#999999;line-height:1.4;">
                      ${escapeHtml(vars.propertyAddress)}
                    </p>` : ""}
                  </td>
                  <!-- Right: CRE8 logo -->
                  <td valign="top" width="90" style="text-align:right;">
                    <img src="${CRE8_LOGO_URL}" alt="CRE8 Advisors" width="90" height="auto" style="display:inline-block;border:0;outline:none;text-decoration:none;color:#ffffff;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:700;" />
                  </td>
                </tr>
              </table>
              <!--[if mso]>
              </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Hero property photo — full bleed, clickable to listing page -->
          ${vars.photoUrl ? `
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              ${vars.listingUrl
                ? `<a href="${vars.listingUrl}" target="_blank" style="display:block;line-height:0;font-size:0;border:0;text-decoration:none;"><img src="${vars.photoUrl}" alt="${escapeHtml(vars.heading)}" width="600" style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;" /></a>`
                : `<img src="${vars.photoUrl}" alt="${escapeHtml(vars.heading)}" width="600" style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`}
            </td>
          </tr>` : ""}

          <!-- Body text (optional) -->
          ${vars.bodyText ? `
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <p style="margin:0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;color:#BFBFBF;line-height:1.65;">
                ${escapeHtml(vars.bodyText)}
              </p>
            </td>
          </tr>` : ""}

          <!-- Stats grid — 2-column layout on #111111 cells -->
          ${statsGridHtml ? `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${statsGridHtml}
              </table>
            </td>
          </tr>` : ""}

          <!-- CTA button — dark text on green -->
          ${vars.listingUrl ? `
          <tr>
            <td style="padding:28px 32px 0 32px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:4px;background-color:#8CC644;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${vars.listingUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="8%" strokecolor="#8CC644" fillcolor="#8CC644">
                    <w:anchorlock/>
                    <center style="color:#000000;font-family:'Arial Narrow',Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:1.5px;">
                      ${escapeHtml(ctaText)}
                    </center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${vars.listingUrl}" target="_blank" style="display:inline-block;background-color:#8CC644;color:#000000;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-decoration:none;padding:14px 40px;border-radius:4px;line-height:1.2;mso-hide:all;">
                      ${escapeHtml(ctaText)}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ""}

          <!-- Divider -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:1px;background-color:#333333;font-size:1px;line-height:1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Broker contact card -->
          <tr>
            <td style="padding:28px 32px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border-radius:8px;width:100%;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              ${vars.brokerHeadshotUrl ? `
                              <!-- Broker headshot — 80px -->
                              <td valign="top" style="width:80px;padding-right:20px;">
                                <img src="${vars.brokerHeadshotUrl}" alt="${escapeHtml(vars.brokerName)}" width="80" height="80" style="display:block;width:80px;height:80px;border-radius:6px;border:0;outline:none;" />
                              </td>` : ""}
                              <!-- Broker info -->
                              <td valign="middle" style="font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;">
                                <p style="margin:0;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.3;">
                                  ${escapeHtml(vars.brokerName)}
                                </p>
                                <p style="margin:3px 0 0 0;font-size:13px;font-weight:500;color:#8CC644;line-height:1.4;">
                                  ${escapeHtml(vars.brokerTitle)}
                                </p>
                                <p style="margin:3px 0 0 0;font-size:13px;color:#888888;line-height:1.4;">
                                  CRE8 Advisors
                                </p>
                                <p style="margin:8px 0 0 0;font-size:13px;line-height:1.4;">
                                  <a href="mailto:${vars.brokerEmail}" style="color:#8CC644;text-decoration:none;">${escapeHtml(vars.brokerEmail)}</a>${vars.brokerPhone ? ` &nbsp;&middot;&nbsp; <span style="color:#BFBFBF;">${escapeHtml(vars.brokerPhone)}</span>` : ""}
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer — black background with top border -->
          <tr>
            <td style="background-color:#000000;border-top:1px solid #333333;padding:28px 32px 24px 32px;text-align:center;">
              <!-- Small CRE8 logo -->
              <img src="${CRE8_LOGO_URL}" alt="CRE8 Advisors" width="100" height="auto" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;color:#ffffff;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:700;" />

              <!-- Company address + phone -->
              <p style="margin:14px 0 0 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;color:#666666;line-height:1.5;">
                ${escapeHtml(CRE8_ADDRESS)}<br/>
                ${escapeHtml(CRE8_PHONE)}
              </p>

              <!-- Social links — uppercase -->
              <p style="margin:14px 0 0 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;line-height:1.5;">
                <a href="${CRE8_LINKEDIN}" target="_blank" style="color:#8CC644;text-decoration:none;">LinkedIn</a>
                &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="${CRE8_INSTAGRAM}" target="_blank" style="color:#8CC644;text-decoration:none;">Instagram</a>
                &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="${CRE8_SITE_URL}" target="_blank" style="color:#8CC644;text-decoration:none;">Website</a>
              </p>

              <!-- Unsubscribe (SendGrid merge tag) -->
              <p style="margin:18px 0 0 0;font-family:'DM Sans','Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.4;">
                <a href="{{{unsubscribe}}}" style="color:#666666;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->

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
