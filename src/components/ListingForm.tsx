"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ListingItem,
  ListingFieldData,
  LISTING_TYPES,
  PROPERTY_TYPES,
  BROKERS,
  MAPBOX_TOKEN,
  slugify,
} from "@/lib/admin-constants";
import RichTextEditor from "@/components/RichTextEditor";
import SpacesTable from "@/components/SpacesTable";
import PackageUploader, { PackageAssets, GalleryImage } from "@/components/PackageUploader";
import FileUploadZone from "@/components/FileUploadZone";
import PhotoUploader from "@/components/PhotoUploader";
import PublishModal from "@/components/PublishModal";

// Dynamic import — Mapbox uses window/document, can't render server-side
const ListingMapPicker = dynamic(
  () => import("@/components/ListingMapPicker"),
  { ssr: false, loading: () => <div className="w-full h-[300px] rounded-btn border border-[#E5E5E5] bg-[#F5F5F5] animate-pulse" /> }
);

/* ============================================================
   TYPES
   ============================================================ */
interface ListingFormProps {
  /** Existing listing to edit — null for new listing mode */
  item: ListingItem | null;
  /** All listings — used for duplicate detection */
  allItems: ListingItem[];
}

/* ============================================================
   FIELD LAYOUT — defines sections and their fields
   ============================================================ */
interface FieldDef {
  key: keyof ListingFieldData | "listing-type-2" | "property-type";
  label: string;
  type: "text" | "number" | "select" | "brokers" | "toggle";
  required?: boolean;
  placeholder?: string;
  /** For select fields: array of { value, label } */
  options?: { value: string; label: string }[];
  /** For toggle fields: mutually exclusive with this other toggle key */
  exclusive?: string;
  /** Half-width field (two per row) */
  half?: boolean;
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

// Build dropdown options from constant maps
const listingTypeOptions = Object.entries(LISTING_TYPES).map(([id, name]) => ({
  value: id,
  label: name,
}));

const propertyTypeOptions = Object.entries(PROPERTY_TYPES).map(
  ([id, name]) => ({ value: id, label: name })
);

// Broker entries for checkboxes
const brokerEntries = Object.entries(BROKERS).map(([id, name]) => ({
  id,
  name,
}));

const SECTIONS: SectionDef[] = [
  {
    title: "Property Info",
    fields: [
      {
        key: "name",
        label: "Name",
        type: "text",
        required: true,
        placeholder: "e.g. 1234 W Main St",
      },
      {
        key: "slug",
        label: "Slug",
        type: "text",
        required: true,
        placeholder: "auto-generated-from-name",
      },
      {
        key: "full-address",
        label: "Full Address",
        type: "text",
        required: true,
        placeholder: "1234 W Main St, Phoenix, AZ 85001",
      },
      {
        key: "cross-streets",
        label: "Cross Streets",
        type: "text",
        placeholder: "e.g. Main St & 1st Ave",
        half: true,
      },
      {
        key: "city-county",
        label: "City / County",
        type: "text",
        required: true,
        placeholder: "Phoenix, Maricopa",
        half: true,
      },
      {
        key: "square-feet",
        label: "Acres",
        type: "number",
        placeholder: "e.g. 2.5",
        half: true,
      },
      {
        key: "building-sqft",
        label: "Building Sq Ft",
        type: "number",
        placeholder: "e.g. 15000",
        half: true,
      },
      {
        key: "traffic-count",
        label: "Traffic Count",
        type: "text",
        placeholder: "e.g. 35,000 VPD",
        half: true,
      },
      {
        key: "list-price",
        label: "List Price",
        type: "text",
        placeholder: "e.g. $2,500,000 or Call for Pricing",
        half: true,
      },
    ],
  },
  {
    title: "Classification",
    fields: [
      {
        key: "listing-type-2",
        label: "Listing Type",
        type: "select",
        required: true,
        options: listingTypeOptions,
        half: true,
      },
      {
        key: "property-type",
        label: "Property Type",
        type: "select",
        required: true,
        options: propertyTypeOptions,
        half: true,
      },
      {
        key: "zoning",
        label: "Zoning",
        type: "text",
        placeholder: "e.g. C-2",
        half: true,
      },
      {
        key: "zoning-municipality",
        label: "Zoning Municipality",
        type: "text",
        placeholder: "e.g. City of Phoenix",
        half: true,
      },
    ],
  },
  {
    title: "Listing Brokers",
    fields: [{ key: "listing-brokers", label: "Brokers", type: "brokers" }],
  },
  {
    title: "Status",
    fields: [
      { key: "available", label: "Available", type: "toggle", exclusive: "sold" },
      { key: "sold", label: "Sold", type: "toggle", exclusive: "available" },
      { key: "featured", label: "Featured", type: "toggle" },
      { key: "drone-hero", label: "Drone Hero", type: "toggle" },
    ],
  },
];

/* ============================================================
   REQUIRED FIELD KEYS — used for validation
   ============================================================ */
const REQUIRED_KEYS = ["name", "slug", "full-address", "city-county", "listing-type-2", "property-type"];

/* ============================================================
   COMPONENT
   ============================================================ */
export default function ListingForm({ item, allItems }: ListingFormProps) {
  const router = useRouter();
  const isEditMode = !!item;

  // ---- Form state: flat object matching ListingFieldData keys ----
  const [fields, setFields] = useState<Record<string, unknown>>(() => {
    if (item) {
      const fd = item.fieldData || {};
      return {
        name: fd.name || "",
        slug: fd.slug || "",
        "full-address": fd["full-address"] || "",
        "cross-streets": fd["cross-streets"] || "",
        "city-county": fd["city-county"] || "",
        "square-feet": fd["square-feet"] != null ? String(fd["square-feet"]) : "",
        "building-sqft": fd["building-sqft"] != null ? String(fd["building-sqft"]) : "",
        "traffic-count": fd["traffic-count"] || "",
        "list-price": fd["list-price"] || "",
        "listing-type-2": fd["listing-type-2"] || "",
        "property-type": fd["property-type"] || "",
        zoning: fd.zoning || "",
        "zoning-municipality": fd["zoning-municipality"] || "",
        "listing-brokers": fd["listing-brokers"] || [],
        latitude: fd.latitude ?? null,
        longitude: fd.longitude ?? null,
        "google-maps-link": fd["google-maps-link"] || "",
        "property-overview": fd["property-overview"] || "",
        "spaces-available": fd["spaces-available"] || "",
        available: fd.available !== false, // default ON
        sold: fd.sold || false,
        featured: fd.featured || false,
        "drone-hero": fd["drone-hero"] || false,
      };
    }
    // New listing defaults
    return {
      name: "",
      slug: "",
      "full-address": "",
      "cross-streets": "",
      "city-county": "",
      "square-feet": "",
      "building-sqft": "",
      "traffic-count": "",
      "list-price": "",
      "listing-type-2": "",
      "property-type": "",
      zoning: "",
      "zoning-municipality": "",
      "listing-brokers": [],
      latitude: null,
      longitude: null,
      "google-maps-link": "",
      "property-overview": "",
      "spaces-available": "",
      available: true,
      sold: false,
      featured: false,
      "drone-hero": false,
    };
  });

  // Track whether the user has manually edited the slug
  const slugManualRef = useRef(isEditMode);

  // Draft ID — set after first save (new listing) or from existing item
  const [draftId, setDraftId] = useState<string | null>(item?.id || null);

  // Save state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSaving = useRef(false);

  // Validation state — tracks which required fields have been touched and are empty
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Duplicate detection
  const [dupeNameWarn, setDupeNameWarn] = useState("");
  const [dupeSlugWarn, setDupeSlugWarn] = useState("");

  // ---- Asset state (Phase 4) ----
  const [packageAssets, setPackageAssets] = useState<PackageAssets>(() => {
    // In edit mode, load existing gallery images
    if (item?.fieldData) {
      const fd = item.fieldData;
      const existing: GalleryImage[] = [];
      // Floorplan (marketing pic) comes first
      if (fd.floorplan?.url) {
        existing.push({
          url: fd.floorplan.url,
          blob: null,
          name: "Marketing Image",
          isExisting: true,
        });
      }
      // Then gallery images
      if (fd.gallery) {
        for (const g of fd.gallery) {
          if (g.url) {
            existing.push({
              url: g.url,
              blob: null,
              name: g.alt || "Gallery Image",
              isExisting: true,
            });
          }
        }
      }
      return {
        packageFile: null,
        galleryImages: existing,
        marketingIdx: 0,
      };
    }
    return { packageFile: null, galleryImages: [], marketingIdx: 0 };
  });

  const [altaFile, setAltaFile] = useState<File | null>(null);
  const [sitePlanFile, setSitePlanFile] = useState<File | null>(null);

  // ---- Publish modal state ----
  const [showPublishModal, setShowPublishModal] = useState(false);

  // ---- Build CMS payload from form fields ----
  const buildPayload = useCallback((): ListingFieldData => {
    const fd: Record<string, unknown> = {};

    // Text fields — only include non-empty
    const textKeys = [
      "name", "slug", "full-address", "cross-streets", "city-county",
      "list-price", "listing-type-2", "property-type", "zoning",
      "zoning-municipality", "traffic-count",
    ];
    for (const k of textKeys) {
      const v = String(fields[k] || "").trim();
      if (v) fd[k] = v;
    }

    // Number fields — parse to float, only include if valid
    const acres = parseFloat(String(fields["square-feet"]));
    if (!isNaN(acres)) fd["square-feet"] = acres;
    const sqft = parseFloat(String(fields["building-sqft"]));
    if (!isNaN(sqft)) fd["building-sqft"] = sqft;

    // Brokers
    const brokers = fields["listing-brokers"] as string[];
    if (brokers.length > 0) fd["listing-brokers"] = brokers;

    // Map coordinates
    if (fields.latitude != null && fields.longitude != null) {
      fd.latitude = fields.latitude as number;
      fd.longitude = fields.longitude as number;
      fd["google-maps-link"] =
        `https://www.google.com/maps?q=${fields.latitude},${fields.longitude}`;
    }

    // Rich text
    const overview = String(fields["property-overview"] || "").trim();
    if (overview) fd["property-overview"] = overview;

    // Spaces table (HTML)
    const spaces = String(fields["spaces-available"] || "").trim();
    if (spaces) fd["spaces-available"] = spaces;

    // Toggles
    fd.available = fields.available as boolean;
    fd.sold = fields.sold as boolean;
    fd.featured = fields.featured as boolean;
    fd["drone-hero"] = fields["drone-hero"] as boolean;

    return fd as ListingFieldData;
  }, [fields]);

  // ---- Check required fields filled ----
  const allRequiredFilled = useCallback((): boolean => {
    for (const key of REQUIRED_KEYS) {
      const v = String(fields[key] || "").trim();
      if (!v) return false;
    }
    return true;
  }, [fields]);

  // ---- Check for duplicates ----
  const checkDuplicates = useCallback(
    (name: string, slug: string) => {
      const currentId = draftId || item?.id;

      // Name check
      const nameVal = name.trim().toLowerCase();
      if (nameVal) {
        const dupe = allItems.some(
          (li) =>
            li.id !== currentId &&
            (li.fieldData?.name || "").toLowerCase() === nameVal
        );
        setDupeNameWarn(dupe ? "A listing with this name already exists" : "");
      } else {
        setDupeNameWarn("");
      }

      // Slug check
      const slugVal = slug.trim().toLowerCase();
      if (slugVal) {
        const dupe = allItems.some(
          (li) =>
            li.id !== currentId &&
            (li.fieldData?.slug || "").toLowerCase() === slugVal
        );
        if (dupe) {
          // Suggest alternative
          const base = slugVal;
          let n = 2;
          while (
            allItems.some(
              (li) =>
                li.id !== currentId &&
                (li.fieldData?.slug || "") === `${base}-${n}`
            )
          ) {
            n++;
          }
          setDupeSlugWarn(`Slug taken. Try: ${base}-${n}`);
        } else {
          setDupeSlugWarn("");
        }
      } else {
        setDupeSlugWarn("");
      }
    },
    [allItems, draftId, item?.id]
  );

  // ---- Auto-save logic ----
  const doAutoSave = useCallback(async () => {
    if (isSaving.current) return;
    if (!allRequiredFilled()) return;
    // Don't save if duplicates detected
    if (dupeNameWarn || dupeSlugWarn) return;

    isSaving.current = true;
    setSaveStatus("saving");

    const payload = buildPayload();

    try {
      if (!draftId) {
        // First save — POST to create
        const res = await fetch("/api/listings/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldData: payload }),
        });
        if (!res.ok) throw new Error(`Create failed: ${res.status}`);
        const data = await res.json();
        // Webflow returns the item directly (not wrapped)
        const newId = data.id;
        if (newId) {
          setDraftId(newId);
          // Update URL to edit mode without full navigation
          window.history.replaceState(null, "", `/listings/${newId}/edit`);
        }
      } else {
        // Subsequent save — PATCH
        const res = await fetch(`/api/listings/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldData: payload }),
        });
        if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      }

      setSaveStatus("saved");
      // Clear "Saved" indicator after 3s
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000);
    } catch (err) {
      console.error("[ListingForm] Auto-save failed:", err);
      setSaveStatus("error");
    } finally {
      isSaving.current = false;
    }
  }, [allRequiredFilled, buildPayload, draftId, dupeNameWarn, dupeSlugWarn]);

  // ---- Schedule auto-save on field change ----
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 2500);
  }, [doAutoSave]);

  // ---- Field change handler ----
  const updateField = useCallback(
    (key: string, value: unknown) => {
      setFields((prev) => {
        const next = { ...prev, [key]: value };

        // Auto-generate slug from name (until user manually edits slug)
        if (key === "name" && !slugManualRef.current) {
          next.slug = slugify(String(value));
        }

        // Mark slug as manually edited
        if (key === "slug") {
          slugManualRef.current = true;
        }

        // Mutual exclusivity: Available ↔ Sold
        if (key === "available" && value === true) {
          next.sold = false;
        }
        if (key === "sold" && value === true) {
          next.available = false;
        }

        return next;
      });

      // Mark field as touched for validation display
      setTouched((prev) => new Set(prev).add(key));

      // Schedule auto-save
      scheduleAutoSave();
    },
    [scheduleAutoSave]
  );

  // ---- Run duplicate check when name or slug changes ----
  useEffect(() => {
    checkDuplicates(String(fields.name), String(fields.slug));
  }, [fields.name, fields.slug, checkDuplicates]);

  // ---- Manual "Save Draft" ----
  const handleSaveDraft = useCallback(async () => {
    if (isSaving.current) return;

    // Mark all required as touched so validation shows
    setTouched(new Set(REQUIRED_KEYS));

    if (!allRequiredFilled()) return;
    if (dupeNameWarn || dupeSlugWarn) return;

    // Cancel any pending auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    await doAutoSave();
  }, [allRequiredFilled, doAutoSave, dupeNameWarn, dupeSlugWarn]);

  // ---- Cleanup timer on unmount ----
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // ---- Check if a required field should show error ----
  const showError = (key: string) => {
    if (!REQUIRED_KEYS.includes(key)) return false;
    if (!touched.has(key)) return false;
    return !String(fields[key] || "").trim();
  };

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div className="max-w-[820px] mx-auto px-6 py-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {/* Back button */}
          <button
            onClick={() => router.push("/")}
            className="w-8 h-8 rounded-btn border border-[#E5E5E5] flex items-center justify-center
                       text-[#777] hover:text-[#333] hover:border-[#CCC] transition-colors text-sm"
            title="Back to listings"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-[#1a1a1a]">
            {isEditMode
              ? `Edit: ${fields.name || "Listing"}`
              : "New Listing"}
          </h1>

          {/* Save status indicator */}
          {saveStatus === "saving" && (
            <span className="text-xs text-[#B8860B] font-medium ml-2">
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-[#4A8C1C] font-medium ml-2">
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-[#CC3333] font-medium ml-2">
              Save failed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Save Draft button */}
          <button
            onClick={handleSaveDraft}
            disabled={isSaving.current}
            className="bg-[#F0F0F0] text-[#1A1A1A] border border-[#E0E0E0] font-semibold px-5 py-2 rounded-btn text-sm
                       hover:bg-[#E0E0E0] transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>

          {/* Publish button */}
          <button
            onClick={() => {
              // Mark all required as touched so validation shows
              setTouched(new Set(REQUIRED_KEYS));
              if (!allRequiredFilled()) return;
              if (dupeNameWarn || dupeSlugWarn) return;
              setShowPublishModal(true);
            }}
            className="bg-green text-black uppercase tracking-wide font-semibold px-5 py-2 rounded-btn text-sm
                       hover:bg-green/90 transition-colors"
          >
            Publish
          </button>
        </div>
      </div>

      {/* ---- Sections ---- */}
      {SECTIONS.map((section) => (
        <div
          key={section.title}
          className="mb-6 border border-[#E5E5E5] rounded-card bg-white"
        >
          {/* Section header */}
          <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card">
            <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
              {section.title}
            </h2>
          </div>

          {/* Section body */}
          <div className="px-5 py-4">
            {/* Render fields — wrap halfs in a flex row */}
            {renderFields(section.fields)}
          </div>
        </div>
      ))}

      {/* ---- Property Overview (rich text) ---- */}
      <div className="mb-6 border border-[#E5E5E5] rounded-card bg-white">
        <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
            Property Overview
          </h2>
        </div>
        <div className="px-5 py-4">
          <RichTextEditor
            value={String(fields["property-overview"] || "")}
            onChange={(html) => updateField("property-overview", html)}
            placeholder="Enter property overview..."
          />
        </div>
      </div>

      {/* ---- Available Spaces ---- */}
      <div className="mb-6 border border-[#E5E5E5] rounded-card bg-white">
        <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
            Available Spaces
          </h2>
        </div>
        <div className="px-5 py-4">
          <SpacesTable
            value={String(fields["spaces-available"] || "")}
            onChange={(html) => updateField("spaces-available", html)}
          />
        </div>
      </div>

      {/* ---- Location Map ---- */}
      <div className="mb-6 border border-[#E5E5E5] rounded-card bg-white">
        <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
            Location
          </h2>
        </div>
        <div className="px-5 py-4">
          {MAPBOX_TOKEN ? (
            <ListingMapPicker
              mapboxToken={MAPBOX_TOKEN}
              latitude={fields.latitude as number | null}
              longitude={fields.longitude as number | null}
              onChange={(lat, lng) => {
                setFields((prev) => ({
                  ...prev,
                  latitude: lat,
                  longitude: lng,
                  "google-maps-link": `https://www.google.com/maps?q=${lat},${lng}`,
                }));
                scheduleAutoSave();
              }}
            />
          ) : (
            <p className="text-sm text-[#777]">
              Mapbox token not configured — map unavailable.
            </p>
          )}
        </div>
      </div>

      {/* ---- Package & Assets ---- */}
      <div className="mb-6 border border-[#E5E5E5] rounded-card bg-white">
        <div className="px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA] rounded-t-card">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider">
            Package & Assets
          </h2>
        </div>
        <div className="px-5 py-4 space-y-6">
          {/* Marketing Package PDF */}
          <div>
            <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5">
              Marketing Package PDF
            </label>
            <PackageUploader
              assets={packageAssets}
              onChange={(newAssets) => {
                setPackageAssets(newAssets);
                scheduleAutoSave();
              }}
              existingPackageUrl={item?.fieldData?.["package-2"] || undefined}
            />
          </div>

          {/* Alta Survey + Site Plan — side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FileUploadZone
              label="Alta Survey"
              file={altaFile}
              onFileSelect={(f) => {
                setAltaFile(f);
                scheduleAutoSave();
              }}
              existingUrl={item?.fieldData?.["alta-survey-2"] || undefined}
            />
            <FileUploadZone
              label="Site Plan"
              file={sitePlanFile}
              onFileSelect={(f) => {
                setSitePlanFile(f);
                scheduleAutoSave();
              }}
              existingUrl={item?.fieldData?.["site-plan-2"] || undefined}
            />
          </div>

          {/* Additional Photos */}
          <PhotoUploader
            galleryImages={packageAssets.galleryImages}
            marketingIdx={packageAssets.marketingIdx}
            onChange={(images, marketingIdx) => {
              setPackageAssets((prev) => ({
                ...prev,
                galleryImages: images,
                marketingIdx,
              }));
              scheduleAutoSave();
            }}
          />
        </div>
      </div>

      {/* ---- Publish Modal ---- */}
      {showPublishModal && (
        <PublishModal
          fieldData={buildPayload()}
          itemId={draftId}
          packageAssets={packageAssets}
          altaFile={altaFile}
          sitePlanFile={sitePlanFile}
          slug={String(fields.slug || "")}
          listingName={String(fields.name || "")}
          existingUrls={{
            package: item?.fieldData?.["package-2"] || undefined,
            alta: item?.fieldData?.["alta-survey-2"] || undefined,
            sitePlan: item?.fieldData?.["site-plan-2"] || undefined,
            floorplan: item?.fieldData?.floorplan?.url || undefined,
            gallery: item?.fieldData?.gallery?.map((g: { url: string }) => g.url) || undefined,
          }}
          onComplete={(newId) => {
            // Update draft ID if this was a new listing
            if (!draftId) {
              setDraftId(newId);
              window.history.replaceState(null, "", `/listings/${newId}/edit`);
            }
          }}
          onClose={() => setShowPublishModal(false)}
        />
      )}
    </div>
  );

  /* ============================================================
     FIELD RENDERERS
     ============================================================ */
  function renderFields(fieldDefs: FieldDef[]) {
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < fieldDefs.length) {
      const f = fieldDefs[i];

      // Special types get full width
      if (f.type === "brokers") {
        elements.push(renderBrokerField(f, i));
        i++;
        continue;
      }

      if (f.type === "toggle") {
        // Collect all consecutive toggles into one row
        const toggles: FieldDef[] = [];
        while (i < fieldDefs.length && fieldDefs[i].type === "toggle") {
          toggles.push(fieldDefs[i]);
          i++;
        }
        elements.push(
          <div key="toggles" className="flex flex-wrap gap-8 py-1 mt-1">
            {toggles.map((t) => renderToggle(t))}
          </div>
        );
        continue;
      }

      // Check if this and next field are both half-width
      if (f.half && i + 1 < fieldDefs.length && fieldDefs[i + 1].half) {
        const f2 = fieldDefs[i + 1];
        elements.push(
          <div key={`row-${i}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderTextField(f)}
            {renderTextField(f2)}
          </div>
        );
        i += 2;
      } else {
        elements.push(renderTextField(f));
        i++;
      }
    }

    return elements;
  }

  function renderTextField(f: FieldDef) {
    const key = f.key as string;
    const value = String(fields[key] ?? "");
    const hasError = showError(key);
    const isDupeName = key === "name" && dupeNameWarn;
    const isDupeSlug = key === "slug" && dupeSlugWarn;

    if (f.type === "select") {
      return (
        <div key={key} className="mb-4">
          <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5">
            {f.label}
            {f.required && <span className="text-[#CC3333] ml-0.5">*</span>}
          </label>
          <select
            value={value}
            onChange={(e) => updateField(key, e.target.value)}
            className={`w-full bg-white border rounded-btn px-3 py-2 text-sm text-[#333]
                        outline-none focus:border-green transition-colors
                        ${hasError ? "border-[#CC3333]" : "border-[#E5E5E5]"}`}
          >
            <option value="">Select...</option>
            {f.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {hasError && (
            <p className="text-[10px] text-[#CC3333] mt-1">Required</p>
          )}
        </div>
      );
    }

    // Text or number input
    return (
      <div key={key} className="mb-4">
        <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-1.5">
          {f.label}
          {f.required && <span className="text-[#CC3333] ml-0.5">*</span>}
        </label>
        <input
          type="text"
          inputMode={f.type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => updateField(key, e.target.value)}
          placeholder={f.placeholder}
          className={`w-full bg-white border rounded-btn px-3 py-2 text-sm text-[#333]
                      placeholder:text-[#BBB] outline-none focus:border-green transition-colors
                      ${hasError || isDupeName || isDupeSlug ? "border-[#CC3333]" : "border-[#E5E5E5]"}`}
        />
        {hasError && !isDupeName && !isDupeSlug && (
          <p className="text-[10px] text-[#CC3333] mt-1">Required</p>
        )}
        {isDupeName && (
          <p className="text-[10px] text-[#CC3333] mt-1">{dupeNameWarn}</p>
        )}
        {isDupeSlug && (
          <p className="text-[10px] text-[#CC3333] mt-1">{dupeSlugWarn}</p>
        )}
        {key === "slug" && !isDupeSlug && value && (
          <p className="text-[10px] text-[#777] mt-1">
            cre8advisors.com/listings/{value}
          </p>
        )}
      </div>
    );
  }

  function renderBrokerField(f: FieldDef, idx: number) {
    const selected = (fields["listing-brokers"] as string[]) || [];

    return (
      <div key={`brokers-${idx}`} className="mb-2">
        <div className="flex flex-wrap gap-3">
          {brokerEntries.map(({ id, name }) => {
            const isChecked = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  const next = isChecked
                    ? selected.filter((b) => b !== id)
                    : [...selected, id];
                  updateField("listing-brokers", next);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-btn border text-sm transition-colors
                  ${
                    isChecked
                      ? "border-green bg-[#F0F9E5] text-[#333] font-semibold"
                      : "border-[#E5E5E5] text-[#666] hover:border-[#CCC]"
                  }`}
              >
                {/* Checkbox indicator */}
                <span
                  className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center flex-shrink-0 text-[10px]
                    ${
                      isChecked
                        ? "bg-green border-green text-black"
                        : "border-[#CCC]"
                    }`}
                >
                  {isChecked && "✓"}
                </span>
                {name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderToggle(f: FieldDef) {
    const key = f.key as string;
    const isOn = fields[key] === true;

    return (
      <button
        key={key}
        type="button"
        onClick={() => updateField(key, !isOn)}
        className="flex items-center gap-2.5 select-none"
      >
        {/* Toggle track */}
        <span
          className={`relative inline-block w-10 h-[22px] rounded-full transition-colors duration-200
            ${isOn ? "bg-green" : "bg-[#DDD]"}`}
        >
          {/* Toggle knob */}
          <span
            className={`absolute left-0 top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200
              ${isOn ? "translate-x-[20px]" : "translate-x-[2px]"}`}
          />
        </span>
        <span className="text-sm text-[#333]">{f.label}</span>
      </button>
    );
  }
}
