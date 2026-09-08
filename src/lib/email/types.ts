/**
 * Email Campaign System — Type Definitions
 *
 * All interfaces for the email campaign feature:
 * campaigns, scheduling, segments, senders.
 */

// Campaign type: one-time send or recurring series
export type CampaignType = "one-time" | "recurring";

// How often recurring campaigns send
export type CampaignFrequency = "one-time" | "weekly" | "bi-weekly" | "monthly";

// Campaign lifecycle status
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"     // recurring with future sends
  | "paused"     // recurring paused by user
  | "completed"  // all sends done
  | "cancelled"; // manually stopped

// Email label (type badge shown on calendar)
export type EmailLabel = "Just Listed" | "Just Sold" | string;

// Priority level (auto-derived from listing + label)
export type PriorityLevel = 1 | 2 | 3 | 4 | 5;

// User-chosen scheduling priority: "high" = grab a great slot, "normal" = fit anywhere
export type CampaignPriority = "high" | "normal";

// ── Campaign record (matches Supabase schema) ──
export interface Campaign {
  id: string;
  listing_id: string;
  listing_name: string;
  campaign_type: CampaignType;
  email_label: string;
  heading_text: string | null;
  body_text: string | null;
  photo_url: string | null;
  highlights: string[];       // JSONB array of highlight strings
  listing_page_url: string | null;
  broker_id: string;              // primary broker — the From address
  broker_name: string;
  broker_email: string;
  broker_phone: string | null;
  broker_ids: string[];           // all brokers shown on the email (primary first)
  priority: CampaignPriority;     // tells the AI scheduler how hard to fight for a slot
  segment_id: string | null;
  segment_name: string;
  frequency: CampaignFrequency | null;
  scheduled_date: string | null;       // ISO timestamp of the pending (or last) send
  provider_send_id: string | null;     // Resend broadcast id for the pending send (null once sent/cancelled)
  next_send_date: string | null;       // ISO timestamp (recurring) — kept equal to scheduled_date
  last_sent_at: string | null;         // ISO timestamp of the most recent send that went out
  end_date: string | null;             // ISO timestamp (recurring end)
  status: CampaignStatus;
  ai_reasoning: string | null;
  created_at: string;
  updated_at: string;
}

// ── Form data for creating/editing a campaign ──
export interface CampaignFormData {
  listing_id: string;
  listing_name: string;
  campaign_type: CampaignType;
  email_label: string;
  heading_text?: string;
  body_text?: string;
  photo_url?: string;
  highlights?: string[];
  listing_page_url?: string;
  broker_id: string;
  broker_name: string;
  broker_email: string;
  broker_phone?: string;
  broker_ids?: string[];          // optional — defaults to [broker_id]
  priority?: CampaignPriority;    // defaults to "normal"
  segment_id?: string;
  segment_name?: string;
  frequency?: CampaignFrequency;
  end_date?: string;
}

// ── AI schedule result ──
export interface ScheduleSlot {
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM (24h, MST)
  reasoning: string;
}

export interface CalendarChange {
  id: string;          // campaign ID being shifted
  new_date: string;    // YYYY-MM-DD
  new_time: string;    // HH:MM
  reason: string;
}

export interface ScheduleResult {
  new_campaign_slot: ScheduleSlot;
  calendar_changes: CalendarChange[];
}

// ── Email segment (maps to a Resend segment via env vars — see provider.ts) ──
export interface EmailSegment {
  id: string;
  name: string;
  enabled: boolean;
}

// ── Broker sender config ──
export interface EmailSender {
  id: string;          // Webflow team collection item ID
  name: string;
  email: string;
  phone: string;
}

// ── Email template variables (passed to renderEmailHtml) ──
export interface EmailTemplateVars {
  label: string;           // "Just Listed", "Just Sold", etc.
  labelColor: string;      // hex color for the badge
  heading: string;
  bodyText: string;
  photoUrl: string;
  highlights: string[];
  listingUrl: string;
  brokerName: string;          // primary broker (kept for compatibility)
  brokerEmail: string;
  brokerPhone: string;
  preheaderText: string;       // Hidden inbox preview text
  brokerHeadshotUrl: string;   // Square PNG from Webflow CDN
  brokerTitle: string;         // "Associate Broker" etc.
  propertyAddress: string;     // Street address line below heading
  brokers: BrokerCardVars[];   // one card per broker, primary first
}

// One broker contact card in the email
export interface BrokerCardVars {
  name: string;
  email: string;
  phone: string;
  headshotUrl: string;
}
