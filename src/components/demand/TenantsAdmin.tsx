"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  Button,
  Card,
  Field,
  Input,
  LoadingBlock,
  Select,
  SlideOver,
  Tabs,
  Textarea,
  useConfirm,
  useToast,
  cn,
  FOCUS_RING,
} from "@/components/ui";
import { FORMATS } from "@/lib/demand/types";
import type { CatalogResponse, CategoryAdminView, TenantAdminView, TierAdminView } from "@/lib/demand/view";

type AdminTab = "tenants" | "firms" | "categories" | "tiers" | "import";

const EMPTY_TENANT: TenantAdminView = {
  id: "",
  brandName: "",
  category: "other",
  subcategory: null,
  formats: [],
  sfMin: null,
  sfMax: null,
  acresMin: null,
  acresMax: null,
  tierIds: [],
  driveThruRequired: null,
  azMarkets: [],
  spacingMiles: null,
  requirementSource: null,
  requirementDate: null,
  notes: null,
  active: true,
  contacts: [],
  relationships: [],
};

export default function TenantsAdmin() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<AdminTab>("tenants");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TenantAdminView | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/demand/catalog");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load tenants");
      setCatalog(body as CatalogResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenants");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tenants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.tenants || []).filter((tenant) => !q || `${tenant.brandName} ${tenant.category}`.toLowerCase().includes(q));
  }, [catalog, query]);

  async function saveTenant() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await apiFetch(editing.id ? `/api/demand/tenants/${editing.id}` : "/api/demand/tenants", {
        method: editing.id ? "PATCH" : "POST",
        body: JSON.stringify(editing),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not save");
      toast.success("Saved");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function removeTenant() {
    if (!editing?.id) return;
    const ok = await confirm({ title: `Delete ${editing.brandName}?`, tone: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await apiFetch(`/api/demand/tenants/${editing.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || "Could not delete");
      return;
    }
    setEditing(null);
    await load();
  }

  if (!catalog && !error) return <LoadingBlock message="Loading tenants" />;
  if (error) {
    return (
      <Card>
        <p className="text-sm text-danger-fg">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={load}>Try again</Button>
      </Card>
    );
  }

  return (
    <div>
      <Tabs
        items={[
          { value: "tenants", label: "Tenants" },
          { value: "firms", label: "Firms" },
          { value: "categories", label: "Categories" },
          { value: "tiers", label: "Size tiers" },
          { value: "import", label: "Import" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        {tab === "tenants" && catalog && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-64">
                <Input small value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tenants" aria-label="Search tenants" />
              </div>
              <Button size="sm" onClick={() => setEditing({ ...EMPTY_TENANT, category: catalog.categories[0]?.category || "other" })}>Add tenant</Button>
            </div>
            <Card padding="none">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => setEditing(tenant)}
                  className={cn("w-full text-left px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-2/60", FOCUS_RING)}
                >
                  <p className="text-sm font-medium text-text">{tenant.brandName}</p>
                  <p className="text-xs text-text-3">{tenant.category}{tenant.active ? "" : " · inactive"}</p>
                </button>
              ))}
            </Card>
          </>
        )}
        {tab === "firms" && catalog && <Firms catalog={catalog} onChanged={load} />}
        {tab === "categories" && catalog && <Categories catalog={catalog} onChanged={load} />}
        {tab === "tiers" && catalog && <Tiers catalog={catalog} onChanged={load} />}
        {tab === "import" && <Importer onChanged={load} />}
      </div>

      <SlideOver
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? editing.brandName : "New tenant"}
        width="lg"
        footer={
          <>
            {editing?.id && <Button variant="danger" size="sm" onClick={removeTenant}>Delete</Button>}
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" loading={saving} onClick={saveTenant}>Save</Button>
          </>
        }
      >
        {editing && catalog && <TenantForm tenant={editing} catalog={catalog} onChange={setEditing} />}
      </SlideOver>
    </div>
  );
}

function TenantForm({
  tenant,
  catalog,
  onChange,
}: {
  tenant: TenantAdminView;
  catalog: CatalogResponse;
  onChange: (tenant: TenantAdminView) => void;
}) {
  const set = (patch: Partial<TenantAdminView>) => onChange({ ...tenant, ...patch });
  return (
    <div className="space-y-4">
      <Field label="Brand" required><Input value={tenant.brandName} onChange={(e) => set({ brandName: e.target.value })} /></Field>
      <Field label="Category">
        <Select value={tenant.category} onChange={(e) => set({ category: e.target.value })}>
          {catalog.categories.map((category) => (
            <option key={category.category} value={category.category}>{category.category}</option>
          ))}
        </Select>
      </Field>
      <Field label="Subcategory"><Input value={tenant.subcategory || ""} onChange={(e) => set({ subcategory: e.target.value || null })} /></Field>
      <Field label="Formats">
        <div className="grid grid-cols-2 gap-1">
          {FORMATS.map((format) => (
            <label key={format} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={tenant.formats.includes(format)}
                onChange={(e) =>
                  set({ formats: e.target.checked ? [...tenant.formats, format] : tenant.formats.filter((item) => item !== format) })
                }
              />
              {format}
            </label>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SF min"><Input type="number" value={tenant.sfMin ?? ""} onChange={(e) => set({ sfMin: num(e.target.value) })} /></Field>
        <Field label="SF max"><Input type="number" value={tenant.sfMax ?? ""} onChange={(e) => set({ sfMax: num(e.target.value) })} /></Field>
        <Field label="Acres min"><Input type="number" step="0.01" value={tenant.acresMin ?? ""} onChange={(e) => set({ acresMin: num(e.target.value) })} /></Field>
        <Field label="Acres max"><Input type="number" step="0.01" value={tenant.acresMax ?? ""} onChange={(e) => set({ acresMax: num(e.target.value) })} /></Field>
      </div>
      <Field label="Size tiers" hint="Used in addition to an exact range, and on their own when the range is blank.">
        <div className="grid grid-cols-2 gap-1">
          {catalog.tiers.map((tier) => (
            <label key={tier.id} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={tenant.tierIds.includes(tier.id)}
                onChange={(e) =>
                  set({ tierIds: e.target.checked ? [...tenant.tierIds, tier.id] : tenant.tierIds.filter((id) => id !== tier.id) })
                }
              />
              {tier.name}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Drive-thru">
        <Select
          value={tenant.driveThruRequired == null ? "" : tenant.driveThruRequired ? "yes" : "no"}
          onChange={(e) => set({ driveThruRequired: e.target.value === "" ? null : e.target.value === "yes" })}
        >
          <option value="">Use category default</option>
          <option value="yes">Required</option>
          <option value="no">Not required</option>
        </Select>
      </Field>
      <Field label="Arizona markets" hint="Separate cities with commas. Phoenix metro covers the Valley.">
        <Input value={tenant.azMarkets.join(", ")} onChange={(e) => set({ azMarkets: splitList(e.target.value) })} />
      </Field>
      <Field label="Spacing (miles)"><Input type="number" step="0.1" value={tenant.spacingMiles ?? ""} onChange={(e) => set({ spacingMiles: num(e.target.value) })} /></Field>
      <Field label="Notes"><Textarea value={tenant.notes || ""} onChange={(e) => set({ notes: e.target.value || null })} /></Field>
      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={tenant.active} onChange={(e) => set({ active: e.target.checked })} />
        Active
      </label>
      <div>
        <p className="text-sm font-medium text-text mb-2">Contacts</p>
        {tenant.contacts.map((contact, index) => (
          <div key={contact.id || index} className="grid grid-cols-2 gap-2 mb-3">
            <Select
              small
              value={contact.contactType}
              onChange={(e) => {
                const contacts = tenant.contacts.slice();
                contacts[index] = { ...contact, contactType: e.target.value === "broker" ? "broker" : "in_house" };
                set({ contacts });
              }}
            >
              <option value="broker">Broker</option>
              <option value="in_house">In-house</option>
            </Select>
            <Input small placeholder="Name" value={contact.name} onChange={(e) => patchContact(tenant, index, { name: e.target.value }, set)} />
            <Input small placeholder="Firm" value={contact.firmName || ""} onChange={(e) => patchContact(tenant, index, { firmName: e.target.value || null }, set)} />
            <Input small placeholder="Title" value={contact.title || ""} onChange={(e) => patchContact(tenant, index, { title: e.target.value || null }, set)} />
            <Input small placeholder="Email" value={contact.email || ""} onChange={(e) => patchContact(tenant, index, { email: e.target.value || null }, set)} />
            <Input small placeholder="Phone" value={contact.phone || ""} onChange={(e) => patchContact(tenant, index, { phone: e.target.value || null }, set)} />
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            set({
              contacts: [
                ...tenant.contacts,
                { id: "", contactType: "broker", name: "", title: null, firmName: null, email: null, phone: null, isPrimary: tenant.contacts.length === 0, confidence: null },
              ],
            })
          }
        >
          Add contact
        </Button>
      </div>
      <Field label="Relationships">
        {tenant.relationships.map((rel, index) => (
          <div key={rel.id || index} className="flex gap-2 mb-2">
            <Select
              small
              value={rel.relatedTenantId}
              onChange={(e) => {
                const relationships = tenant.relationships.slice();
                relationships[index] = { ...rel, relatedTenantId: e.target.value };
                set({ relationships });
              }}
            >
              <option value="">Tenant</option>
              {catalog.tenants.filter((item) => item.id !== tenant.id).map((item) => (
                <option key={item.id} value={item.id}>{item.brandName}</option>
              ))}
            </Select>
            <Select
              small
              value={rel.relation}
              onChange={(e) => {
                const relationships = tenant.relationships.slice();
                const relation = e.target.value === "similar" || e.target.value === "co_tenant" ? e.target.value : "competitor";
                relationships[index] = { ...rel, relation };
                set({ relationships });
              }}
            >
              <option value="competitor">Competitor</option>
              <option value="similar">Similar</option>
              <option value="co_tenant">Co-tenant</option>
            </Select>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => set({ relationships: [...tenant.relationships, { id: "", relatedTenantId: "", relation: "competitor" }] })}>
          Add relationship
        </Button>
      </Field>
    </div>
  );
}

function patchContact(
  tenant: TenantAdminView,
  index: number,
  patch: Partial<TenantAdminView["contacts"][number]>,
  set: (tenant: TenantAdminView) => void
) {
  const contacts = tenant.contacts.slice();
  contacts[index] = { ...contacts[index], ...patch };
  set({ ...tenant, contacts });
}

function Firms({ catalog, onChanged }: { catalog: CatalogResponse; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  async function add() {
    const res = await apiFetch("/api/demand/firms", { method: "POST", body: JSON.stringify({ name, website: website || null, notes: null }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "Could not add the firm");
      return;
    }
    setName("");
    setWebsite("");
    await onChanged();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input small className="w-56" placeholder="Firm name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Firm name" />
        <Input small className="w-56" placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} aria-label="Website" />
        <Button size="sm" onClick={add}>Add firm</Button>
      </div>
      <Card padding="none">
        {catalog.firms.map((firm) => (
          <div key={firm.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0">
            <div>
              <p className="text-sm font-medium text-text">{firm.name}</p>
              {firm.website && <p className="text-xs text-text-3">{firm.website}</p>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await apiFetch(`/api/demand/firms/${firm.id}`, { method: "DELETE" });
                await onChanged();
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Categories({ catalog, onChanged }: { catalog: CatalogResponse; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [current, setCurrent] = useState(catalog.categories[0]?.category || "");
  const [draft, setDraft] = useState<CategoryAdminView | null>(catalog.categories[0] || null);
  useEffect(() => {
    const next = catalog.categories.find((item) => item.category === current) || catalog.categories[0] || null;
    setDraft(next);
    if (next) setCurrent(next.category);
  }, [catalog, current]);
  if (!draft) return null;
  const set = (patch: Partial<CategoryAdminView>) => setDraft({ ...draft, ...patch });
  return (
    <Card>
      <Field label="Category">
        <Select value={draft.category} onChange={(e) => setCurrent(e.target.value)}>
          {catalog.categories.map((item) => (
            <option key={item.category} value={item.category}>{item.category}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Field label="SF min"><Input type="number" value={draft.sfMin ?? ""} onChange={(e) => set({ sfMin: num(e.target.value) })} /></Field>
        <Field label="SF max"><Input type="number" value={draft.sfMax ?? ""} onChange={(e) => set({ sfMax: num(e.target.value) })} /></Field>
        <Field label="Acres min"><Input type="number" step="0.01" value={draft.acresMin ?? ""} onChange={(e) => set({ acresMin: num(e.target.value) })} /></Field>
        <Field label="Acres max"><Input type="number" step="0.01" value={draft.acresMax ?? ""} onChange={(e) => set({ acresMax: num(e.target.value) })} /></Field>
      </div>
      <Field label="Tiers" className="mt-4">
        <div className="grid grid-cols-2 gap-1">
          {catalog.tiers.map((tier) => (
            <label key={tier.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.tierIds.includes(tier.id)}
                onChange={(e) =>
                  set({ tierIds: e.target.checked ? [...draft.tierIds, tier.id] : draft.tierIds.filter((id) => id !== tier.id) })
                }
              />
              {tier.name}
            </label>
          ))}
        </div>
      </Field>
      <Button
        className="mt-4"
        size="sm"
        onClick={async () => {
          const res = await apiFetch("/api/demand/reference", { method: "PUT", body: JSON.stringify({ categories: [draft] }) });
          const body = await res.json().catch(() => null);
          if (!res.ok) toast.error(body?.error || "Could not save");
          else {
            toast.success("Saved");
            await onChanged();
          }
        }}
      >
        Save category
      </Button>
    </Card>
  );
}

function Tiers({ catalog, onChanged }: { catalog: CatalogResponse; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [rows, setRows] = useState<TierAdminView[]>(catalog.tiers);
  useEffect(() => setRows(catalog.tiers), [catalog]);
  function update(index: number, patch: Partial<TierAdminView>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  return (
    <Card>
      <p className="text-sm text-text-2 mb-3">The upper number is not included. 1.5 ac belongs to the tier that starts at 1.5.</p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id || index} className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Input small aria-label="Tier name" value={row.name} onChange={(e) => update(index, { name: e.target.value })} />
            <Select small aria-label="Kind" value={row.kind} onChange={(e) => update(index, { kind: e.target.value === "acres" ? "acres" : "sf" })}>
              <option value="sf">SF</option>
              <option value="acres">Acres</option>
            </Select>
            <Input small aria-label="Min" type="number" step="0.1" placeholder="Min" value={row.minValue ?? ""} onChange={(e) => update(index, { minValue: num(e.target.value) })} />
            <Input small aria-label="Max" type="number" step="0.1" placeholder="Max" value={row.maxValue ?? ""} onChange={(e) => update(index, { maxValue: num(e.target.value) })} />
            <Button variant="ghost" size="sm" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove</Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="secondary" size="sm" onClick={() => setRows((current) => [...current, { id: "", name: "", kind: "sf", minValue: null, maxValue: null, sortOrder: (current.at(-1)?.sortOrder || 0) + 10 }])}>
          Add tier
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const res = await apiFetch("/api/demand/reference", { method: "PUT", body: JSON.stringify({ tiers: rows }) });
            const body = await res.json().catch(() => null);
            if (!res.ok) toast.error(body?.error || "Could not save tiers");
            else {
              toast.success("Saved");
              await onChanged();
            }
          }}
        >
          Save tiers
        </Button>
      </div>
    </Card>
  );
}

function Importer({ onChanged }: { onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [kind, setKind] = useState<"tenants" | "contacts">("tenants");
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card>
      <Field label="File">
        <Select small value={kind} onChange={(e) => setKind(e.target.value === "contacts" ? "contacts" : "tenants")}>
          <option value="tenants">Tenants</option>
          <option value="contacts">Contacts</option>
        </Select>
      </Field>
      <Field label="CSV" className="mt-3" hint="Pipe-separated lists. Quote any cell that contains a comma.">
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Paste CSV, or choose a file" />
      </Field>
      <div className="flex items-center gap-2 mt-3">
        <label className={cn("inline-flex items-center h-control-sm px-3 rounded-control border border-border text-sm cursor-pointer", FOCUS_RING)}>
          Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setCsv(await file.text());
            }}
          />
        </label>
        <Button
          size="sm"
          onClick={async () => {
            const res = await apiFetch("/api/demand/import", { method: "POST", body: JSON.stringify({ kind, csv }) });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
              toast.error(body?.error || "Import failed");
              return;
            }
            const errors = (body.errors || []).map((item: { row: number; message: string }) => `Row ${item.row}: ${item.message}`);
            setMessage(`Added ${body.created}, updated ${body.updated}.${errors.length ? ` ${errors.join(" ")}` : ""}`);
            await onChanged();
          }}
        >
          Import
        </Button>
      </div>
      {message && <p className="text-sm text-text-2 mt-3">{message}</p>}
    </Card>
  );
}

function num(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
