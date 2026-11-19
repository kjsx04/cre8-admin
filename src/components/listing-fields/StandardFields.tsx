"use client";

import { useState } from "react";
import {
  AZ_CITY_OPTIONS,
  AZ_COUNTY_NAMES,
  CALL_FOR_PRICING,
  MUNICIPALITY_OPTIONS,
  countyForCity,
  formatCityCounty,
  isCallForPricing,
  readCityCounty,
  readMunicipality,
  tidyPrice,
} from "@/lib/listings/standard-options";

/* ============================================================
   STANDARD LISTING FIELDS — dropdowns for fields that used to be
   typed by hand and ended up spelled a dozen different ways.

   Each one still saves ONE plain text value to the same Webflow
   field as before, so saving and publishing work exactly as they
   did. The only difference is that the text is now always spelled
   the same way.

   None of them changes a stored value just by being shown — an old
   listing keeps its old text until someone picks something new.
   ============================================================ */

/** The value in a dropdown that switches to "type it in yourself". */
const OTHER = "__other__";

/* ---- Shared look, copied from the listing form's own inputs ---- */
const LABEL = "block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5";
const BOX_BASE =
  "w-full bg-white border rounded-btn px-3 py-2 text-sm text-[#333] placeholder:text-[#BBB] outline-none focus:border-green transition-colors";

function boxClass(hasError: boolean): string {
  return `${BOX_BASE} ${hasError ? "border-[#CC3333]" : "border-[#E5E5E5]"}`;
}

interface FieldProps {
  label: string;
  required?: boolean;
  /** The text currently stored on the listing */
  value: string;
  /** Called with the new text to store */
  onChange: (next: string) => void;
  /** True when the form is showing a "Required" error on this field */
  hasError?: boolean;
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className={LABEL}>
      {label}
      {required && <span className="text-[#CC3333] ml-0.5">*</span>}
    </label>
  );
}

/* ============================================================
   CITY / COUNTY
   Pick a city → the county fills itself in. Saved as
   "Mesa, Maricopa County, AZ".
   ============================================================ */
export function CityCountyField({ label, required, value, onChange, hasError = false }: FieldProps) {
  // What is stored, read into a city and a county (works for old spellings too)
  const stored = readCityCounty(value);
  // True once the user chooses "Other" — shows a box to type the city
  const [typing, setTyping] = useState(false);
  // Exactly what is being typed in the "Other" box. Kept separately because the
  // stored text is cleaned up as it is read back (spaces trimmed, capitals
  // fixed) — without this you couldn't type the space in "San Luis".
  const [cityText, setCityText] = useState<string | null>(null);
  // A stored city that isn't in the list is shown in the type-it-in box
  const showTextBox = typing || (stored.city !== "" && !stored.cityIsStandard);

  return (
    <div className="mb-4">
      <FieldLabel label={label} required={required} />
      <div className="grid grid-cols-2 gap-2">
        {/* ---- City ---- */}
        <select
          aria-label="City"
          value={showTextBox ? OTHER : stored.city}
          onChange={(e) => {
            const picked = e.target.value;
            if (picked === OTHER) {
              // Switch to typing; keep the county, clear the city
              setTyping(true);
              setCityText("");
              onChange(formatCityCounty("", stored.county));
              return;
            }
            setTyping(false);
            setCityText(null);
            // The county follows the city (Mesa → Maricopa). No city → keep the county.
            onChange(formatCityCounty(picked, picked ? countyForCity(picked) : stored.county));
          }}
          className={boxClass(hasError)}
        >
          <option value="">City...</option>
          {AZ_CITY_OPTIONS.map((option) => (
            <option key={option.city} value={option.city}>
              {option.city}
            </option>
          ))}
          <option value={OTHER}>Other (type it in)</option>
        </select>

        {/* ---- County ---- */}
        <select
          aria-label="County"
          value={stored.county}
          onChange={(e) => onChange(formatCityCounty(stored.city, e.target.value))}
          className={boxClass(hasError)}
        >
          <option value="">County...</option>
          {AZ_COUNTY_NAMES.map((name) => (
            <option key={name} value={name}>
              {name} County
            </option>
          ))}
        </select>
      </div>

      {/* ---- A city that isn't in the list ---- */}
      {showTextBox && (
        <input
          type="text"
          aria-label="City name"
          value={cityText ?? stored.city}
          onChange={(e) => {
            // Commas and slashes separate city from county in the saved text, so they can't be part of a city name
            const typed = e.target.value.replace(/[,/]/g, "");
            setCityText(typed);
            onChange(formatCityCounty(typed, stored.county));
          }}
          placeholder="City or town name"
          className={`${boxClass(hasError)} mt-2`}
        />
      )}

      {hasError && <p className="text-[10px] text-[#CC3333] mt-1">Required</p>}
    </div>
  );
}

/* ============================================================
   ZONING MUNICIPALITY
   The city or county that sets the zoning. Saved as "Mesa" or
   "Pinal County".
   ============================================================ */
export function MunicipalityField({ label, required, value, onChange, hasError = false }: FieldProps) {
  const stored = readMunicipality(value);
  const [typing, setTyping] = useState(false);
  const showTextBox = typing || !stored.isStandard;

  return (
    <div className="mb-4">
      <FieldLabel label={label} required={required} />
      <select
        aria-label={label}
        value={showTextBox ? OTHER : stored.value}
        onChange={(e) => {
          const picked = e.target.value;
          if (picked === OTHER) {
            setTyping(true);
            onChange("");
            return;
          }
          setTyping(false);
          onChange(picked);
        }}
        className={boxClass(hasError)}
      >
        <option value="">Select...</option>
        {MUNICIPALITY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER}>Other (type it in)</option>
      </select>

      {showTextBox && (
        <input
          type="text"
          aria-label={`${label} name`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="City, town or county"
          className={`${boxClass(hasError)} mt-2`}
        />
      )}

      {hasError && <p className="text-[10px] text-[#CC3333] mt-1">Required</p>}
    </div>
  );
}

/* ============================================================
   LIST PRICE
   Choose "Call for Pricing" (always spelled the same) or type a
   price. A typed number is tidied to "$2,200,000" when you leave
   the box; rents like "$18.50/SF NNN" are left as typed.
   ============================================================ */
export function PriceField({ label, required, value, onChange, hasError = false }: FieldProps) {
  const callForPricing = isCallForPricing(value);

  return (
    <div className="mb-4">
      <FieldLabel label={label} required={required} />
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Price type"
          value={callForPricing ? "call" : "price"}
          onChange={(e) => onChange(e.target.value === "call" ? CALL_FOR_PRICING : "")}
          className={boxClass(hasError)}
        >
          <option value="call">{CALL_FOR_PRICING}</option>
          <option value="price">Enter a price</option>
        </select>
        <input
          type="text"
          aria-label="Price"
          // Call for Pricing: the box is empty and locked; the dropdown says it all
          value={callForPricing ? "" : value}
          disabled={callForPricing}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const tidy = tidyPrice(e.target.value);
            if (tidy !== e.target.value) onChange(tidy);
          }}
          placeholder={callForPricing ? "" : "e.g. $2,500,000"}
          className={`${boxClass(hasError)} disabled:bg-[#F5F5F5]`}
        />
      </div>
      {hasError && <p className="text-[10px] text-[#CC3333] mt-1">Required</p>}
    </div>
  );
}
