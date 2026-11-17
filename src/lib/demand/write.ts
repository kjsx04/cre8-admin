import { asBoolean, asNumber, asString, asStringList } from "./coerce";
import type { TenantWrite } from "./service";
import type { ContactType, Relation } from "./types";

/** Turns the tenant editor payload into the shape the service saves. */
export function tenantWrite(body: Record<string, unknown>): TenantWrite {
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  const relationships = Array.isArray(body.relationships) ? body.relationships : [];
  return {
    brandName: asString(body.brandName) || "",
    category: asString(body.category) || "",
    subcategory: asString(body.subcategory),
    formats: asStringList(body.formats),
    sfMin: asNumber(body.sfMin),
    sfMax: asNumber(body.sfMax),
    acresMin: asNumber(body.acresMin),
    acresMax: asNumber(body.acresMax),
    tierIds: asStringList(body.tierIds),
    driveThruRequired: asBoolean(body.driveThruRequired),
    azMarkets: asStringList(body.azMarkets),
    spacingMiles: asNumber(body.spacingMiles),
    requirementSource: asString(body.requirementSource),
    requirementDate: asString(body.requirementDate),
    notes: asString(body.notes),
    active: body.active !== false,
    contacts: contacts.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        contactType: (asString(row.contactType) === "broker" ? "broker" : "in_house") as ContactType,
        firmName: asString(row.firmName),
        name: asString(row.name) || "",
        title: asString(row.title),
        email: asString(row.email),
        phone: asString(row.phone),
        isPrimary: row.isPrimary === true,
        confidence: asString(row.confidence),
      };
    }),
    relationships: relationships.map((item) => {
      const row = item as Record<string, unknown>;
      const relation = asString(row.relation);
      return {
        relatedTenantId: asString(row.relatedTenantId) || "",
        relation: (relation === "similar" || relation === "co_tenant" ? relation : "competitor") as Relation,
      };
    }),
  };
}
