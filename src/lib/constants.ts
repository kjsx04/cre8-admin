import { DocType, VariableDef } from "./types";

// ── Document Types ──

export const DOC_TYPES: DocType[] = [
  {
    id: "loi_building",
    name: "LOI — Building Purchase",
    slug: "loi-building",
    mode: "flexible",
    description: "Letter of Intent for purchasing a commercial building",
    templateFile: "loi-building-tokenized.docx",
    sharePointFolder: "/CRE8 Advisors/Documents/LOIs/Building/",
    enabled: true,
  },
  {
    id: "loi_land",
    name: "LOI — Land Purchase",
    slug: "loi-land",
    mode: "flexible",
    description: "Letter of Intent for purchasing vacant land",
    templateFile: "loi-land-tokenized.docx",
    sharePointFolder: "/CRE8 Advisors/Documents/LOIs/Land/",
    enabled: true,
  },
  {
    id: "loi_lease",
    name: "LOI — Lease",
    slug: "loi-lease",
    mode: "flexible",
    description: "Letter of Intent for a commercial lease",
    templateFile: "loi-lease-tokenized.docx",
    sharePointFolder: "/CRE8 Advisors/Documents/LOIs/Lease/",
    enabled: true,
  },
  {
    id: "listing_sale",
    name: "Listing Agreement — Sale",
    slug: "listing-sale",
    mode: "strict",
    description: "Exclusive listing agreement for property sale",
    templateFile: "sale-listing-agreement-tokenized.docx",
    sharePointFolder: "/CRE8 Advisors/Documents/ListingAgreements/Sale/",
    enabled: true,
  },
  {
    id: "listing_sale_lease",
    name: "Listing Agreement — Sale/Lease",
    slug: "listing-sale-lease",
    mode: "strict",
    description: "Exclusive listing agreement for property sale, exchange, or lease",
    templateFile: "sale-lease-listing-agreement-tokenized.docx",
    sharePointFolder: "/CRE8 Advisors/Documents/ListingAgreements/Lease/",
    enabled: true,
  },
  {
    id: "listing_lease",
    name: "Listing Agreement — Lease",
    slug: "listing-lease",
    mode: "strict",
    description: "Exclusive representation agreement to lease property",
    templateFile: "lease-listing-agreement-tokenized.docx",
    sharePointFolder: "/CRE8 Advisors/Documents/ListingAgreements/Lease/",
    enabled: true,
  },
];

// ── Helper to look up doc type by slug ──

export function getDocTypeBySlug(slug: string): DocType | undefined {
  return DOC_TYPES.find((d) => d.slug === slug);
}

// ── LOI Building Variable Map (30 tokens) ──

export const LOI_BUILDING_VARIABLES: VariableDef[] = [
  { token: "date", label: "Date", source: "auto", flag: false },
  { token: "seller_broker_name", label: "Seller Broker Name", source: "cms_teams", flag: false },
  { token: "seller_broker_company", label: "Seller Broker Company", source: "cms_teams", flag: false },
  { token: "seller_broker_email", label: "Seller Broker Email", source: "cms_teams", flag: false },
  { token: "property_address", label: "Property Address", source: "cms_listing", flag: false },
  { token: "parcel_number", label: "Parcel Number(s)", source: "user_input", flag: true },
  { token: "seller_entity", label: "Seller Entity", source: "user_input", flag: true },
  { token: "buyer_entity", label: "Buyer Entity", source: "user_input", flag: true },
  { token: "purchase_price", label: "Purchase Price ($)", source: "user_input", flag: true, numberField: true },
  { token: "earnest_money", label: "Earnest Money ($)", source: "user_input", flag: true, numberField: true, writtenVariant: "earnest_money_written" },
  { token: "earnest_money_written", label: "Earnest Money (written)", source: "auto", flag: true },
  { token: "emd_days", label: "Days to Deposit EMD", source: "user_input", flag: false, defaultValue: "3", numberField: true, writtenVariant: "emd_days_written" },
  { token: "emd_days_written", label: "Days to Deposit EMD (written)", source: "auto", flag: false },
  { token: "title_company", label: "Title Company", source: "default", flag: false, defaultValue: "Fidelity National Title" },
  { token: "title_agent", label: "Title Agent", source: "default", flag: false, defaultValue: "Kristina Gooding" },
  { token: "psa_draft_days", label: "PSA Draft Days", source: "user_input", flag: false, defaultValue: "10", numberField: true, writtenVariant: "psa_draft_days_written" },
  { token: "psa_draft_days_written", label: "PSA Draft Days (written)", source: "auto", flag: false },
  { token: "closing_period", label: "Closing Period (days)", source: "user_input", flag: false, defaultValue: "30", numberField: true, writtenVariant: "closing_period_written" },
  { token: "closing_period_written", label: "Closing Period (written)", source: "auto", flag: false },
  { token: "extension_count", label: "Extension Count", source: "user_input", flag: false, defaultValue: "1", numberField: true, writtenVariant: "extension_count_written" },
  { token: "extension_count_written", label: "Extension Count (written)", source: "auto", flag: false },
  { token: "extension_days", label: "Extension Days", source: "user_input", flag: false, defaultValue: "30", numberField: true, writtenVariant: "extension_days_written" },
  { token: "extension_days_written", label: "Extension Days (written)", source: "auto", flag: false },
  { token: "extension_deposit", label: "Extension Deposit ($)", source: "user_input", flag: false, numberField: true },
  { token: "seller_disclosures_days", label: "Seller Disclosures Days", source: "user_input", flag: false, defaultValue: "5", numberField: true, writtenVariant: "seller_disclosures_days_written" },
  { token: "seller_disclosures_days_written", label: "Seller Disclosures Days (written)", source: "auto", flag: false },
  { token: "dd_period", label: "Due Diligence Period (days)", source: "user_input", flag: false, defaultValue: "90", numberField: true, writtenVariant: "dd_period_written" },
  { token: "dd_period_written", label: "Due Diligence Period (written)", source: "auto", flag: false },
  { token: "broker_names", label: "CRE8 Broker Name(s)", source: "cms_teams", flag: false },
  { token: "commission_pct", label: "Commission %", source: "user_input", flag: false, defaultValue: "3%" },
  { token: "cre8_agent_email", label: "CRE8 Agent Email", source: "cms_teams", flag: false },
  { token: "cre8_agent_phone", label: "CRE8 Agent Phone", source: "cms_teams", flag: false },
];

// ── LOI Land Variable Map ──

export const LOI_LAND_VARIABLES: VariableDef[] = [
  { token: "date", label: "Date", source: "auto", flag: false },
  { token: "seller_broker_name", label: "Seller Broker Name", source: "cms_teams", flag: false },
  { token: "seller_broker_company", label: "Seller Broker Company", source: "cms_teams", flag: false },
  { token: "seller_broker_email", label: "Seller Broker Email", source: "cms_teams", flag: false },
  { token: "property_address", label: "Property Address", source: "cms_listing", flag: false },
  { token: "parcel_number", label: "Parcel Number(s)", source: "user_input", flag: true },
  { token: "acreage", label: "Acreage", source: "user_input", flag: false },
  { token: "seller_entity", label: "Seller Entity", source: "user_input", flag: true },
  { token: "buyer_entity", label: "Buyer Entity", source: "user_input", flag: true },
  { token: "purchase_price", label: "Total Purchase Price ($)", source: "user_input", flag: true, numberField: true },
  { token: "price_per_acre", label: "Price Per Acre ($)", source: "user_input", flag: false, numberField: true },
  { token: "price_per_sqft", label: "Price Per SF ($)", source: "user_input", flag: false, numberField: true },
  { token: "price_per_unit", label: "Price Per Unit (display)", source: "auto", flag: false },
  { token: "earnest_money", label: "Earnest Money ($)", source: "user_input", flag: true, numberField: true, writtenVariant: "earnest_money_written" },
  { token: "earnest_money_written", label: "Earnest Money (written)", source: "auto", flag: true },
  { token: "emd_days", label: "Days to Deposit EMD", source: "user_input", flag: false, defaultValue: "3", numberField: true, writtenVariant: "emd_days_written" },
  { token: "emd_days_written", label: "Days to Deposit EMD (written)", source: "auto", flag: false },
  { token: "title_company", label: "Title Company", source: "default", flag: false, defaultValue: "Fidelity National Title" },
  { token: "title_agent", label: "Title Agent", source: "default", flag: false, defaultValue: "Kristina Gooding" },
  { token: "psa_draft_days", label: "PSA Draft Days", source: "user_input", flag: false, defaultValue: "10", numberField: true, writtenVariant: "psa_draft_days_written" },
  { token: "psa_draft_days_written", label: "PSA Draft Days (written)", source: "auto", flag: false },
  { token: "closing_period", label: "Closing Period (days)", source: "user_input", flag: false, defaultValue: "30", numberField: true, writtenVariant: "closing_period_written" },
  { token: "closing_period_written", label: "Closing Period (written)", source: "auto", flag: false },
  { token: "extension_count", label: "Extension Count", source: "user_input", flag: false, defaultValue: "1", numberField: true, writtenVariant: "extension_count_written" },
  { token: "extension_count_written", label: "Extension Count (written)", source: "auto", flag: false },
  { token: "extension_days", label: "Extension Days", source: "user_input", flag: false, defaultValue: "30", numberField: true, writtenVariant: "extension_days_written" },
  { token: "extension_days_written", label: "Extension Days (written)", source: "auto", flag: false },
  { token: "extension_deposit", label: "Extension Deposit ($)", source: "user_input", flag: false, numberField: true },
  { token: "seller_disclosures_days", label: "Seller Disclosures Days", source: "user_input", flag: false, defaultValue: "5", numberField: true, writtenVariant: "seller_disclosures_days_written" },
  { token: "seller_disclosures_days_written", label: "Seller Disclosures Days (written)", source: "auto", flag: false },
  { token: "dd_period", label: "Due Diligence Period (days)", source: "user_input", flag: false, defaultValue: "90", numberField: true, writtenVariant: "dd_period_written" },
  { token: "dd_period_written", label: "Due Diligence Period (written)", source: "auto", flag: false },
  { token: "broker_names", label: "CRE8 Broker Name(s)", source: "cms_teams", flag: false },
  { token: "commission_pct", label: "Commission %", source: "user_input", flag: false, defaultValue: "3%" },
  { token: "cre8_agent_email", label: "CRE8 Agent Email", source: "cms_teams", flag: false },
  { token: "cre8_agent_phone", label: "CRE8 Agent Phone", source: "cms_teams", flag: false },
];

// ── LOI Lease Variable Map ──

export const LOI_LEASE_VARIABLES: VariableDef[] = [
  { token: "date", label: "Date", source: "auto", flag: false },
  { token: "property_name", label: "Property Name", source: "user_input", flag: false },
  { token: "property_address", label: "Property Address", source: "user_input", flag: false },
  { token: "landlord_contact_name", label: "Landlord Contact Name", source: "user_input", flag: false },
  { token: "tenant_entity", label: "Tenant Entity", source: "user_input", flag: true },
  { token: "landlord", label: "Landlord Entity", source: "user_input", flag: true },
  { token: "square_footage", label: "Square Footage", source: "user_input", flag: true, numberField: true },
  { token: "trade_name", label: "Trade Name", source: "user_input", flag: false },
  { token: "permitted_use", label: "Permitted Use", source: "user_input", flag: false },
  { token: "lease_term", label: "Lease Term", source: "user_input", flag: false },
  { token: "renewal_option", label: "Renewal Option", source: "user_input", flag: false },
  { token: "base_rent_psf", label: "Base Rent PSF ($)", source: "user_input", flag: true, numberField: true },
  { token: "free_rent_months", label: "Free Rent Months", source: "user_input", flag: false },
  { token: "rent_increase_pct", label: "Annual Rent Increase %", source: "user_input", flag: false, defaultValue: "3%" },
  { token: "rent_commencement_days", label: "Rent Commencement (days)", source: "user_input", flag: false, defaultValue: "180", numberField: true, writtenVariant: "rent_commencement_days_written" },
  { token: "rent_commencement_days_written", label: "Rent Commencement (written)", source: "auto", flag: false },
  { token: "guarantor", label: "Guarantor", source: "user_input", flag: false },
  { token: "security_deposit", label: "Security Deposit", source: "default", flag: false, defaultValue: "Security Deposit shall be equal to one month's rent" },
  { token: "cam_expenses", label: "CAM Expenses", source: "user_input", flag: false },
  { token: "exclusive_use", label: "Exclusive Use", source: "user_input", flag: false },
  { token: "ti_allowance_psf", label: "TI Allowance PSF ($)", source: "user_input", flag: true, numberField: true },
  { token: "landlord_work", label: "Landlord's Work", source: "user_input", flag: false },
  { token: "commission_pct", label: "Commission %", source: "user_input", flag: false, defaultValue: "4%" },
  { token: "broker_names", label: "CRE8 Broker Name(s)", source: "cms_teams", flag: false },
  { token: "cre8_agent_email", label: "CRE8 Agent Email", source: "cms_teams", flag: false },
  { token: "cre8_agent_phone", label: "CRE8 Agent Phone", source: "cms_teams", flag: false },
];

// ── Listing Agreement — Sale Variable Map (13 tokens) ──

export const LISTING_SALE_VARIABLES: VariableDef[] = [
  // Property
  { token: "property_address", label: "Property Address", source: "user_input", flag: false },
  { token: "county", label: "County", source: "user_input", flag: false, defaultValue: "Maricopa" },
  { token: "parcel_number", label: "Parcel Number (APN)", source: "user_input", flag: true },
  { token: "acreage", label: "Acreage", source: "user_input", flag: false },
  // Owner
  { token: "owner_entity", label: "Owner Entity", source: "user_input", flag: true },
  { token: "owner_signer_name", label: "Owner Signer Name", source: "user_input", flag: true },
  { token: "owner_phone", label: "Owner Phone", source: "user_input", flag: false },
  { token: "owner_email", label: "Owner Email", source: "user_input", flag: false },
  { token: "owner_address", label: "Owner Mailing Address", source: "user_input", flag: false },
  // Agreement Terms
  { token: "term_start", label: "Agreement Start Date", source: "user_input", flag: false },
  { token: "term_end", label: "Agreement End Date", source: "user_input", flag: false },
  // Listing Price (listing_price_display is auto-computed from listing_price + price_per_acre)
  { token: "listing_price", label: "Listing Price ($)", source: "user_input", flag: true, numberField: true },
  { token: "price_per_acre", label: "Price Per Acre ($)", source: "user_input", flag: false, numberField: true },
  { token: "listing_price_display", label: "Listing Price Display", source: "auto", flag: false },
];

// ── Listing Agreement — Sale/Lease Variable Map (16 tokens: same 14 as Sale + rent + lease_term) ──

export const LISTING_SALE_LEASE_VARIABLES: VariableDef[] = [
  // Property
  { token: "property_address", label: "Property Address", source: "user_input", flag: false },
  { token: "county", label: "County", source: "user_input", flag: false, defaultValue: "Maricopa" },
  { token: "parcel_number", label: "Parcel Number (APN)", source: "user_input", flag: true },
  { token: "acreage", label: "Acreage", source: "user_input", flag: false },
  // Owner
  { token: "owner_entity", label: "Owner Entity", source: "user_input", flag: true },
  { token: "owner_signer_name", label: "Owner Signer Name", source: "user_input", flag: true },
  { token: "owner_phone", label: "Owner Phone", source: "user_input", flag: false },
  { token: "owner_email", label: "Owner Email", source: "user_input", flag: false },
  { token: "owner_address", label: "Owner Mailing Address", source: "user_input", flag: false },
  // Agreement Terms
  { token: "term_start", label: "Agreement Start Date", source: "user_input", flag: false },
  { token: "term_end", label: "Agreement End Date", source: "user_input", flag: false },
  // Listing Price (listing_price_display is auto-computed from listing_price + price_per_acre)
  { token: "listing_price", label: "Listing Price ($)", source: "user_input", flag: true, numberField: true },
  { token: "price_per_acre", label: "Price Per Acre ($)", source: "user_input", flag: false, numberField: true },
  { token: "listing_price_display", label: "Listing Price Display", source: "auto", flag: false },
  // Lease Terms
  { token: "rent", label: "Rent", source: "user_input", flag: true },
  { token: "lease_term", label: "Lease Term", source: "user_input", flag: false },
];

// ── Section grouping for review screen ──

export interface FieldSection {
  title: string;
  tokens: string[];
}

export const LOI_BUILDING_SECTIONS: FieldSection[] = [
  {
    title: "Property",
    tokens: [
      "property_address",
      "parcel_number",
    ],
  },
  {
    title: "Parties",
    tokens: [
      "buyer_entity",
      "seller_entity",
    ],
  },
  {
    title: "Price & Earnest Money",
    tokens: [
      "purchase_price",
      "earnest_money",
      "earnest_money_written",
      "emd_days",
      "emd_days_written",
    ],
  },
  {
    title: "Timeline",
    tokens: [
      "dd_period",
      "dd_period_written",
      "closing_period",
      "closing_period_written",
      "seller_disclosures_days",
      "seller_disclosures_days_written",
    ],
  },
  {
    title: "Title & PSA",
    tokens: [
      "title_company",
      "title_agent",
      "psa_draft_days",
      "psa_draft_days_written",
    ],
  },
  {
    title: "Extensions",
    tokens: [
      "extension_count",
      "extension_count_written",
      "extension_days",
      "extension_days_written",
      "extension_deposit",
    ],
  },
  {
    title: "Commission",
    tokens: [
      "commission_pct",
    ],
  },
  {
    title: "Date & Brokers",
    tokens: [
      "date",
      "seller_broker_name",
      "seller_broker_company",
      "seller_broker_email",
      "broker_names",
      "cre8_agent_email",
      "cre8_agent_phone",
    ],
  },
];

export const LOI_LAND_SECTIONS: FieldSection[] = [
  {
    title: "Property",
    tokens: [
      "property_address",
      "parcel_number",
      "acreage",
    ],
  },
  {
    title: "Parties",
    tokens: [
      "buyer_entity",
      "seller_entity",
    ],
  },
  {
    title: "Price & Earnest Money",
    tokens: [
      "purchase_price",
      "price_per_acre",
      "price_per_sqft",
      "earnest_money",
      "earnest_money_written",
      "emd_days",
      "emd_days_written",
    ],
  },
  {
    title: "Timeline",
    tokens: [
      "dd_period",
      "dd_period_written",
      "closing_period",
      "closing_period_written",
      "seller_disclosures_days",
      "seller_disclosures_days_written",
    ],
  },
  {
    title: "Title & PSA",
    tokens: [
      "title_company",
      "title_agent",
      "psa_draft_days",
      "psa_draft_days_written",
    ],
  },
  {
    title: "Extensions",
    tokens: [
      "extension_count",
      "extension_count_written",
      "extension_days",
      "extension_days_written",
      "extension_deposit",
    ],
  },
  {
    title: "Commission",
    tokens: [
      "commission_pct",
    ],
  },
  {
    title: "Date & Brokers",
    tokens: [
      "date",
      "seller_broker_name",
      "seller_broker_company",
      "seller_broker_email",
      "broker_names",
      "cre8_agent_email",
      "cre8_agent_phone",
    ],
  },
];

export const LOI_LEASE_SECTIONS: FieldSection[] = [
  {
    title: "Property",
    tokens: [
      "property_name",
      "property_address",
      "square_footage",
    ],
  },
  {
    title: "Parties",
    tokens: [
      "tenant_entity",
      "trade_name",
      "landlord",
      "landlord_contact_name",
      "guarantor",
    ],
  },
  {
    title: "Lease Terms",
    tokens: [
      "permitted_use",
      "lease_term",
      "renewal_option",
      "exclusive_use",
    ],
  },
  {
    title: "Rent",
    tokens: [
      "base_rent_psf",
      "free_rent_months",
      "rent_increase_pct",
      "rent_commencement_days",
      "rent_commencement_days_written",
      "security_deposit",
      "cam_expenses",
    ],
  },
  {
    title: "Tenant Improvements",
    tokens: [
      "ti_allowance_psf",
      "landlord_work",
    ],
  },
  {
    title: "Commission",
    tokens: [
      "commission_pct",
    ],
  },
  {
    title: "Date & Brokers",
    tokens: [
      "date",
      "broker_names",
      "cre8_agent_email",
      "cre8_agent_phone",
    ],
  },
];

export const LISTING_SALE_SECTIONS: FieldSection[] = [
  {
    title: "Property",
    tokens: [
      "property_address",
      "county",
      "parcel_number",
      "acreage",
    ],
  },
  {
    title: "Owner",
    tokens: [
      "owner_entity",
      "owner_signer_name",
      "owner_phone",
      "owner_email",
      "owner_address",
    ],
  },
  {
    title: "Agreement Terms",
    tokens: [
      "term_start",
      "term_end",
    ],
  },
  {
    title: "Listing Price",
    tokens: [
      "listing_price",
      "price_per_acre",
    ],
  },
];

export const LISTING_SALE_LEASE_SECTIONS: FieldSection[] = [
  {
    title: "Property",
    tokens: [
      "property_address",
      "county",
      "parcel_number",
      "acreage",
    ],
  },
  {
    title: "Owner",
    tokens: [
      "owner_entity",
      "owner_signer_name",
      "owner_phone",
      "owner_email",
      "owner_address",
    ],
  },
  {
    title: "Agreement Terms",
    tokens: [
      "term_start",
      "term_end",
    ],
  },
  {
    title: "Listing Price",
    tokens: [
      "listing_price",
      "price_per_acre",
    ],
  },
  {
    title: "Lease Terms",
    tokens: [
      "rent",
      "lease_term",
    ],
  },
];

// ── Listing Agreement — Lease Variable Map (15 tokens: 13 user-input + 2 auto-computed) ──

export const LISTING_LEASE_VARIABLES: VariableDef[] = [
  // Property
  { token: "property_address", label: "Property Address", source: "user_input", flag: false },
  { token: "city", label: "City", source: "user_input", flag: false, defaultValue: "Phoenix" },
  { token: "county", label: "County", source: "user_input", flag: false, defaultValue: "Maricopa" },
  { token: "zip", label: "ZIP Code", source: "user_input", flag: false },
  { token: "parcel_number", label: "Parcel Number (APN)", source: "user_input", flag: true },
  // Owner
  { token: "owner_entity", label: "Owner Entity", source: "user_input", flag: true },
  { token: "owner_signer_name", label: "Owner Signer Name", source: "user_input", flag: true },
  { token: "owner_address", label: "Owner Mailing Address", source: "user_input", flag: false },
  // Agreement Terms
  { token: "term_start", label: "Agreement Start Date", source: "user_input", flag: false },
  { token: "term_end", label: "Agreement End Date", source: "user_input", flag: false },
  // Lease Terms
  { token: "rent", label: "Asking Rent", source: "user_input", flag: true },
  // Commission (user-editable percentages + auto-computed display strings)
  { token: "commission_pct", label: "Commission Rate (%)", source: "user_input", flag: false, defaultValue: "5", numberField: true },
  { token: "commission_reduced_pct", label: "Reduced Rate (%)", source: "user_input", flag: false, defaultValue: "3", numberField: true },
  { token: "commission_pct_display", label: "Commission Display", source: "auto", flag: false },
  { token: "commission_reduced_pct_display", label: "Reduced Display", source: "auto", flag: false },
];

export const LISTING_LEASE_SECTIONS: FieldSection[] = [
  {
    title: "Property",
    tokens: [
      "property_address",
      "city",
      "county",
      "zip",
      "parcel_number",
    ],
  },
  {
    title: "Owner",
    tokens: [
      "owner_entity",
      "owner_signer_name",
      "owner_address",
    ],
  },
  {
    title: "Agreement Terms",
    tokens: [
      "term_start",
      "term_end",
    ],
  },
  {
    title: "Lease Terms",
    tokens: [
      "rent",
    ],
  },
  {
    title: "Commission",
    tokens: [
      "commission_pct",
      "commission_reduced_pct",
    ],
  },
];

export function getFieldSections(docType: string): FieldSection[] {
  switch (docType) {
    case "loi_building":
      return LOI_BUILDING_SECTIONS;
    case "loi_land":
      return LOI_LAND_SECTIONS;
    case "loi_lease":
      return LOI_LEASE_SECTIONS;
    case "listing_sale":
      return LISTING_SALE_SECTIONS;
    case "listing_sale_lease":
      return LISTING_SALE_LEASE_SECTIONS;
    case "listing_lease":
      return LISTING_LEASE_SECTIONS;
    default:
      return LOI_BUILDING_SECTIONS;
  }
}

// ── Variable map lookup by doc type ──

export function getVariableMap(docType: string): VariableDef[] {
  switch (docType) {
    case "loi_building":
      return LOI_BUILDING_VARIABLES;
    case "loi_land":
      return LOI_LAND_VARIABLES;
    case "loi_lease":
      return LOI_LEASE_VARIABLES;
    case "listing_sale":
      return LISTING_SALE_VARIABLES;
    case "listing_sale_lease":
      return LISTING_SALE_LEASE_VARIABLES;
    case "listing_lease":
      return LISTING_LEASE_VARIABLES;
    default:
      return LOI_BUILDING_VARIABLES; // fallback for now
  }
}

// ── Webflow CMS API endpoint (via Cloudflare Worker) ──

export const CMS_API_BASE = "https://cre8-api-proxy.kjsx04.workers.dev";

// ── Webflow Collection IDs ──

export const WEBFLOW_COLLECTIONS = {
  listings: "6987a8f4b3f7f93734096b4b",
  teams: "6987ab2475108817b767c3e0",
};

// ── CRE8 Team Members (hardcoded — no CMS dependency) ──

import { CmsTeamMember } from "./types";

export const CRE8_TEAM: CmsTeamMember[] = [
  { id: "rommie",  name: "Rommie Mojahed", email: "Rommie@cre8Advisors.com", phone: "602.702.4663" },
  { id: "andy",    name: "Andy Kroot",      email: "Andy@CRE8Advisors.com",   phone: "602.430.8589" },
  { id: "lindsey", name: "Lindsey Dulle",   email: "Lindsey@cre8advisors.com", phone: "602.317.7713" },
  { id: "chad",    name: "Chad Shipley",    email: "Chad@cre8advisors.com",    phone: "480.220.5954" },
  { id: "kevin",   name: "Kevin Smith",     email: "Kevin@cre8advisors.com",   phone: "518.428.8316" },
];

// ── SharePoint ──

export const SP_SITE_URL = "https://cre8advisors.sharepoint.com/sites/CRE8Operations";

// Default save location for generated documents
export const SP_DRAFTS_FOLDER = "/Drafts/";
