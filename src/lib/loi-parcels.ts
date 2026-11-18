// Combine the parcels chosen on the map into the LOI fields.
// Listing agreements do not call this.

export interface ParcelLike {
  id: string;
  address?: string;
  owner?: string;
  acreage?: string;
  zoning?: string;
}

export interface ParcelSummary {
  parcel_number: string;
  property_address: string;
  seller_entity: string;
  acreage: string;
  zoning: string;
  ownersDiffer: boolean;
  addressesDiffer: boolean;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Sum acres, list every APN, and keep every distinct owner, address, and zoning. */
export function summarizeParcels(parcels: ParcelLike[]): ParcelSummary {
  const seen = new Set<string>();
  const distinct = parcels.filter((parcel) => {
    const id = (parcel.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const ids = unique(distinct.map((parcel) => parcel.id || ""));
  const owners = unique(distinct.map((parcel) => parcel.owner || ""));
  const addresses = unique(distinct.map((parcel) => parcel.address || ""));
  const zonings = unique(distinct.map((parcel) => parcel.zoning || ""));

  let acres = 0;
  let anyAcre = false;
  for (const parcel of distinct) {
    const n = parseFloat(String(parcel.acreage || "").replace(/,/g, ""));
    if (Number.isFinite(n)) {
      acres += n;
      anyAcre = true;
    }
  }
  const acreage = anyAcre ? (Math.round(acres * 100) / 100).toFixed(2) : "";

  return {
    parcel_number: ids.join(", "),
    property_address: addresses.join("; "),
    seller_entity: owners.join("; "),
    acreage,
    zoning: zonings.join(", "),
    ownersDiffer: owners.length > 1,
    addressesDiffer: addresses.length > 1,
  };
}
