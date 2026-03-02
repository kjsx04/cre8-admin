// ── Document Types ──

export type DocTypeId =
  | "loi_building"
  | "loi_land"
  | "loi_lease"
  | "listing_sale"
  | "listing_sale_lease"
  | "listing_lease";

export type DocMode = "flexible" | "strict";

export interface DocType {
  id: DocTypeId;
  name: string;
  slug: string;
  mode: DocMode;
  description: string;
  templateFile: string;
  sharePointFolder: string;
  enabled: boolean;
}

// ── Variable Maps ──

export interface VariableDef {
  token: string;
  label: string;
  source: "auto" | "cms_teams" | "cms_listing" | "user_input" | "default";
  flag: boolean;
  defaultValue?: string;
  writtenVariant?: string; // token name for written-out version (e.g. "emd_days" → "emd_days_written")
  numberField?: boolean;   // true = auto-generates written variant
}

// ── AI Extraction ──

export interface ExtractedVariable {
  value: string;
  confidence: number;
  label: string;
  flag: boolean;
}

export interface DetectedClause {
  id: string;
  detected: boolean;
  source: "logic" | "library" | "ai_drafted";
  variables: Record<string, string>;
  customText?: string;
}

export interface ExtractionResult {
  variables: Record<string, ExtractedVariable>;
  clauses: DetectedClause[];
  customTerms?: string[];
}

// ── Review Screen State ──

export interface ReviewState {
  variables: Record<string, ExtractedVariable>;
  clauses: ClauseState[];
}

export interface ClauseState {
  id: string;
  included: boolean;
  source: "logic" | "library" | "ai_drafted";
  label: string;
  summary: string;
  text: string;
  variables: Record<string, string>;
  expanded: boolean;
}

// ── CMS Data ──

export interface CmsTeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface CmsListing {
  id: string;
  name: string;
  address: string;
  slug: string;
}

// ── Generation ──

export interface GenerateRequest {
  docType: DocTypeId;
  variables: Record<string, string>;
  clauses: { id: string; included: boolean; variables: Record<string, string>; customText?: string }[];
}
