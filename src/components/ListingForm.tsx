"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import dynamic from "next/dynamic";
import { AlertCircle, ArrowLeft, Check, MapPin, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Modal,
  PageContainer,
  PageHeader,
  Section,
  Select,
  Skeleton,
  cn,
  FOCUS_RING,
} from "@/components/ui";
import {
  ListingItem,
  ListingFieldData,
  LISTING_TYPES,
  PROPERTY_TYPES,
  BROKERS,
  MAPBOX_TOKEN,
  slugify,
  brokerIdForEmail,
} from "@/lib/admin-constants";
import RichTextEditor from "@/components/RichTextEditor";
import SpacesTable from "@/components/SpacesTable";
import PackageUploader, { PackageAssets, GalleryImage } from "@/components/PackageUploader";
import FileUploadZone from "@/components/FileUploadZone";
import PhotoUploader from "@/components/PhotoUploader";
import PublishModal from "@/components/PublishModal";
import ChecklistCard from "@/components/checklist/ChecklistCard";
import type { ParcelSelection, SelectedParcel } from "@/components/ParcelPickerModal";
import { EMPTY_ITEMS } from "@/lib/checklist/constants";
import type { ListingChecklist } from "@/lib/checklist/types";
import { buildSpFolderName } from "@/lib/listing-utils";
import { useGraphToken } from "@/lib/useGraphToken";
import {
  getSiteId,
  getDriveId,
  uploadToSharePoint,
  createListingFolders,
} from "@/lib/graph";

// Dynamic imports — Mapbox uses window/document, can't render server-side
const ListingMapPicker = dynamic(
  () => import("@/components/ListingMapPicker"),
  { ssr: false, loading: () => <Skeleton className="w-full h-[300px]" /> }
);

const ParcelPickerModal = dynamic(
  () => import("@/components/ParcelPickerModal"),
  { ssr: false }
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
        required: true,
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
    fields: [{ key: "listing-brokers", label: "Brokers", type: "brokers", required: true }],
  },
  {
    title: "Status",
    fields: [
      { key: "available", label: "Available", type: "toggle", exclusive: "sold" },
      { key: "under-contract", label: "Under Contract", type: "toggle" },
      { key: "sold", label: "Sold", type: "toggle", exclusive: "available" },
      { key: "featured", label: "Featured", type: "toggle" },
      { key: "drone-hero", label: "Drone Hero", type: "toggle" },
    ],
  },
];

/* ============================================================
   REQUIRED FIELD KEYS — used for validation
   ============================================================ */
const REQUIRED_KEYS = [
  "name", "slug", "full-address", "city-county", "listing-type-2", "property-type",
  "list-price", "listing-brokers", "property-overview", "latitude", "longitude",
];

/* ============================================================
   DISPLAY LABELS — sentence-case titles for the UI. The SECTIONS
   config above keeps its original strings because logic checks
   `section.title === "Property Info"` etc.
   ============================================================ */
const SECTION_TITLES: Record<string, string> = {
  "Property Info": "Property info",
  Classification: "Classification",
  "Listing Brokers": "Listing brokers",
  Status: "Status",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  slug: "Slug",
  "full-address": "Full address",
  "cross-streets": "Cross streets",
  "city-county": "City / county",
  "square-feet": "Acres",
  "building-sqft": "Building sq ft",
  "traffic-count": "Traffic count",
  "list-price": "List price",
  "listing-type-2": "Listing type",
  "property-type": "Property type",
  zoning: "Zoning",
  "zoning-municipality": "Zoning municipality",
  available: "Available",
  "under-contract": "Under contract",
  sold: "Sold",
  featured: "Featured",
  "drone-hero": "Drone hero",
};

/** Compute the geographic centroid of selected parcels */
function computeCentroid(parcels: SelectedParcel[]): [number, number] | null {
  let sumLng = 0, sumLat = 0, count = 0;
  for (const p of parcels) {
    const geom = p.feature.geometry;
    if (!geom) continue;
    const coords: number[][][] =
      geom.type === "MultiPolygon"
        ? (geom as GeoJSON.MultiPolygon).coordinates.flat()
        : geom.type === "Polygon"
          ? (geom as GeoJSON.Polygon).coordinates
          : [];
    for (const ring of coords) {
      for (const [lng, lat] of ring) {
        sumLng += lng;
        sumLat += lat;
        count++;
      }
    }
  }
  if (count === 0) return null;
  return [sumLng / count, sumLat / count];
}

/* ============================================================
   COMPONENT
   ============================================================ */
export default function ListingForm({ item, allItems }: ListingFormProps) {
  const router = useRouter();
  const { accounts } = useMsal();
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
        "under-contract": fd["under-contract"] || false,
        featured: fd.featured || false,
        "drone-hero": fd["drone-hero"] || false,
      };
    }
    // New listing defaults — the signed-in broker starts checked
    // (they can uncheck themselves)
    const myBrokerId = brokerIdForEmail(accounts[0]?.username);
    return {
      name: "",
      slug: "",
      "full-address": "",
      "cross-streets": "",
      "city-county": "",
      "square-feet": "",
      "building-sqft": "",
      "traffic-count": "",
      "list-price": "Call for Pricing",
      "listing-type-2": "",
      "property-type": "",
      zoning: "",
      "zoning-municipality": "",
      "listing-brokers": myBrokerId ? [myBrokerId] : [],
      latitude: null,
      longitude: null,
      "google-maps-link": "",
      "property-overview": "",
      "spaces-available": "",
      available: true,
      sold: false,
      "under-contract": false,
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
  const [dupeExistingId, setDupeExistingId] = useState<string | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // ---- Parcel picker state ----
  const [showParcelPicker, setShowParcelPicker] = useState(false);
  const [savedParcels, setSavedParcels] = useState<SelectedParcel[]>([]);

  /* ============================================================
     NEW LISTING CHECKLIST
     Checklist state lives in Supabase (listing_checklists), keyed
     by the Webflow item id. In new mode we hold a local stub
     (id="") until the CMS item is created at first save.
     ============================================================ */
  const [checklist, setChecklist] = useState<ListingChecklist | null>(() => {
    if (isEditMode) return null; // fetched on mount below
    // New listing — local stub, persisted after first auto-save
    return {
      id: "",
      listing_id: "",
      listing_name: null,
      is_new: true,
      items: { ...EMPTY_ITEMS },
      listing_agreement_url: null,
      created_at: "",
      updated_at: "",
    };
  });
  const [laFile, setLaFile] = useState<File | null>(null);
  const [laUploadState, setLaUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const getGraphToken = useGraphToken();

  // Email header value for checklist API writes
  const userEmail = accounts[0]?.username || "admin@cre8advisors.com";

  // Keep latest checklist in a ref so async callbacks don't go stale
  const checklistRef = useRef(checklist);
  useEffect(() => {
    checklistRef.current = checklist;
  }, [checklist]);

  // ---- Fetch checklist row on mount (edit mode) ----
  useEffect(() => {
    if (!isEditMode || !item?.id) return;
    (async () => {
      try {
        const res = await fetch(`/api/listings/checklists/${item.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.checklist) {
          setChecklist(data.checklist);
          // Backfill flyer auto-check: a package already exists in the CMS
          // (uploaded before this feature or in another session)
          if (
            data.checklist.is_new &&
            !data.checklist.items.flyer &&
            item.fieldData?.["package-2"]
          ) {
            patchChecklistOnServer(item.id, { items: { flyer: true } });
          }
        }
      } catch {
        // Non-critical — checklist UI just won't show
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, item?.id]);

  // ---- Low-level server patch (returns updated row or null) ----
  const patchChecklistOnServer = useCallback(
    async (
      listingId: string,
      patch: {
        items?: Record<string, boolean>;
        is_new?: boolean;
        listing_name?: string;
        listing_agreement_url?: string;
      }
    ): Promise<ListingChecklist | null> => {
      try {
        const res = await fetch(`/api/listings/checklists/${listingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": userEmail,
          },
          body: JSON.stringify(patch),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.checklist) setChecklist(data.checklist);
        return data.checklist || null;
      } catch {
        return null;
      }
    },
    [userEmail]
  );

  // ---- Optimistic patch used by the checklist card ----
  const patchChecklist = useCallback(
    (patch: {
      items?: Record<string, boolean>;
      listing_agreement_url?: string;
    }) => {
      const current = checklistRef.current;
      if (!current) return;
      const prev = current;

      // Optimistic local merge
      setChecklist({
        ...current,
        items: { ...current.items, ...(patch.items || {}) },
        listing_agreement_url:
          patch.listing_agreement_url ?? current.listing_agreement_url,
      });

      // Not persisted yet (new mode before first save) — local only;
      // the accumulated items are sent when the row is created.
      if (!current.listing_id) return;

      // Persist — server response replaces local state (may flip is_new)
      patchChecklistOnServer(current.listing_id, patch).then((updated) => {
        if (!updated) setChecklist(prev); // revert on failure
      });
    },
    [patchChecklistOnServer]
  );

  // ---- Create the checklist row (first save / toggle-on) ----
  const createChecklistRow = useCallback(
    async (listingId: string, isNewFlag: boolean) => {
      const current = checklistRef.current;
      try {
        const res = await fetch("/api/listings/checklists", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": userEmail,
          },
          body: JSON.stringify({
            listing_id: listingId,
            listing_name: String(fields.name || "") || undefined,
            is_new: isNewFlag,
            // Carry over any items checked locally before the row existed
            items: current?.items || undefined,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.checklist) setChecklist(data.checklist);
      } catch {
        // Non-critical
      }
    },
    [userEmail, fields.name]
  );

  // ---- "New Listing" toggle handler ----
  const handleNewToggle = useCallback(() => {
    const current = checklistRef.current;

    if (current?.listing_id) {
      // Row exists — flip is_new
      const next = !current.is_new;
      setChecklist({ ...current, is_new: next });
      patchChecklistOnServer(current.listing_id, { is_new: next }).then(
        (updated) => {
          if (!updated) setChecklist(current); // revert
        }
      );
      return;
    }

    // Edit mode, no row yet — toggling on creates one
    if (draftId) {
      createChecklistRow(draftId, true);
    }
  }, [draftId, patchChecklistOnServer, createChecklistRow]);

  // ---- Executed listing agreement upload (immediate) ----
  const handleLaFileSelect = useCallback(
    async (file: File) => {
      setLaFile(file);
      setLaUploadState("uploading");
      try {
        const token = await getGraphToken();
        if (!token) throw new Error("Could not get Microsoft access token");

        const siteId = await getSiteId(token);
        const driveId = await getDriveId(token, siteId);

        // Same folder convention as the publish flow
        const spFolderName = buildSpFolderName(
          String(fields.name || ""),
          String(fields["city-county"] || "")
        );
        await createListingFolders(token, driveId, spFolderName);

        const webUrl = await uploadToSharePoint(
          token,
          siteId,
          driveId,
          `Listings/Active/${spFolderName}/Documents/`,
          `${String(fields.slug || "listing")}-listing-agreement.pdf`,
          await file.arrayBuffer(),
          "application/pdf"
        );

        setLaUploadState("idle");
        patchChecklist({
          listing_agreement_url: webUrl,
          items: { la_executed: true },
        });
      } catch (err) {
        console.error("[ListingForm] LA upload failed:", err);
        setLaUploadState("error");
      }
    },
    [getGraphToken, fields, patchChecklist]
  );

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
    fd["under-contract"] = fields["under-contract"] as boolean;
    fd.featured = fields.featured as boolean;
    fd["drone-hero"] = fields["drone-hero"] as boolean;

    return fd as ListingFieldData;
  }, [fields]);

  // ---- Check required fields filled ----
  const isFieldFilled = useCallback((key: string): boolean => {
    const val = fields[key];
    // Arrays (brokers) — need at least one
    if (Array.isArray(val)) return val.length > 0;
    // Numbers (lat/lng) — must not be null
    if (key === "latitude" || key === "longitude") return val != null;
    // Rich text — strip HTML tags to check for actual content
    if (key === "property-overview") {
      const text = String(val || "").replace(/<[^>]*>/g, "").trim();
      return text.length > 0;
    }
    // Everything else — non-empty string
    return String(val || "").trim().length > 0;
  }, [fields]);

  const allRequiredFilled = useCallback((): boolean => {
    return REQUIRED_KEYS.every((key) => isFieldFilled(key));
  }, [isFieldFilled]);

  // Saving a draft only needs a name (slug auto-generates from it).
  // Full REQUIRED_KEYS validation applies to Publish only.
  const canSave = useCallback((): boolean => {
    return (
      String(fields.name || "").trim().length > 0 &&
      String(fields.slug || "").trim().length > 0
    );
  }, [fields.name, fields.slug]);

  // ---- Check for duplicates ----
  const checkDuplicates = useCallback(
    (name: string, slug: string) => {
      const currentId = draftId || item?.id;
      let foundDupeId: string | null = null;

      // Name check
      const nameVal = name.trim().toLowerCase();
      if (nameVal) {
        const dupeItem = allItems.find(
          (li) =>
            li.id !== currentId &&
            (li.fieldData?.name || "").toLowerCase() === nameVal
        );
        if (dupeItem) {
          foundDupeId = dupeItem.id;
          setDupeNameWarn("A listing with this name already exists");
        } else {
          setDupeNameWarn("");
        }
      } else {
        setDupeNameWarn("");
      }

      // Slug check
      const slugVal = slug.trim().toLowerCase();
      if (slugVal) {
        const dupeItem = allItems.find(
          (li) =>
            li.id !== currentId &&
            (li.fieldData?.slug || "").toLowerCase() === slugVal
        );
        if (dupeItem) {
          foundDupeId = dupeItem.id;
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

      setDupeExistingId(foundDupeId);
    },
    [allItems, draftId, item?.id]
  );

  // ---- Auto-save logic ----
  const doAutoSave = useCallback(async () => {
    if (isSaving.current) return;
    if (!canSave()) return;
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
        if (!res.ok) {
          // Server-side duplicate check caught it
          if (res.status === 409) {
            const errData = await res.json();
            setDupeSlugWarn("This listing already exists in the CMS");
            if (errData.existingId) setDupeExistingId(errData.existingId);
            setSaveStatus("error");
            isSaving.current = false;
            return;
          }
          throw new Error(`Create failed: ${res.status}`);
        }
        const data = await res.json();
        // Webflow returns the item directly (not wrapped)
        const newId = data.id;
        if (newId) {
          setDraftId(newId);
          // Update URL to edit mode without full navigation
          window.history.replaceState(null, "", `/listings/${newId}/edit`);
          // Create the checklist row — new listings are tagged New by default.
          // Carries over any locally-checked items (e.g. flyer).
          createChecklistRow(newId, checklistRef.current?.is_new ?? true);
        }
      } else {
        // Subsequent save — PATCH
        const res = await fetch(`/api/listings/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldData: payload }),
        });
        if (!res.ok) throw new Error(`Update failed: ${res.status}`);

        // Keep the denormalized checklist listing_name in sync on rename
        const cl = checklistRef.current;
        if (
          cl?.listing_id &&
          cl.is_new &&
          payload.name &&
          payload.name !== cl.listing_name
        ) {
          patchChecklistOnServer(cl.listing_id, {
            listing_name: String(payload.name),
          });
        }
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
  }, [canSave, buildPayload, draftId, dupeNameWarn, dupeSlugWarn, createChecklistRow, patchChecklistOnServer]);

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

        // Mutual exclusivity: Available ↔ Sold. Under Contract is a state of an
        // available listing: it clears Sold; Sold clears it (and Available).
        if (key === "available" && value === true) {
          next.sold = false;
        }
        if (key === "sold" && value === true) {
          next.available = false;
          next["under-contract"] = false;
        }
        if (key === "under-contract" && value === true) {
          next.sold = false;
          next.available = true;
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

  // ---- Manual "Save Listing" ----
  // Only a name is required to save — everything else can be filled in
  // later. Full validation happens on Publish.
  const handleSaveDraft = useCallback(async () => {
    if (isSaving.current) return;

    if (!canSave()) {
      // Show the error on the name field only
      setTouched((prev) => new Set(prev).add("name"));
      return;
    }
    if (dupeNameWarn || dupeSlugWarn) return;

    // Cancel any pending auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    await doAutoSave();
  }, [canSave, doAutoSave, dupeNameWarn, dupeSlugWarn]);

  // ---- Delete listing ----
  const handleDelete = useCallback(async () => {
    if (!draftId) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Stop any active email campaigns for this listing
      try {
        await fetch("/api/email/mark-sold", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": userEmail,
          },
          body: JSON.stringify({ listing_id: draftId }),
        });
      } catch {
        // Non-critical — continue with delete
      }

      // Remove the checklist row (if any)
      try {
        await fetch(`/api/listings/checklists/${draftId}`, {
          method: "DELETE",
          headers: { "x-user-email": userEmail },
        });
      } catch {
        // Non-critical — continue with delete
      }

      // Delete from Webflow CMS
      const res = await fetch(`/api/listings/${draftId}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete failed: ${res.status} — ${text}`);
      }

      // Reset state and redirect to listings list
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      router.push("/");
    } catch (err) {
      console.error("Failed to delete listing:", err);
      setIsDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [draftId, router, userEmail]);

  // ---- Cleanup timer on unmount ----
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // ---- Handle parcel picker confirmation ----
  const handleParcelConfirm = useCallback(
    async (selection: ParcelSelection) => {
      setShowParcelPicker(false);
      setSavedParcels(selection.selectedParcels);

      const firstParcel = selection.selectedParcels[0];
      if (!firstParcel) return;

      const props = firstParcel.feature?.properties || {};
      const source = firstParcel.source;

      // Compute centroid for lat/lng
      const centroid = computeCentroid(selection.selectedParcels);

      // Extract zoning (Maricopa CITY_ZONING field)
      const zoning = source === "maricopa" ? (props.CITY_ZONING as string || "") : "";

      // Determine county from parcel source
      const countyName =
        source === "maricopa" ? "Maricopa" :
        source === "pinal" ? "Pinal" :
        source === "gila" ? "Gila" : "";

      // Get city name — Pinal has it in the data, otherwise reverse geocode
      let cityName = "";
      if (source === "pinal" && props.PSTLCITY) {
        cityName = String(props.PSTLCITY);
      }
      if (!cityName && centroid && MAPBOX_TOKEN) {
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${centroid[0]},${centroid[1]}.json?access_token=${MAPBOX_TOKEN}&types=place`
          );
          const data = await res.json();
          const placeFeature = data.features?.[0];
          if (placeFeature?.text) {
            cityName = placeFeature.text;
          }
        } catch {
          // Non-fatal — user can fill city manually
        }
      }

      const address = selection.property_address;

      setFields((prev) => {
        const next = { ...prev };

        if (address) {
          next.name = address;
          if (!slugManualRef.current) next.slug = slugify(address);
        }
        if (address && cityName) {
          next["full-address"] = `${address}, ${cityName}, AZ`;
        } else if (address) {
          next["full-address"] = address;
        }
        if (cityName || countyName) {
          next["city-county"] = [cityName, countyName].filter(Boolean).join(", ");
        }
        if (selection.acreage) {
          next["square-feet"] = selection.acreage;
        }
        if (centroid) {
          // Round to 6 decimals — Webflow number fields reject high precision
          const lat6 = Math.round(centroid[1] * 1e6) / 1e6;
          const lng6 = Math.round(centroid[0] * 1e6) / 1e6;
          next.latitude = lat6;
          next.longitude = lng6;
          next["google-maps-link"] = `https://www.google.com/maps?q=${lat6},${lng6}`;
        }
        if (zoning) {
          next.zoning = zoning;
        }

        return next;
      });

      scheduleAutoSave();
    },
    [scheduleAutoSave]
  );

  // ---- Check if a required field should show error ----
  const showError = (key: string) => {
    if (!REQUIRED_KEYS.includes(key)) return false;
    if (!touched.has(key)) return false;
    return !isFieldFilled(key);
  };

  /* ============================================================
     RENDER
     ============================================================ */
  // Save-status chip shown next to the page title (green only for "Saved" = success)
  const saveStatusBadge =
    saveStatus === "saving" ? (
      <Badge tone="neutral">Saving...</Badge>
    ) : saveStatus === "saved" ? (
      <Badge tone="success">Saved</Badge>
    ) : saveStatus === "error" ? (
      <Badge tone="danger">Save failed</Badge>
    ) : null;

  return (
    // PageContainer "default" = form width; PageHeader holds the title + main buttons
    <PageContainer width="default">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            {/* Back button */}
            <IconButton
              label="Back to listings"
              variant="secondary"
              size="sm"
              icon={<ArrowLeft size={18} strokeWidth={1.75} />}
              onClick={() => router.push("/")}
            />
            <span className="truncate">
              {isEditMode
                ? `Edit: ${fields.name || "Listing"}`
                : "New listing"}
            </span>
            {/* Save status indicator */}
            {saveStatusBadge}
          </span>
        }
        actions={
          <>
            {/* Delete button — edit mode only (the real destructive action is confirmed in the modal) */}
            {isEditMode && (
              <Button
                variant="ghost"
                icon={<Trash2 size={18} strokeWidth={1.75} />}
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger-fg hover:text-danger-fg hover:bg-danger-bg"
              >
                Delete
              </Button>
            )}

            {/* Save Listing button */}
            <Button variant="secondary" onClick={handleSaveDraft} disabled={isSaving.current}>
              Save listing
            </Button>

            {/* Publish button — the page's primary action (near-black) */}
            <Button
              onClick={() => {
                // Mark all required as touched so validation shows
                setTouched(new Set(REQUIRED_KEYS));
                if (!allRequiredFilled()) return;
                if (dupeNameWarn || dupeSlugWarn) return;
                setShowPublishModal(true);
              }}
              disabled={!!(dupeNameWarn || dupeSlugWarn)}
            >
              Publish to website
            </Button>
          </>
        }
      />

      {/* ---- Duplicate warning banner ---- */}
      {(dupeNameWarn || dupeSlugWarn) && (
        <div className="mb-6 px-4 py-3 bg-danger-bg rounded-card flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} strokeWidth={1.75} className="text-danger-fg mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-danger-fg">
                Duplicate listing detected
              </p>
              <p className="text-xs text-danger-fg mt-0.5">
                {dupeNameWarn || dupeSlugWarn}. Publishing is blocked to prevent duplicates in the CMS.
              </p>
            </div>
          </div>
          {dupeExistingId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/listings/${dupeExistingId}/edit`)}
            >
              Edit existing listing
            </Button>
          )}
        </div>
      )}

      {/* ---- New Listing Checklist ---- */}
      {checklist?.is_new && (
        <ChecklistCard
          items={checklist.items}
          onToggleItem={(key, value) =>
            patchChecklist({ items: { [key]: value } })
          }
          listingAgreementUrl={checklist.listing_agreement_url}
          laFile={laFile}
          onLaFileSelect={handleLaFileSelect}
          laUploadState={laUploadState}
          laDisabled={!draftId}
          onComplete={handleNewToggle}
        />
      )}

      {/* ---- Sections ---- */}
      {SECTIONS.map((section) => {
        // Check if any field in this section has a validation error
        // Include lat/lng for Property Info since the map is rendered inside it
        const sectionHasError = section.fields.some((f) => showError(f.key as string))
          || (section.title === "Property Info" && (showError("latitude") || showError("longitude")));
        return (
        // Card per section — red border when a required field inside is missing
        <Card key={section.title} className={cn("mb-6", sectionHasError && "border-danger")}>
          <Section
            title={SECTION_TITLES[section.title] || section.title}
            actions={
              /* Pick from Map button — Property Info section only */
              section.title === "Property Info" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<MapPin size={18} strokeWidth={1.75} />}
                  onClick={() => setShowParcelPicker(true)}
                >
                  Pick from map
                </Button>
              ) : undefined
            }
          >
            {/* Render fields — wrap halfs in a two-column grid; fields stack with space-y-4 */}
            <div className="space-y-4">{renderFields(section.fields)}</div>

            {/* "New Listing" toggle — Status section only.
                NOT a Webflow field (checklist state lives in Supabase),
                so it can't go through SECTIONS/buildPayload. */}
            {section.title === "Status" && (
              <div className="flex flex-wrap gap-8 py-1 mt-4 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={handleNewToggle}
                  disabled={!draftId}
                  className={cn("flex items-center gap-2.5 select-none disabled:opacity-50 rounded-control", FOCUS_RING)}
                  title={
                    !draftId
                      ? "New listings are tagged automatically on first save"
                      : undefined
                  }
                >
                  {/* Switch track — green when on (status) */}
                  <span
                    className={cn(
                      "relative inline-block w-10 h-[22px] rounded-pill transition-colors duration-200",
                      checklist?.is_new ? "bg-accent" : "bg-border-strong"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0 top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200",
                        checklist?.is_new ? "translate-x-[20px]" : "translate-x-[2px]"
                      )}
                    />
                  </span>
                  <span className="text-sm text-text">New listing</span>
                </button>
              </div>
            )}

            {/* Location map — merged into Property Info section */}
            {section.title === "Property Info" && (
              <div className="mt-4 pt-4 border-t border-border">
                <Field
                  label="Pin location"
                  required
                  error={
                    showError("latitude") || showError("longitude")
                      ? "Click the map or pick a parcel to set the pin location"
                      : undefined
                  }
                >
                  {MAPBOX_TOKEN ? (
                    <ListingMapPicker
                      mapboxToken={MAPBOX_TOKEN}
                      latitude={fields.latitude as number | null}
                      longitude={fields.longitude as number | null}
                      onChange={(lat, lng) => {
                        // Round to 6 decimals — Webflow number fields reject high precision
                        const lat6 = Math.round(lat * 1e6) / 1e6;
                        const lng6 = Math.round(lng * 1e6) / 1e6;
                        setFields((prev) => ({
                          ...prev,
                          latitude: lat6,
                          longitude: lng6,
                          "google-maps-link": `https://www.google.com/maps?q=${lat6},${lng6}`,
                        }));
                        scheduleAutoSave();
                      }}
                    />
                  ) : (
                    <p className="text-sm text-text-3">
                      Mapbox token not configured — map unavailable.
                    </p>
                  )}
                </Field>
              </div>
            )}
          </Section>
        </Card>
      );
      })}

      {/* ---- Property Overview (rich text) ---- */}
      <Card className={cn("mb-6", showError("property-overview") && "border-danger")}>
        <Section
          title={
            <>
              Property overview<span className="text-danger-fg ml-0.5">*</span>
            </>
          }
        >
          <RichTextEditor
            value={String(fields["property-overview"] || "")}
            onChange={(html) => updateField("property-overview", html)}
            placeholder="Enter property overview..."
          />
          {showError("property-overview") && (
            <p className="text-xs text-danger-fg mt-1.5">Required</p>
          )}
        </Section>
      </Card>

      {/* ---- Available Spaces ---- */}
      <Card className="mb-6">
        <Section title="Available spaces">
          <SpacesTable
            value={String(fields["spaces-available"] || "")}
            onChange={(html) => updateField("spaces-available", html)}
          />
        </Section>
      </Card>

      {/* ---- Package & Assets ---- */}
      <Card className="mb-6">
        <Section title="Package & assets">
          <div className="space-y-6">
            {/* Marketing Package PDF */}
            <Field label="Marketing package PDF">
              <PackageUploader
                assets={packageAssets}
                onChange={(newAssets) => {
                  setPackageAssets(newAssets);
                  // Auto-check "Marketing flyer" on the new-listing checklist
                  if (
                    newAssets.packageFile &&
                    checklist?.is_new &&
                    !checklist.items.flyer
                  ) {
                    patchChecklist({ items: { flyer: true } });
                  }
                  scheduleAutoSave();
                }}
                existingPackageUrl={item?.fieldData?.["package-2"] || undefined}
              />
            </Field>

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
        </Section>
      </Card>

      {/* ---- Parcel Picker Modal ---- */}
      {showParcelPicker && (
        <ParcelPickerModal
          onConfirm={handleParcelConfirm}
          onClose={() => setShowParcelPicker(false)}
          includeAcreage={true}
          mapboxToken={MAPBOX_TOKEN}
          initialParcels={savedParcels.length > 0 ? savedParcels : undefined}
        />
      )}

      {/* ---- Delete Confirmation Modal (shared Modal primitive; same state vars) ---- */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => !isDeleting && setShowDeleteConfirm(false)}
        size="sm"
        title="Delete this listing?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete permanently"}
            </Button>
          </>
        }
      >
        <p className="text-text-2 leading-relaxed">
          This will permanently remove it from the CMS and the live site. This cannot be undone.
        </p>
        {deleteError && (
          <p className="mt-3 text-xs text-danger-fg bg-danger-bg rounded-control px-3 py-2">
            {deleteError}
          </p>
        )}
      </Modal>

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
          checklistIsNew={checklist?.is_new ?? !isEditMode}
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
    </PageContainer>
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
          <div key="toggles" className="flex flex-wrap gap-8 py-1">
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
    // Sentence-case label (the SECTIONS config keeps its original Title Case strings)
    const label = FIELD_LABELS[key] || f.label;

    if (f.type === "select") {
      return (
        // Field = label + control + error message
        <Field key={key} label={label} required={f.required} error={hasError ? "Required" : undefined}>
          <Select
            value={value}
            onChange={(e) => updateField(key, e.target.value)}
            invalid={hasError}
          >
            <option value="">Select...</option>
            {f.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    }

    // Text or number input
    // Error priority: duplicate warnings first, then "Required"
    const errorText = isDupeName
      ? dupeNameWarn
      : isDupeSlug
        ? dupeSlugWarn
        : hasError
          ? "Required"
          : undefined;
    // Slug shows the public URL as a hint
    const hint = key === "slug" && !isDupeSlug && value ? `cre8advisors.com/listings/${value}` : undefined;

    return (
      <Field key={key} label={label} required={f.required} error={errorText} hint={hint}>
        <Input
          type="text"
          inputMode={f.type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => updateField(key, e.target.value)}
          placeholder={f.placeholder}
          invalid={!!(hasError || isDupeName || isDupeSlug)}
        />
      </Field>
    );
  }

  function renderBrokerField(f: FieldDef, idx: number) {
    const selected = (fields["listing-brokers"] as string[]) || [];
    const hasError = showError("listing-brokers");

    return (
      <div key={`brokers-${idx}`}>
        {/* Broker chips — soft green = selected (status), plain outline otherwise */}
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
                className={cn(
                  "flex items-center gap-2 h-control px-3 rounded-control border text-sm transition-colors",
                  isChecked
                    ? "border-accent bg-accent-soft text-text font-medium"
                    : "border-border text-text-2 hover:border-border-strong",
                  FOCUS_RING
                )}
              >
                {/* Checkbox indicator */}
                <span
                  className={cn(
                    "w-4 h-4 rounded-sm border flex items-center justify-center shrink-0",
                    isChecked ? "bg-accent border-accent text-black" : "border-border-strong"
                  )}
                >
                  {isChecked && <Check size={12} strokeWidth={2.5} />}
                </span>
                {name}
              </button>
            );
          })}
        </div>
        {hasError && (
          <p className="text-xs text-danger-fg mt-1.5">Select at least one broker</p>
        )}
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
        className={cn("flex items-center gap-2.5 select-none rounded-control", FOCUS_RING)}
      >
        {/* Toggle track — green when on (status) */}
        <span
          className={cn(
            "relative inline-block w-10 h-[22px] rounded-pill transition-colors duration-200",
            isOn ? "bg-accent" : "bg-border-strong"
          )}
        >
          {/* Toggle knob */}
          <span
            className={cn(
              "absolute left-0 top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200",
              isOn ? "translate-x-[20px]" : "translate-x-[2px]"
            )}
          />
        </span>
        <span className="text-sm text-text">{FIELD_LABELS[key] || f.label}</span>
      </button>
    );
  }
}
