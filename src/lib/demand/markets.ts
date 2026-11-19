/**
 * Standard city / county for Demand matching.
 *
 * Two messy inputs meet here:
 *
 *  1. The LISTING's "City / County" field, typed by hand in the listing editor.
 *     Real values include "Queen Creek / Maricopa", "Mesa, Maricopa County, AZ",
 *     "Pinal County" (no city at all) and "" (blank).
 *
 *  2. Each TENANT's markets list — where the tenant wants NEW stores. This is
 *     not the tenant's current store locations (those are only used for
 *     spacing). Real values include "Phoenix metro", "Arizona", "East Valley
 *     (Gilbert, Mesa)", "North Scottsdale", "PV", "Various".
 *
 * Both are turned into the same standard city and county names, so a listing
 * in "Queen Creek" matches a tenant who wants "Southeast Valley", and a tenant
 * who wants "Arizona" is never thrown out for not naming the listing's city.
 *
 * Nothing here writes to the database. The listing field itself is left as
 * typed, because it is also the public site's field.
 */

import { haversineMiles } from "./geo";

/** Arizona counties, lower case. */
const COUNTIES = [
  "maricopa", "pinal", "gila", "pima", "yavapai", "coconino", "yuma", "mohave",
  "cochise", "santa cruz", "graham", "greenlee", "la paz", "navajo", "apache",
] as const;
const COUNTY_SET = new Set<string>(COUNTIES);

/**
 * Every city Demand knows: its county and an approximate centre point.
 * The centre is only used to guess a city for a listing that has a map pin
 * but no city typed in.
 * To add a city: add one line here.
 */
const CITY_TABLE: Record<string, { county: string; lat: number; lng: number }> = {
  // Maricopa County
  "phoenix": { county: "maricopa", lat: 33.4484, lng: -112.074 },
  "scottsdale": { county: "maricopa", lat: 33.4942, lng: -111.9261 },
  "mesa": { county: "maricopa", lat: 33.4152, lng: -111.8315 },
  "tempe": { county: "maricopa", lat: 33.4255, lng: -111.94 },
  "chandler": { county: "maricopa", lat: 33.3062, lng: -111.8413 },
  "gilbert": { county: "maricopa", lat: 33.3528, lng: -111.789 },
  "glendale": { county: "maricopa", lat: 33.5387, lng: -112.186 },
  "peoria": { county: "maricopa", lat: 33.5806, lng: -112.2374 },
  "surprise": { county: "maricopa", lat: 33.6292, lng: -112.3679 },
  "goodyear": { county: "maricopa", lat: 33.4353, lng: -112.3577 },
  "avondale": { county: "maricopa", lat: 33.4356, lng: -112.3496 },
  "buckeye": { county: "maricopa", lat: 33.3703, lng: -112.5838 },
  "queen creek": { county: "maricopa", lat: 33.2487, lng: -111.6343 },
  "fountain hills": { county: "maricopa", lat: 33.6117, lng: -111.7174 },
  "paradise valley": { county: "maricopa", lat: 33.5312, lng: -111.9426 },
  "cave creek": { county: "maricopa", lat: 33.8333, lng: -111.9507 },
  "carefree": { county: "maricopa", lat: 33.8222, lng: -111.9182 },
  "el mirage": { county: "maricopa", lat: 33.6131, lng: -112.3246 },
  "tolleson": { county: "maricopa", lat: 33.45, lng: -112.2593 },
  "litchfield park": { county: "maricopa", lat: 33.4934, lng: -112.3579 },
  "sun city": { county: "maricopa", lat: 33.5975, lng: -112.2718 },
  "sun city west": { county: "maricopa", lat: 33.662, lng: -112.3413 },
  "youngtown": { county: "maricopa", lat: 33.5939, lng: -112.3029 },
  "anthem": { county: "maricopa", lat: 33.8673, lng: -112.1468 },
  "tonopah": { county: "maricopa", lat: 33.4937, lng: -112.9374 },
  "wickenburg": { county: "maricopa", lat: 33.9686, lng: -112.7296 },
  // Pinal County
  "san tan valley": { county: "pinal", lat: 33.1911, lng: -111.528 },
  "apache junction": { county: "pinal", lat: 33.415, lng: -111.5496 },
  "gold canyon": { county: "pinal", lat: 33.3714, lng: -111.4368 },
  "maricopa": { county: "pinal", lat: 33.0581, lng: -112.0476 },
  "casa grande": { county: "pinal", lat: 32.8795, lng: -111.7574 },
  "coolidge": { county: "pinal", lat: 32.9778, lng: -111.5176 },
  "florence": { county: "pinal", lat: 33.0314, lng: -111.3873 },
  "eloy": { county: "pinal", lat: 32.7559, lng: -111.5548 },
  "arizona city": { county: "pinal", lat: 32.7559, lng: -111.671 },
  "superior": { county: "pinal", lat: 33.2939, lng: -111.0962 },
  // Rest of Arizona
  "tucson": { county: "pima", lat: 32.2226, lng: -110.9747 },
  "marana": { county: "pima", lat: 32.4367, lng: -111.2254 },
  "oro valley": { county: "pima", lat: 32.3909, lng: -110.9665 },
  "sahuarita": { county: "pima", lat: 31.9576, lng: -110.9557 },
  "globe": { county: "gila", lat: 33.3942, lng: -110.7865 },
  "payson": { county: "gila", lat: 34.2309, lng: -111.3251 },
  "camp verde": { county: "yavapai", lat: 34.5636, lng: -111.8543 },
  "prescott": { county: "yavapai", lat: 34.54, lng: -112.4685 },
  "prescott valley": { county: "yavapai", lat: 34.61, lng: -112.3157 },
  "cottonwood": { county: "yavapai", lat: 34.7392, lng: -112.0099 },
  "sedona": { county: "yavapai", lat: 34.8697, lng: -111.761 },
  "flagstaff": { county: "coconino", lat: 35.1983, lng: -111.6513 },
  "yuma": { county: "yuma", lat: 32.6927, lng: -114.6277 },
  "kingman": { county: "mohave", lat: 35.1894, lng: -114.053 },
  "lake havasu city": { county: "mohave", lat: 34.4839, lng: -114.3225 },
  "bullhead city": { county: "mohave", lat: 35.1359, lng: -114.5286 },
  "show low": { county: "navajo", lat: 34.2542, lng: -110.0298 },
  "sierra vista": { county: "cochise", lat: 31.5455, lng: -110.2773 },
  "nogales": { county: "santa cruz", lat: 31.3404, lng: -110.9343 },
};

/** Names that are both a city and a county. In a listing, context decides. */
const CITY_AND_COUNTY = new Set(["maricopa", "yuma"]);

/** Everything a tenant means by "Phoenix metro" / "the Valley". */
const METRO_CITIES = [
  "phoenix", "scottsdale", "mesa", "tempe", "chandler", "gilbert", "glendale", "peoria",
  "surprise", "goodyear", "avondale", "buckeye", "queen creek", "san tan valley",
  "apache junction", "gold canyon", "fountain hills", "paradise valley", "cave creek",
  "carefree", "el mirage", "tolleson", "litchfield park", "sun city", "sun city west",
  "youngtown", "anthem", "maricopa",
];

/**
 * Words a tenant's market can contain, and the standard cities each one means.
 * Longer phrases are checked first, so "Phoenix metro" is read as the metro
 * and never as just the city of Phoenix.
 * To teach Demand a new phrase: add one line here.
 */
const AREA_PHRASES: Record<string, string[]> = {
  // The whole metro
  "phoenix metro": METRO_CITIES,
  "metro phoenix": METRO_CITIES,
  "phoenix msa": METRO_CITIES,
  "phoenix valley": METRO_CITIES,
  "greater phoenix": METRO_CITIES,
  "valley wide": METRO_CITIES,
  "valleywide": METRO_CITIES,
  "the valley": METRO_CITIES,
  // Parts of the Valley
  "southeast valley": ["gilbert", "chandler", "mesa", "queen creek", "san tan valley"],
  "se valley": ["gilbert", "chandler", "mesa", "queen creek", "san tan valley"],
  "east valley": ["mesa", "gilbert", "chandler", "tempe", "queen creek", "san tan valley", "apache junction", "gold canyon"],
  "northwest valley": ["peoria", "surprise", "glendale", "el mirage", "sun city", "sun city west", "youngtown"],
  "nw valley": ["peoria", "surprise", "glendale", "el mirage", "sun city", "sun city west", "youngtown"],
  "southwest valley": ["goodyear", "avondale", "buckeye", "tolleson", "litchfield park"],
  "sw valley": ["goodyear", "avondale", "buckeye", "tolleson", "litchfield park"],
  "west valley": ["glendale", "peoria", "surprise", "goodyear", "avondale", "buckeye", "tolleson", "litchfield park", "el mirage", "sun city", "sun city west", "youngtown"],
  "northeast valley": ["scottsdale", "fountain hills", "paradise valley", "cave creek", "carefree"],
  "north valley": ["phoenix", "anthem", "cave creek", "carefree", "peoria"],
  // Neighbourhoods that are inside a city
  "ahwatukee": ["phoenix"],
  "arcadia": ["phoenix"],
  "maryvale": ["phoenix"],
  "laveen": ["phoenix"],
  "deer valley": ["phoenix"],
  "norterra": ["phoenix"],
  "desert ridge": ["phoenix"],
  "biltmore": ["phoenix"],
  "arrowhead": ["glendale", "peoria"],
  "lake havasu": ["lake havasu city"],
  "pv": ["paradise valley"],
};

/** Markets that mean "anywhere in Arizona". */
const STATEWIDE_PHRASES = ["arizona", "statewide", "state wide", "nationwide", "national", "all markets"];

/** Other states. Recognised so they are not mistaken for a city, and never match an Arizona listing. */
const OTHER_STATES = ["texas", "nevada", "new mexico", "california", "utah", "colorado", "oklahoma", "florida"];

/** Filler that says nothing about where. Ignored. */
const NOISE = new Set(["az", "various", "surrounding", "tbd", "n a", "na", "unknown", "area", "sites", "site", "incl", "program", "and", "the", "of", "interstates"]);

/** Lower case, punctuation to spaces, single spaces. */
function clean(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "queen creek" → "Queen Creek" */
function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Removes a whole phrase from the text, if present. Returns null when absent. */
function takePhrase(text: string, phrase: string): string | null {
  const pattern = new RegExp(`(^| )${phrase.replace(/ /g, " +")}( |$)`);
  if (!pattern.test(text)) return null;
  return text.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

const CITY_NAMES_LONGEST_FIRST = Object.keys(CITY_TABLE).sort((a, b) => b.length - a.length);
const AREA_NAMES_LONGEST_FIRST = Object.keys(AREA_PHRASES).sort((a, b) => b.length - a.length);

// ============================================================
// LISTING SIDE
// ============================================================

export interface StandardPlace {
  /** Standard city name ("Queen Creek"), or null when it can't be worked out. */
  city: string | null;
  /** Standard county name without the word County ("Pinal"), or null. */
  county: string | null;
  /** True when the city was guessed from the listing's map pin, not typed. */
  cityGuessed: boolean;
}

/**
 * Turns a listing's hand-typed City / County into one standard city and county.
 *
 * Order of trust:
 *   1. What was typed in City / County.
 *   2. A city sitting on its own between commas in the address.
 *   3. The nearest known city to the map pin (within 12 miles, same county if
 *      a county is known). Marked as a guess.
 * The county comes from the text, otherwise from the city.
 */
export function standardPlace(
  cityCounty: string | null | undefined,
  fullAddress?: string | null,
  lat?: number | null,
  lng?: number | null
): StandardPlace {
  let city: string | null = null;
  let county: string | null = null;

  // "Queen Creek / Maricopa", "Mesa, Maricopa County, AZ", "Pinal County"
  const parts = String(cityCounty || "")
    .split(/[,/]/)
    .map((part) => clean(part).replace(/\b(az|arizona)\b/g, "").replace(/\b\d{5}\b/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Pass 1 — anything that says "County" is the county.
  const rest: string[] = [];
  for (const part of parts) {
    if (/ county$/.test(part)) {
      const name = part.replace(/ county$/, "").trim();
      if (!county && name) county = name;
    } else {
      rest.push(part);
    }
  }
  // Pass 2 — a bare county name ("Pinal") is the county; everything else is the city.
  // "Maricopa" and "Yuma" are both a city and a county, so context decides.
  for (const part of rest) {
    const isCounty = COUNTY_SET.has(part);
    const isCity = part in CITY_TABLE;
    if (isCounty && !isCity) {
      if (!county) county = part;
      continue;
    }
    if (isCounty && isCity) {
      if (city) {
        // "Queen Creek / Maricopa" — after a city, it is the county.
        if (!county) county = part;
      } else if (county) {
        // "Maricopa, Pinal County" — the county is already known, so it is the city.
        city = part;
      } else if (part === "maricopa" || rest.length > 1) {
        // "Maricopa" on its own is read as the county, the way "Pinal" is.
        county = part;
      } else {
        // "Yuma" on its own is the city (its county is Yuma as well).
        city = part;
      }
      continue;
    }
    if (!city) city = part;
  }

  // No city typed — look for one standing alone between commas in the address.
  if (!city && fullAddress) {
    for (const piece of String(fullAddress).split(",")) {
      const name = clean(piece).replace(/\b(az|arizona)\b/g, "").replace(/\b\d{5}\b/g, "").replace(/\s+/g, " ").trim();
      if (name in CITY_TABLE && !(CITY_AND_COUNTY.has(name) && county === name)) {
        city = name;
        break;
      }
    }
  }

  // Still no city — nearest known city to the map pin.
  let cityGuessed = false;
  if (!city && lat != null && lng != null) {
    let best: string | null = null;
    let bestMiles = 12;
    for (const [name, info] of Object.entries(CITY_TABLE)) {
      if (county && info.county !== county) continue;
      const miles = haversineMiles(lat, lng, info.lat, info.lng);
      if (miles < bestMiles) {
        best = name;
        bestMiles = miles;
      }
    }
    if (best) {
      city = best;
      cityGuessed = true;
    }
  }

  if (!county && city && CITY_TABLE[city]) county = CITY_TABLE[city].county;

  return {
    city: city ? titleCase(city) : null,
    county: county ? titleCase(county) : null,
    cityGuessed,
  };
}

// ============================================================
// TENANT SIDE
// ============================================================

export interface ResolvedMarkets {
  /** Wants anywhere in Arizona. */
  statewide: boolean;
  /** Standard city names, lower case. */
  cities: Set<string>;
  /** Standard county names, lower case. */
  counties: Set<string>;
  /** True when at least one entry was understood (including an out-of-state one). */
  recognized: boolean;
}

/** Reads a tenant's free-text markets into standard cities and counties. */
export function resolveMarkets(markets: string[] | null | undefined): ResolvedMarkets {
  const out: ResolvedMarkets = { statewide: false, cities: new Set(), counties: new Set(), recognized: false };

  for (const raw of markets || []) {
    let text = clean(String(raw || ""));
    if (!text) continue;

    // "AZ" or "Valley" as the whole entry.
    if (text === "az") {
      out.statewide = true;
      out.recognized = true;
      continue;
    }
    if (text === "valley") {
      for (const city of METRO_CITIES) out.cities.add(city);
      out.recognized = true;
      continue;
    }

    // Counties first: "Pinal County", "Maricopa County".
    for (const name of COUNTIES) {
      const after = takePhrase(text, `${name} county`);
      if (after != null) {
        out.counties.add(name);
        out.recognized = true;
        text = after;
      }
    }

    // Areas ("Phoenix metro", "East Valley", "Ahwatukee") before plain cities.
    for (const phrase of AREA_NAMES_LONGEST_FIRST) {
      const after = takePhrase(text, phrase);
      if (after != null) {
        for (const city of AREA_PHRASES[phrase]) out.cities.add(city);
        out.recognized = true;
        text = after;
      }
    }

    // Plain cities, longest name first so "Sun City West" is not read as "Sun City".
    // This also catches "North Scottsdale", "East Mesa", "Collective on Ocotillo area (Chandler)".
    for (const name of CITY_NAMES_LONGEST_FIRST) {
      const after = takePhrase(text, name);
      if (after != null) {
        out.cities.add(name);
        out.recognized = true;
        text = after;
      }
    }

    // Anywhere in Arizona.
    for (const phrase of STATEWIDE_PHRASES) {
      const after = takePhrase(text, phrase);
      if (after != null) {
        out.statewide = true;
        out.recognized = true;
        text = after;
      }
    }

    // Another state: understood, matches nothing here.
    for (const state of OTHER_STATES) {
      const after = takePhrase(text, state);
      if (after != null) {
        out.recognized = true;
        text = after;
      }
    }

    // A bare county name with nothing else ("Pinal").
    if (COUNTY_SET.has(text)) {
      out.counties.add(text);
      out.recognized = true;
      continue;
    }

    // What's left: drop filler and compass words ("north", "central", "2").
    const leftover = text
      .split(" ")
      .filter((word) => word && !NOISE.has(word) && !/^\d+$/.test(word) && !/^(north|south|east|west|northeast|northwest|southeast|southwest|central|downtown|metro|valley|ne|nw|se|sw)$/.test(word))
      .join(" ");

    // A short name we don't know and that wasn't partly understood is taken as a city
    // as typed, so a town missing from the table above still works.
    const understoodSomething = text !== clean(String(raw || ""));
    if (leftover && !understoodSomething && leftover.split(" ").length <= 3) {
      out.cities.add(leftover);
      out.recognized = true;
    }
  }

  return out;
}

export type MarketCheck =
  /** The tenant has no usable markets on file — nothing to check. */
  | "none"
  /** The listing is in one of the tenant's markets. */
  | "match"
  /** The listing is definitely outside the tenant's markets. */
  | "miss"
  /** Can't tell — the listing has no city, and the tenant's markets are cities. */
  | "unknown";

/** Is this listing inside the tenant's markets? */
export function checkMarket(markets: string[] | null | undefined, place: { city: string | null; county: string | null }): MarketCheck {
  const wanted = resolveMarkets(markets);
  if (!wanted.recognized) return "none";
  if (wanted.statewide) return "match";

  const city = place.city ? clean(place.city) : "";
  const county = place.county ? clean(place.county).replace(/ county$/, "") : "";

  if (city && wanted.cities.has(city)) return "match";
  if (county && wanted.counties.has(county)) return "match";
  if (city) return "miss";
  if (!county) return "unknown";

  // County only. If none of the tenant's cities are in that county, it's a miss;
  // otherwise we can't tell which side of the line the listing is on.
  for (const name of Array.from(wanted.cities)) {
    const info = CITY_TABLE[name];
    if (!info || info.county === county) return "unknown";
  }
  return "miss";
}

// ============================================================
// LISTS FOR DROPDOWNS (used by the listing form)
// ============================================================

/** Every Arizona county, as shown to people: "Maricopa", "Pinal", … (A–Z). */
export const AZ_COUNTY_NAMES: string[] = COUNTIES.map((name) => titleCase(name)).sort();

/** Every city Demand knows, with its county, as shown to people (A–Z). */
export const AZ_CITY_OPTIONS: { city: string; county: string }[] = Object.entries(CITY_TABLE)
  .map(([name, info]) => ({ city: titleCase(name), county: titleCase(info.county) }))
  .sort((a, b) => a.city.localeCompare(b.city));
