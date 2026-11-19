"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { CANONICAL_CATEGORIES, isCanonicalCategory } from "@/lib/demand/categories";
import { DEAL_TYPE_FIELDS, FORMAT_FLAG_FIELDS, type DealFlagKey } from "@/lib/demand/deals";
import { readTypedNumber } from "@/lib/demand/number-input";
import type { DealFlags } from "@/lib/demand/types";
import type { ContactType } from "@/lib/demand/types";
import type { ContactView, DemandListTenant } from "@/lib/demand/view";

interface ContactDraft {
  id: string;
  contactType: ContactType;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
}

function draftFrom(contact: ContactView): ContactDraft {
  return {
    id: contact.id,
    contactType: contact.contactType,
    name: contact.name || "",
    company: contact.firmName || "",
    title: contact.title || "",
    email: contact.email || "",
    phone: contact.phone || "",
  };
}

function FlagChecks({
  fields,
  value,
  onChange,
}: {
  fields: { key: DealFlagKey; label: string }[];
  value: DealFlags;
  onChange: (next: DealFlags) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {fields.map((field) => (
        <label key={field.key} className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={value[field.key] === true}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.checked })}
          />
          {field.label}
        </label>
      ))}
    </div>
  );
}

function flagsOf(tenant: DemandListTenant): DealFlags {
  return {
    dealLease: tenant.dealLease,
    dealBuy: tenant.dealBuy,
    dealGroundLease: tenant.dealGroundLease,
    dealBts: tenant.dealBts,
    freestanding: tenant.freestanding,
    inline: tenant.inline,
    dealTypesSource: tenant.dealTypesSource,
    dealTypesConfidence: tenant.dealTypesConfidence,
  };
}

/** One editor for the tenant, its deal types, spacing, size, and contacts. */
export default function TenantEditModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: DemandListTenant | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sfMin, setSfMin] = useState("");
  const [sfMax, setSfMax] = useState("");
  const [acresMin, setAcresMin] = useState("");
  const [acresMax, setAcresMax] = useState("");
  const [spacing, setSpacing] = useState("");
  const [flags, setFlags] = useState<DealFlags | null>(null);
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.brandName);
    setCategory(tenant.category);
    setSfMin(tenant.sfMin == null ? "" : String(tenant.sfMin));
    setSfMax(tenant.sfMax == null ? "" : String(tenant.sfMax));
    setAcresMin(tenant.acresMin == null ? "" : String(tenant.acresMin));
    setAcresMax(tenant.acresMax == null ? "" : String(tenant.acresMax));
    setSpacing(tenant.spacingMiles == null ? "" : String(tenant.spacingMiles));
    setFlags(flagsOf(tenant));
    setContacts(tenant.contacts.map(draftFrom));
  }, [tenant]);

  const categories = !category || isCanonicalCategory(category) ? [...CANONICAL_CATEGORIES] : [category, ...CANONICAL_CATEGORIES];

  function patchContact(id: string, next: Partial<ContactDraft>) {
    setContacts((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  async function save() {
    if (!tenant || !flags) return;

    // Read every number box first. "2,500" and "3 mi" are accepted; anything
    // that isn't a number stops the save, so a typo can never wipe a value.
    const boxes = [
      { label: "SF min", text: sfMin },
      { label: "SF max", text: sfMax },
      { label: "Acres min", text: acresMin },
      { label: "Acres max", text: acresMax },
      { label: "Site spacing", text: spacing },
    ].map((box) => ({ ...box, ...readTypedNumber(box.text) }));
    const bad = boxes.find((box) => !box.ok);
    if (bad) {
      toast.error(`${bad.label}: "${bad.text.trim()}" isn't a number. Nothing was saved.`);
      return;
    }
    const [sfMinValue, sfMaxValue, acresMinValue, acresMaxValue, spacingValue] = boxes.map((box) => box.value);

    setSaving(true);
    try {
      const res = await apiFetch(`/api/demand/tenants/${tenant.id}/editor`, {
        method: "PATCH",
        body: JSON.stringify({
          brandName: name,
          category,
          sfMin: sfMinValue,
          sfMax: sfMaxValue,
          acresMin: acresMinValue,
          acresMax: acresMaxValue,
          spacingMiles: spacingValue,
          ...flags,
          contacts: contacts.map((row) => ({
            id: row.id,
            contactType: row.contactType,
            name: row.name,
            company: row.company || null,
            title: row.title || null,
            email: row.email || null,
            phone: row.phone || null,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not save");
      toast.success("Saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      title={name || "Edit tenant"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      {flags && (
        <div className="space-y-4">
          <Field label="Tenant name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Tenant name" />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
              {categories.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </Field>
          <Field label="Size">
            <div className="grid grid-cols-2 gap-2">
              <Input small aria-label="SF min" placeholder="SF min" value={sfMin} onChange={(event) => setSfMin(event.target.value)} />
              <Input small aria-label="SF max" placeholder="SF max" value={sfMax} onChange={(event) => setSfMax(event.target.value)} />
              <Input small aria-label="Acres min" placeholder="Acres min" value={acresMin} onChange={(event) => setAcresMin(event.target.value)} />
              <Input small aria-label="Acres max" placeholder="Acres max" value={acresMax} onChange={(event) => setAcresMax(event.target.value)} />
            </div>
          </Field>
          <Field label="Deal types">
            <FlagChecks fields={DEAL_TYPE_FIELDS} value={flags} onChange={setFlags} />
          </Field>
          <Field label="Formats">
            <FlagChecks fields={FORMAT_FLAG_FIELDS} value={flags} onChange={setFlags} />
          </Field>
          <Field label="Site spacing" hint="Miles between stores.">
            <Input aria-label="Site spacing" placeholder="Miles" value={spacing} onChange={(event) => setSpacing(event.target.value)} />
          </Field>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-text mb-3">Contacts</p>
            {contacts.length === 0 && <p className="text-sm text-text-2">No contacts on file.</p>}
            <div className="space-y-3">
              {contacts.map((row) => (
                <div key={row.id} className="border border-border rounded-card p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      small
                      aria-label="Contact type"
                      value={row.contactType}
                      onChange={(event) => patchContact(row.id, { contactType: event.target.value === "in_house" ? "in_house" : "broker" })}
                    >
                      <option value="broker">Broker</option>
                      <option value="in_house">In-house</option>
                    </Select>
                    <Input small aria-label="Name" placeholder="Name" value={row.name} onChange={(event) => patchContact(row.id, { name: event.target.value })} />
                    <Input small aria-label="Company" placeholder="Company" value={row.company} onChange={(event) => patchContact(row.id, { company: event.target.value })} />
                    <Input small aria-label="Phone" placeholder="Phone" value={row.phone} onChange={(event) => patchContact(row.id, { phone: event.target.value })} />
                  </div>
                  <div className="mt-2">
                    <Input small aria-label="Email" placeholder="Email" value={row.email} onChange={(event) => patchContact(row.id, { email: event.target.value })} />
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setContacts((current) => current.filter((item) => item.id !== row.id))}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              icon={<Plus size={14} strokeWidth={1.75} />}
              onClick={() =>
                setContacts((current) => [
                  ...current,
                  { id: `new-${Date.now()}`, contactType: "broker", name: "", company: "", title: "", email: "", phone: "" },
                ])
              }
            >
              Add contact
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
