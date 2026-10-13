"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Button, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { LOGO_CATEGORIES, type BrandLogo } from "@/lib/logos";

interface AddLogoModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (logo: BrandLogo) => void;
}

/**
 * Staff upload. The file goes to /api/logos, which uses the service role.
 * The browser never receives a key that can write to storage.
 */
export default function AddLogoModal({ open, onClose, onCreated }: AddLogoModalProps) {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const toast = useToast();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [aliases, setAliases] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (open) return;
    setName("");
    setCategory("");
    setAliases("");
    setFile(null);
    setError(null);
    setSaving(false);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a PNG");
      return;
    }
    if (file.type && file.type !== "image/png") {
      setError("File must be a PNG");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.set("name", name);
      body.set("category", category);
      body.set("aliases", aliases);
      body.set("file", file);
      const res = await fetch("/api/logos", {
        method: "POST",
        headers: { "x-user-email": userEmail },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onCreated(data as BrandLogo);
      toast.success("Logo added", { description: data.name });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add logo"
      description="Uploads a transparent PNG into the library. This is the color version."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="add-logo-form" loading={saving}>
            Add logo
          </Button>
        </>
      }
    >
      <form id="add-logo-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" required htmlFor="logo-name">
          <Input
            id="logo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dutch Bros"
            required
            autoFocus
          />
        </Field>

        <Field label="Category" required htmlFor="logo-category">
          <Select
            id="logo-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a category
            </option>
            {LOGO_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Aliases" htmlFor="logo-aliases" hint="Comma-separated. Search matches these too.">
          <Input
            id="logo-aliases"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="Dutch Bros Coffee, DB"
          />
        </Field>

        <Field label="PNG file" required htmlFor="logo-file" hint="Transparent background. Up to 8 MB.">
          <Input
            id="logo-file"
            type="file"
            accept="image/png,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>

        {preview && (
          <div className="logo-checker h-28 rounded-control border border-border">
            {/* Preview only — the library card is the one that stays a plain full-res img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-full w-full object-contain" />
          </div>
        )}

        {error && <p className="text-xs text-danger-fg">{error}</p>}
      </form>
    </Modal>
  );
}
