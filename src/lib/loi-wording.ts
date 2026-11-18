// Derived LOI sentences. The templates hold tokens; this fills the ones whose
// wording depends on a blank field, a count, or who drafts the PSA.
// Listing agreements do not call this.

import { numberToWritten } from "./number-to-words";

export type PsaDrafter = "Seller" | "Buyer";

/** Seller drafts unless the form explicitly says Buyer. */
export function normalizePsaDrafter(value: string | undefined): PsaDrafter {
  return (value || "").trim().toLowerCase() === "buyer" ? "Buyer" : "Seller";
}

function filled(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * Default is the building LOI's sentence: Seller prepares the Purchase
 * Agreement and delivers it to Buyer for review. Choosing Buyer flips both
 * roles, so Buyer prepares it and delivers it to Seller. The land template's
 * old "deliver the same to Seller" while Seller was drafting was a typo.
 */
export function psaDraftClause(variables: Record<string, string>): string {
  const drafter = normalizePsaDrafter(variables.psa_drafted_by);
  const reviewer: PsaDrafter = drafter === "Seller" ? "Buyer" : "Seller";
  const days = filled(variables.psa_draft_days);
  const daysWords = days ? numberToWritten(days) : "";
  const within = days
    ? ` within ${daysWords} (${days}) business days`
    : "";
  return `${drafter} will commence preparation of the Purchase Agreement and deliver the same to ${reviewer} for review${within}.`;
}

/** "one (1) thirty (30)-day extension" or "two (2) thirty (30)-day extensions". */
export function extensionClause(variables: Record<string, string>): string {
  const countRaw = filled(variables.extension_count) || "1";
  const count = parseInt(countRaw, 10);
  const countNum = Number.isFinite(count) && count > 0 ? count : 1;
  const days = filled(variables.extension_days);
  const daysWords = days ? numberToWritten(days) : "";
  const noun = countNum === 1 ? "extension" : "extensions";
  const dayPart = days ? `${daysWords} (${days})-day ` : "";
  const deposit = filled(variables.extension_deposit);
  const depositBit = deposit
    ? ` for an additional ${deposit} earnest money deposit${countNum === 1 ? "" : " per extension"}`
    : "";
  return `Buyer shall have ${numberToWritten(String(countNum))} (${countNum}) ${dayPart}${noun}${depositBit}.`;
}

/**
 * Per-acre (or per-SF) parenthetical for the land purchase price.
 * Typing the total used to clear this. Show the calculated per-acre figure
 * unless the broker is explicitly pricing per square foot.
 */
export function landPricePerUnit(args: {
  mode: "per_acre" | "per_sqft" | null;
  pricePerAcre: string;
  pricePerSqft: string;
}): string {
  const perAcre = filled(args.pricePerAcre);
  const perSqft = filled(args.pricePerSqft);
  if (args.mode === "per_sqft" && perSqft) return `(${perSqft} PSF)`;
  if (perAcre) return `(${perAcre} per acre)`;
  if (perSqft) return `(${perSqft} PSF)`;
  return "";
}

function block(label: string, value: string | undefined): string {
  const text = filled(value);
  return text ? `${label}: ${text}` : "";
}

/**
 * Tokens the LOI templates expect in addition to the form fields.
 * Blank optional values become empty strings so the generator can drop the paragraph.
 */
export function applyLoiDerived(
  variables: Record<string, string>
): Record<string, string> {
  const v = { ...variables };
  const email = filled(v.seller_broker_email);
  const broker = filled(v.broker_names);
  const contact = filled(v.landlord_contact_name);
  const use = filled(v.permitted_use);
  const renewal = filled(v.renewal_option);
  const guarantor = filled(v.guarantor);
  const trade = filled(v.trade_name);
  const term = filled(v.lease_term);
  const exclusive = filled(v.exclusive_use);
  const landlordWork = filled(v.landlord_work);
  const ti = filled(v.ti_allowance_psf);
  const freeRent = filled(v.free_rent_months);
  const cam = filled(v.cam_expenses);

  // The letter prints "{{count_written}} ({{count}})". Fill the words when a
  // caller only sent the number, which is what the form does on each keystroke.
  for (const key of [
    "extension_count",
    "extension_days",
    "psa_draft_days",
    "emd_days",
    "closing_period",
    "seller_disclosures_days",
    "dd_period",
    "rent_commencement_days",
    "alta_days",
    "offer_expiration_days",
  ]) {
    if (!filled(v[`${key}_written`]) && filled(v[key])) {
      v[`${key}_written`] = numberToWritten(filled(v[key]));
    }
  }

  const drafter = normalizePsaDrafter(v.psa_drafted_by);
  v.psa_drafted_by = drafter;
  v.psa_drafter = drafter;
  v.psa_reviewer = drafter === "Seller" ? "Buyer" : "Seller";
  v.psa_draft_clause = psaDraftClause(v);
  v.extension_clause = extensionClause(v);
  const extensionCount = parseInt(filled(v.extension_count) || "1", 10);
  v.extension_noun =
    Number.isFinite(extensionCount) && extensionCount > 1 ? "extensions" : "extension";
  // Intro still names someone when the buyer field is blank ("the Buyer and/or assignee").
  v.buyer_party = filled(v.buyer_entity) || "the Buyer";
  if (!filled(v.alta_days)) v.alta_days = "30";
  if (!filled(v.alta_days_written)) v.alta_days_written = numberToWritten(v.alta_days);
  if (!filled(v.offer_expiration_days)) v.offer_expiration_days = "10";
  if (!filled(v.offer_expiration_days_written)) {
    v.offer_expiration_days_written = numberToWritten(v.offer_expiration_days);
  }
  const zoning = filled(v.zoning);
  v.zoning_clause = zoning ? ` (zoned ${zoning})` : "";
  v.seller_broker_email_line = email ? `Email: ${email}` : "";
  v.broker_names_suffix = broker ? ` (${broker})` : "";
  v.landlord_contact_line = contact ? `${contact}:` : "";
  v.permitted_use_clause = use
    ? `, primarily for the continuous operation of ${use} and for no other purpose`
    : "";
  v.trade_name_block = block("TENANT'S TRADE NAME", trade);
  v.lease_term_block = block("LEASE TERM", term);
  v.exclusive_block = block("EXCLUSIVE", exclusive);
  v.landlord_work_block = block("LANDLORD'S WORK", landlordWork);
  v.renewal_block = renewal
    ? `RENEWAL OPTION: Provided Tenant is conducting business at the Premises, and is not in breach or default of the Lease, Tenant shall have the option to extend the Lease Term for ${renewal}.`
    : "";
  v.guarantor_block = guarantor
    ? `GUARANTOR(S): Corporate Guarantee by ${guarantor} will guarantee the primary term and any option term of the lease.`
    : "";
  v.ti_block = ti
    ? `TENANT IMPROVEMENT ALLOWANCE: The Landlord shall provide Tenant an improvement allowance in the amount of ${ti} per square foot, which shall be paid to Tenant within thirty (30) days after Tenant's opening for business to the public, and delivery to Landlord of: (1) an invoice; (2) unconditional lien waivers; (3) certificates of occupancy; (4) permits; (5) evidence of the cost of Tenant's work; and (6) an estoppel certificate.`
    : "";
  v.free_rent_line = freeRent
    ? `${freeRent} of the initial term shall be abated. NNN's only.`
    : "";
  v.cam_equal_to = cam ? ` equal to ${cam}` : "";
  return v;
}
