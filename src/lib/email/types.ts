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
  broker_id: string;
  broker_name: string;
  broker_email: string;
  broker_phone: string | null;
  segment_id: string | null;
  segment_name: string;
  frequency: CampaignFrequency | null;
  scheduled_date: string | null;       // ISO timestamp
  sendgrid_single_send_id: string | null;
  next_send_date: string | null;       // ISO timestamp (recurring)
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

// ── Email segment (contact list in SendGrid) ──
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

// ── Calendar event (for FullCalendar rendering) ──
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;       // ISO date string
  backgroundColor: string;
  borderColor: string;
  classNames?: string[];  // Extra CSS classes (e.g., 'recurring-event')
  extendedProps: {
    campaign: Campaign;
    priority: PriorityLevel;
  };
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
  brokerName: string;
  brokerEmail: string;
  brokerPhone: string;
  preheaderText: string;       // Hidden inbox preview text
  brokerHeadshotUrl: string;   // Square PNG from Webflow CDN
  brokerTitle: string;         // "Associate Broker" etc.
  propertyAddress: string;     // Street address line below heading
}
