/**
 * Email Campaign System — Constants & Config
 *
 * Senders, segments, labels, colors, broker maps, company info,
 * the buildTemplateVars() helper, and the full HTML email template renderer.
 * Sending goes through Resend (see provider.ts). Any address on the verified
 * cre8advisors.com domain can be a sender, so each broker sends as themselves.
 */

import { EmailSender, EmailSegment, EmailTemplateVars, BrokerCardVars, GroupListing } from "./types";

/** Bump when renderEmailHtml chrome/layout changes. Campaigns stay on the old
 *  shell until the user clicks Sync template (sent mail is never rewritten). */
export const CURRENT_TEMPLATE_VERSION = "2026-09-19-6";

/**
 * Email typeface — same stack as the admin UI (globals.css + tailwind.config.ts).
 *
 * Previous stacks (revert by restoring these + the Bebas+DM Sans @import):
 *   body/UI:  ${EMAIL_FONT}
 *   display:  ${EMAIL_FONT}
 *   Outlook CTA: 'Arial Narrow',Arial,sans-serif
 */
const EMAIL_FONT =
  "Inter,-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

// ── Broker senders ──
// Each campaign sends FROM the chosen broker's cre8advisors.com address (domain verified in Resend).
export const EMAIL_SENDERS: EmailSender[] = [
  { id: "6987ab84b1ac0ee1e143f72f", name: "Rommie Mojahed", email: "Rommie@cre8Advisors.com", phone: "602.702.4663" },
  { id: "6987abdaa473a39098593f50", name: "Andy Kroot",     email: "Andy@CRE8Advisors.com",   phone: "602.430.8589" },
  { id: "6987fada67c88dd8b9b89e39", name: "Lindsey Dulle",  email: "Lindsey@cre8advisors.com", phone: "602.317.7713" },
  { id: "6987fb2fa8757569eefd70fa", name: "Chad Shipley",   email: "Chad@cre8advisors.com",    phone: "480.220.5954" },
  { id: "6987fb6d372758be66e14cb8", name: "Kevin Smith",    email: "Kevin@cre8advisors.com",   phone: "518.428.8316" },
];

// ── Contact segments ──
// Live lists (Brokers / Buyers / Sellers, …) come from Resend via GET /api/email/audience.
// This array is a leftover fallback only — do not add new hardcoded names here.
export const EMAIL_SEGMENTS: EmailSegment[] = [];

// ── Email labels (campaign type badges) ──
export const EMAIL_LABELS = ["Just Listed", "Just Sold"] as const;

// ── Type colors for calendar events + badges ──
export const TYPE_COLORS: Record<string, string> = {
  "Just Listed": "#3B82F6", // Blue
  "Just Sold":   "#EF4444", // Red
};
// Fallback for custom labels / recurring
export const RECURRING_COLOR = "#8CC644"; // CRE8 green

// ── Schedule planner ──
// The AI scheduler's soft cap per business day. The week planner flags days above it.
export const MAX_SENDS_PER_DAY = 2;
export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  monthly: "Monthly",
};
// Diagonal stripe overlay used on recurring campaign chips (inline backgroundImage)
export const RECURRING_STRIPE =
  "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.18) 3px, rgba(255,255,255,0.18) 6px)";

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
// PNG (340×116, transparent) hosted in Supabase Storage. Gmail doesn't render SVG images.
const CRE8_LOGO_URL = "https://xrgfupoyaexgcrtxmqpp.supabase.co/storage/v1/object/public/email-assets/brand/cre8-white.png";
const CRE8_LOGO_RATIO = 340 / 116;
// Header logo heights: alone vs. with a partner logo (75%)
const HEADER_LOGO_H = 30;
const HEADER_LOGO_H_PAIRED = 23;
const PARTNER_LOGO_MAX_W = 140;
const CRE8_SITE_URL = "https://cre8advisors.com";
const CRE8_ADDRESS = "4120 E Indian School Rd, Phoenix, AZ 85018";
const CRE8_PHONE = "602.888.2738";
const CRE8_LINKEDIN = "https://www.linkedin.com/company/cre8-advisors";
const CRE8_INSTAGRAM = "https://www.instagram.com/cre8advisors";

// ── Broker headshot URLs (square PNGs from Webflow CDN) ──
export const BROKER_HEADSHOTS: Record<string, string> = {
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
 * Centralizes the mapping so preview, Resend broadcast creation, and cron routes all use one source.
 * Accepts any object with campaign-shaped fields (Campaign, CampaignFormData, or raw body).
 */
export function buildTemplateVars(
  data: Record<string, unknown>
): EmailTemplateVars {
  // Lazy import to avoid circular — getTypeColor is in utils.ts which imports from constants
  // Instead, inline the color lookup here since TYPE_COLORS is in this file
  // Group emails show exactly what was typed — a blank line stays blank.
  // Single-listing emails keep their defaults ("Just Listed" / the listing name).
  const isGroupData = data.campaign_kind === "group" || (Array.isArray(data.group_listings) && data.group_listings.length > 0);
  const label = isGroupData ? ((data.email_label as string) || "") : ((data.email_label as string) || "Just Listed");
  const labelColor = TYPE_COLORS[label] || RECURRING_COLOR;
  const heading = isGroupData
    ? ((data.heading_text as string) || "")
    : ((data.heading_text as string) || (data.listing_name as string) || "Property Listing");
  const brokerId = (data.broker_id as string) || "";

  // All brokers on the email: broker_ids (primary first) with broker_id guaranteed at the front.
  // Each resolves to a sender from EMAIL_SENDERS; the primary falls back to the stored fields.
  const rawIds = Array.isArray(data.broker_ids) ? (data.broker_ids as string[]) : [];
  const orderedIds = Array.from(new Set([brokerId, ...rawIds].filter(Boolean)));
  const brokers: BrokerCardVars[] = orderedIds.map((id) => {
    const sender = EMAIL_SENDERS.find((s) => s.id === id);
    const isPrimary = id === brokerId;
    return {
      name: sender?.name || (isPrimary ? (data.broker_name as string) : "") || "",
      email: (sender?.email || (isPrimary ? (data.broker_email as string) : "") || "").toLowerCase(),
      phone: sender?.phone || (isPrimary ? (data.broker_phone as string) : "") || "",
      headshotUrl: BROKER_HEADSHOTS[id] || "",
    };
  });

  return {
    label,
    labelColor,
    heading,
    introText: (data.intro_text as string) || "",
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
    partnerLogoUrl: (data.partner_logo_url as string) || "",
    partnerLogoWidth: Number(data.partner_logo_width) || 0,
    partnerLogoHeight: Number(data.partner_logo_height) || 0,
    brokers,
    groupListings: data.campaign_kind === "group" && Array.isArray(data.group_listings) ? (data.group_listings as GroupListing[]) : [],
  };
}

/**
 * Parse a highlight string on the first ":" into label + value.
 * "Price: $2,000,000" → { label: "Price", value: "$2,000,000" }
 * "10 Acres" (no title) → { label: "", value: "10 Acres" } — renders as "Detail"
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
 * Used by the preview endpoint, test sends, and Resend broadcast creation.
 * Dark premium CRE8 brand — table-based layout with all inline styles
 * for maximum email client compatibility.
 */
// NOTE: the `data-field="…"` attributes below are inert in email clients. The
// composer's live preview uses them to map a click in the email to the matching
// input (see src/lib/email/preview-wrapper.ts). This function must stay send-safe:
// no scripts, nothing preview-only.
export function renderEmailHtml(vars: EmailTemplateVars): string {
  // Parse highlights into label/value pairs for the stats grid
  const highlights = vars.highlights.filter((h) => h.trim()).map(parseHighlight);

  // Build the property details list — one full-width row per item, stacked.
  // Every row has a title (the part before ":") and a value. Custom items
  // typed without a title fall back to "Detail" so the layout stays consistent.
  let statsGridHtml = "";
  if (highlights.length > 0) {
    const rows = highlights.map((h, i) => `
                            <tr>
                              <td colspan="2" style="padding:0 0 8px 0;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td data-field="highlight-${i}" style="background-color:#111111;border-radius:6px;padding:12px 16px;">
                                      <!-- Title left, value right, on one line -->
                                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                          <td valign="middle" style="font-family:${EMAIL_FONT};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888888;line-height:1.3;white-space:nowrap;padding-right:16px;">${escapeHtml(h.label || "Detail")}</td>
                                          <td valign="middle" align="right" style="font-family:${EMAIL_FONT};font-size:14px;font-weight:700;color:#FFFFFF;line-height:1.3;text-align:right;">${escapeHtml(h.value)}</td>
                                        </tr>
                                      </table>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>`);
    statsGridHtml = rows.join("");
  }

  // CTA text varies by campaign type
  const ctaText = vars.groupListings.length > 0 ? "VIEW ALL LISTINGS" : vars.label === "Just Sold" ? "VIEW PROPERTY DETAILS" : "VIEW FULL LISTING";

  // Header logos — CRE8 alone at 30px, or CRE8 + partner both at 23px with a divider.
  const hasPartner = !!vars.partnerLogoUrl;
  const logoH = hasPartner ? HEADER_LOGO_H_PAIRED : HEADER_LOGO_H;
  const cre8W = Math.round(logoH * CRE8_LOGO_RATIO);
  let partnerW = 0;
  let partnerH = logoH;
  if (hasPartner) {
    const ratio = vars.partnerLogoWidth > 0 && vars.partnerLogoHeight > 0 ? vars.partnerLogoWidth / vars.partnerLogoHeight : 1;
    partnerW = Math.round(logoH * ratio);
    if (partnerW > PARTNER_LOGO_MAX_W) {
      // Very wide logo: cap the width and let it sit a little shorter
      partnerW = PARTNER_LOGO_MAX_W;
      partnerH = Math.round(PARTNER_LOGO_MAX_W / ratio);
    }
  }
  const headerLogosHtml = `
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="margin-left:auto;">
                      <tr>
                        <td valign="middle" style="line-height:0;">
                          <img src="${CRE8_LOGO_URL}" alt="CRE8 Advisors" width="${cre8W}" height="${logoH}" style="display:block;width:${cre8W}px;height:${logoH}px;border:0;outline:none;text-decoration:none;" />
                        </td>${hasPartner ? `
                        <td valign="middle" style="padding:0 12px;line-height:0;">
                          <div style="width:1px;height:${logoH}px;background-color:#444444;font-size:0;line-height:0;">&nbsp;</div>
                        </td>
                        <td valign="middle" data-field="partner" style="line-height:0;">
                          <img src="${vars.partnerLogoUrl}" alt="Partner" width="${partnerW}" height="${partnerH}" style="display:block;width:${partnerW}px;height:${partnerH}px;border:0;outline:none;text-decoration:none;" />
                        </td>` : ""}
                      </tr>
                    </table>`;

  // Group (digest) grid — two 4:3 landscape listing cards per row (50/50 table).
  // Gutter G = 32px matches heading/intro/body inset: edge ↔ card ↔ card ↔ edge.
  const isGroup = vars.groupListings.length > 0;
  const GROUP_GUTTER = 32;
  const GROUP_HALF = GROUP_GUTTER / 2;
  const GROUP_PHOTO_W = 252; // Outlook: (600 − 32 − 32 − 32) / 2
  const GROUP_PHOTO_H = 189; // 4:3 landscape (252 × 3/4)
  const groupChip = (chip: string) => {
    if (!chip) return "";
    const color = chip === "Under Contract" ? "#C2410C" : chip === "Price Reduced" ? "#EF4444" : "#8CC644";
    return `<p style="margin:0 0 4px 0;font-family:${EMAIL_FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${color};line-height:1.3;">${escapeHtml(chip)}</p>`;
  };
  const groupPhoto = (g: GroupListing) => {
    const href = g.url || CRE8_SITE_URL + "/listings";
    const photo = g.photo_url
      ? `<!--[if mso]><img src="${g.photo_url}" alt="${escapeHtml(g.name)}" width="${GROUP_PHOTO_W}" height="${GROUP_PHOTO_H}" style="display:block;width:${GROUP_PHOTO_W}px;height:${GROUP_PHOTO_H}px;border:0;outline:none;" /><![endif]--><!--[if !mso]><!--><div class="group-photo" style="position:relative;width:100%;height:0;padding-bottom:75%;background-color:#222222;background-image:url('${g.photo_url}');background-size:cover;background-position:center center;background-repeat:no-repeat;border-radius:6px 6px 0 0;overflow:hidden;line-height:0;font-size:0;"><img src="${g.photo_url}" alt="${escapeHtml(g.name)}" width="${GROUP_PHOTO_W}" height="${GROUP_PHOTO_H}" style="position:absolute;top:0;left:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center center;border:0;outline:none;text-decoration:none;" /></div><!--<![endif]-->`
      : `<div class="group-photo" style="width:100%;height:0;padding-bottom:75%;background-color:#222222;border-radius:6px 6px 0 0;line-height:0;font-size:0;">&nbsp;</div>`;
    return `<a href="${href}" target="_blank" style="display:block;line-height:0;font-size:0;border:0;text-decoration:none;">${photo}</a>`;
  };
  const groupCard = (g: GroupListing, i: number) => {
    const href = g.url || CRE8_SITE_URL + "/listings";
    return `<table role="presentation" class="group-card" data-field="group-${i}" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border:1px solid #FFFFFF;border-radius:6px;">
                        <tr>
                          <td style="padding:0;line-height:0;font-size:0;border-radius:6px 6px 0 0;overflow:hidden;">
                            ${groupPhoto(g)}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:12px 14px 14px 14px;">
                            ${groupChip(g.chip)}
                            <a href="${href}" target="_blank" style="text-decoration:none;">
                              <p style="margin:0;font-family:${EMAIL_FONT};font-size:19px;font-weight:700;text-transform:uppercase;color:#FFFFFF;line-height:1.15;letter-spacing:0.5px;">${escapeHtml(g.name)}</p>
                            </a>
                            ${g.summary ? `<p style="margin:4px 0 0 0;font-family:${EMAIL_FONT};font-size:12px;color:#BFBFBF;line-height:1.4;">${escapeHtml(g.summary)}</p>` : ""}
                            <a href="${href}" target="_blank" style="display:inline-block;margin-top:10px;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#8CC644;text-decoration:none;line-height:1.3;">View listing &rarr;</a>
                          </td>
                        </tr>
                      </table>`;
  };
  let groupGridHtml = "";
  if (isGroup) {
    // Real 50/50 table so the composer preview (≈534–600px iframe) stays 2-up.
    // Hybrid inline-block + max-width:292px wrapped at that width. Phones stack.
    const rows: string[] = [];
    for (let i = 0; i < vars.groupListings.length; i += 2) {
      const left = groupCard(vars.groupListings[i], i);
      const hasRight = i + 1 < vars.groupListings.length;
      const right = hasRight ? groupCard(vars.groupListings[i + 1], i + 1) : "";
      rows.push(`<tr>
                <td class="group-col" width="50%" valign="top" style="width:50%;padding:0 ${GROUP_HALF}px ${GROUP_GUTTER}px 0;">
                  ${left}
                </td>
                <td class="group-col" width="50%" valign="top" style="width:50%;padding:0 0 ${GROUP_GUTTER}px ${GROUP_HALF}px;">
                  ${right || "&nbsp;"}
                </td>
              </tr>`);
    }
    groupGridHtml = rows.join("");
  }

  // Broker rows sit directly on the black band — no nested gray cards.
  const brokerList: BrokerCardVars[] =
    vars.brokers && vars.brokers.length > 0
      ? vars.brokers
      : [{ name: vars.brokerName, email: vars.brokerEmail, phone: vars.brokerPhone, headshotUrl: vars.brokerHeadshotUrl }];
  const brokerCardsHtml = brokerList
    .map(
      (b, i) => `
                <tr>
                  <td style="padding:${i === 0 ? "0" : "20px"} 0 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        ${b.headshotUrl ? `
                        <td valign="middle" style="width:80px;padding-right:20px;">
                          <img src="${b.headshotUrl}" alt="${escapeHtml(b.name)}" width="80" height="80" style="display:block;width:80px;height:80px;border-radius:6px;border:0;outline:none;" />
                        </td>` : ""}
                        <td valign="middle" style="font-family:${EMAIL_FONT};">
                          <p style="margin:0;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.3;">
                            ${escapeHtml(b.name)}
                          </p>
                          <p style="margin:6px 0 0 0;font-size:13px;line-height:1.4;">
                            <a href="mailto:${b.email}" style="color:#8CC644;text-decoration:none;">${escapeHtml(b.email)}</a>${b.phone ? ` &nbsp;&middot;&nbsp; <span style="color:#BFBFBF;">${escapeHtml(b.phone)}</span>` : ""}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
    )
    .join("");

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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
    /* Web font: Inter (admin UI). Old import was Bebas Neue + DM Sans. */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* Light mode default — white outer background, dark card */
    :root { color-scheme: light dark; supported-color-schemes: light dark; }

    /* Dark mode: keep the dark card intact, darken outer bg to match */
    @media (prefers-color-scheme: dark) {
      .body, .body-table { background-color: #111111 !important; }
      .card-bg { background-color: #1A1A1A !important; }
    }
    /* Phones: stack the 50/50 listing cards. 480px — not 600 — so the
       composer preview iframe (~534–600px) and desktop clients stay 2-up. */
    @media only screen and (max-width: 480px) {
      .group-col {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
    }
    u + .body { background-color: #FFFFFF !important; }
    [data-ogsc] .body { background-color: #FFFFFF !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background-color:#FFFFFF;font-family:${EMAIL_FONT};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

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
            <td style="background-color:#1A1A1A;padding:${isGroup ? "28px 32px 14px 32px" : "28px 32px"};">
              <!--[if mso]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
              <v:fill type="tile" color="#1A1A1A"/>
              <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
              <![endif]-->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Left: Label + Heading + Address -->
                  <td valign="top" style="padding-right:16px;">
                    <!-- Top line — the listing name (or a typed override), small green caps -->
                    ${vars.heading ? `
                    <p data-field="heading" style="margin:0 0 5px 0;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#8CC644;line-height:1.4;">
                      ${escapeHtml(vars.heading.toUpperCase())}
                    </p>` : ""}
                    <!-- Heading — Inter semibold (admin font-bebas trial).
                         Outlook/Gmail strip web fonts and fall back to the system stack. -->
                    <!-- Big line — the heading typed in the composer ("Just Listed", "Price Reduced", …) -->
                    ${vars.label ? `
                    <h1 data-field="label" style="margin:0;font-family:${EMAIL_FONT};font-size:30px;font-weight:700;text-transform:uppercase;color:#FFFFFF;line-height:1.15;letter-spacing:1px;">
                      ${escapeHtml(vars.label)}
                    </h1>` : ""}
                    ${vars.propertyAddress ? `
                    <p style="margin:6px 0 0 0;font-family:${EMAIL_FONT};font-size:14px;color:#999999;line-height:1.4;">
                      ${escapeHtml(vars.propertyAddress)}
                    </p>` : ""}
                  </td>
                  <!-- Right: CRE8 logo (+ optional partner logo, same height, thin divider) -->
                  <td valign="top" style="text-align:right;white-space:nowrap;">
                    ${headerLogosHtml}
                  </td>
                </tr>
              </table>
              <!--[if mso]>
              </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Hero property photo — full bleed, clickable to listing page (single-listing emails only) -->
          ${vars.photoUrl && !isGroup ? `
          <tr>
            <td data-field="photo" style="padding:0;line-height:0;font-size:0;">
              ${vars.listingUrl
                ? `<a href="${vars.listingUrl || CRE8_SITE_URL + "/listings"}" target="_blank" style="display:block;line-height:0;font-size:0;border:0;text-decoration:none;"><img src="${vars.photoUrl}" alt="${escapeHtml(vars.heading)}" width="600" style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;" /></a>`
                : `<img src="${vars.photoUrl}" alt="${escapeHtml(vars.heading)}" width="600" style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`}
            </td>
          </tr>` : ""}

          <!-- Intro (group emails) — under heading, above listing cards -->
          ${isGroup && vars.introText ? `
          <tr>
            <td style="padding:4px 32px 0 32px;">
              <p data-field="intro" style="margin:0;font-family:${EMAIL_FONT};font-size:15px;color:#BFBFBF;line-height:1.65;">
                ${escapeHtml(vars.introText)}
              </p>
            </td>
          </tr>` : ""}

          <!-- Group grid — two 4:3 landscape listing cards per row, 32px gutters -->
          ${isGroup ? `
          <tr>
            <td style="padding:20px ${GROUP_GUTTER}px 0 ${GROUP_GUTTER}px;">
              <table role="presentation" class="group-grid" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${groupGridHtml}
              </table>
            </td>
          </tr>` : ""}

          <!-- Body text (optional) — single: under photo; group: under listing cards -->
          ${vars.bodyText ? `
          <tr>
            <td style="padding:${isGroup ? "8px" : "20px"} 32px 0 32px;">
              <p data-field="body" style="margin:0;font-family:${EMAIL_FONT};font-size:15px;color:#BFBFBF;line-height:1.65;">
                ${escapeHtml(vars.bodyText)}
              </p>
            </td>
          </tr>` : ""}

          <!-- Stats grid — 2-column layout on #111111 cells -->
          ${statsGridHtml && !isGroup ? `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${statsGridHtml}
              </table>
            </td>
          </tr>` : ""}

          <!-- CTA button — dark text on green -->
          ${(vars.listingUrl || isGroup) ? `
          <tr>
            <td data-field="cta" style="padding:28px 32px 0 32px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:4px;background-color:#8CC644;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${vars.listingUrl || CRE8_SITE_URL + "/listings"}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="8%" strokecolor="#8CC644" fillcolor="#8CC644">
                    <w:anchorlock/>
                    <center style="color:#000000;font-family:${EMAIL_FONT};font-size:14px;font-weight:bold;letter-spacing:1.5px;">
                      ${escapeHtml(ctaText)}
                    </center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${vars.listingUrl || CRE8_SITE_URL + "/listings"}" target="_blank" style="display:inline-block;background-color:#8CC644;color:#000000;font-family:${EMAIL_FONT};font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-decoration:none;padding:14px 40px;border-radius:4px;line-height:1.2;mso-hide:all;">
                      ${escapeHtml(ctaText)}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ""}

          <!-- Broker band — flat #000, photo/name/email/phone sit on the black -->
          <tr>
            <td data-field="broker" style="background-color:#000000;padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${brokerCardsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer — black background with top border -->
          <tr>
            <td style="background-color:#000000;border-top:1px solid #333333;padding:28px 32px 24px 32px;text-align:center;">
              <!-- Small CRE8 logo -->
              <img src="${CRE8_LOGO_URL}" alt="CRE8 Advisors" width="100" height="34" style="display:block;width:100px;height:34px;margin:0 auto;border:0;outline:none;text-decoration:none;" />

              <!-- Company address + phone -->
              <p style="margin:14px 0 0 0;font-family:${EMAIL_FONT};font-size:12px;color:#666666;line-height:1.5;">
                ${escapeHtml(CRE8_ADDRESS)}<br/>
                ${escapeHtml(CRE8_PHONE)}
              </p>

              <!-- Social links — uppercase -->
              <p style="margin:14px 0 0 0;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;line-height:1.5;">
                <a href="${CRE8_LINKEDIN}" target="_blank" style="color:#8CC644;text-decoration:none;">LinkedIn</a>
                &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="${CRE8_INSTAGRAM}" target="_blank" style="color:#8CC644;text-decoration:none;">Instagram</a>
                &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="${CRE8_SITE_URL}" target="_blank" style="color:#8CC644;text-decoration:none;">Website</a>
              </p>

              <!-- Unsubscribe (Resend merge tag — replaced with a real per-contact link at send time) -->
              <p style="margin:18px 0 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.4;">
                <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#666666;text-decoration:underline;">Unsubscribe</a>
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
