// ── Deal status and type enums ──

export type DealStatus = "active" | "due_diligence" | "closing" | "closed" | "cancelled";
export type DealType = "sale" | "lease";

// ── Dynamic critical date row (stored in deal_dates table) ──

export interface DealDate {
  id: string;
  deal_id: string;
  label: string;
  date: string;                    // YYYY-MM-DD (always resolved to a calendar date)
  offset_days: number | null;      // e.g. 30 — nullable if it's an absolute date
  offset_from: string | null;      // deal_dates.id or "escrow_open" — nullable for absolute dates
  sort_order: number;
}

// ── Deal member — broker assigned to a deal with optional split override ──

export interface DealMember {
  id: string;
  deal_id: string;
  broker_id: string;
  broker_name?: string;        // joined from brokers table
  broker_email?: string;       // joined from brokers table
  split_percent: number | null; // null = even split among all members
}

// ── Additional commission split (referral fee, co-broker, etc.) ──

export interface AdditionalSplit {
  label: string;
  percent: number;                 // decimal: 0.25 = 25%
}

// ── Deal — matches the Supabase `deals` table ──

export interface Deal {
  id: string;
  broker_id: string;
  deal_name: string;
  property_address: string | null;
  deal_type: DealType;
  price: number | null;
  commission_rate: number;   // e.g. 0.03 = 3%
  broker_split: number;      // e.g. 0.50 = 50%
  effective_date: string | null;   // ISO date string
  escrow_open_date: string | null;
  // Legacy fixed date fields — kept in DB but code uses deal_dates instead
  feasibility_days: number | null;
  dd_extension_date: string | null;
  inside_close_days: number | null;
  outside_close_days: number | null;
  status: DealStatus;
  actual_close_date: string | null;
  cancel_reason: string | null;
  notes: string | null;
  listing_id: string | null;        // Webflow CMS item ID (if tied to a CRE8 listing)
  parcel_number: string | null;     // APN from parcel picker
  additional_splits: AdditionalSplit[];  // extra commission deductions
  deal_dates?: DealDate[];         // dynamic critical dates (joined from deal_dates table)
  deal_members?: DealMember[];     // brokers assigned to this deal (joined from deal_members table)
  sharepoint_folder_url?: string | null;  // URL to deal's SharePoint folder
  created_at: string;
  updated_at: string;
}

// ── Form data for creating/editing a deal ──

export interface DealFormData {
  deal_name: string;
  property_address: string;
  deal_type: DealType;
  price: string;             // string for form input — parsed to number on save
  commission_rate: string;   // e.g. "3" for 3%
  broker_split: string;      // e.g. "50" for 50%
  effective_date: string;
  escrow_open_date: string;
  notes: string;
  listing_id: string;        // Webflow CMS item ID (empty = not linked)
  parcel_number: string;     // APN from parcel picker
  additional_splits: AdditionalSplit[];  // extra commission deductions
  broker_members: { broker_id: string; split_percent: number | null }[];  // brokers on this deal
  // deal_dates managed separately — sent as a parallel array on save
}

// ── CRE8 listing from Webflow CMS (used in listing selector dropdown) ──

export interface CRE8Listing {
  id: string;
  name: string;
  address: string;
  price: string;
  listing_type: string;      // "For Sale", "For Lease", etc.
}

// ── Response from the AI extraction API route ──

export interface ExtractedDealData {
  deal_name?: string;
  property_address?: string;
  deal_type?: DealType;
  price?: string;
  commission_rate?: string;
  effective_date?: string;
  escrow_open_date?: string;
  notes?: string;
  document_type?: "loi" | "psa" | "other";  // AI-detected doc type
  // AI now extracts dates as milestone objects instead of day-count fields
  deal_dates?: { label: string; date?: string; offset_days?: number; offset_reference?: string }[];
}

// ── Broker — matches the Supabase `brokers` table ──

export interface Broker {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  default_commission_rate: number;       // e.g. 0.03 = 3%
  default_broker_split: number;          // e.g. 0.50 = 50%
  default_additional_splits: AdditionalSplit[];
}

// ── Broker defaults (returned from /api/broker/defaults) ──

export interface BrokerDefaults {
  commission_rate: number;         // decimal (0.03)
  broker_split: number;            // decimal (0.50)
  additional_splits: AdditionalSplit[];
}

// ── Critical date entry for countdown display ──

export interface CriticalDate {
  label: string;
  date: Date;
  isPast: boolean;
  daysAway: number;          // negative = overdue
  urgency: "green" | "yellow" | "red" | "gray";
}

// ── File from a deal's SharePoint folder ──

export interface DealFile {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  lastModified: string;
  mimeType: string;
  downloadUrl?: string;     // pre-authenticated temporary download link
}
