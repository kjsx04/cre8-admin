"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Copy, Download, ImageOff, Plus, Search } from "lucide-react";
import AddLogoModal from "@/components/logos/AddLogoModal";
import {
  Button,
  Card,
  EmptyState,
  Input,
  LoadingBlock,
  PageContainer,
  PageHeader,
  useToast,
  cn,
  FOCUS_RING,
} from "@/components/ui";
import { copyLogoPng, downloadLogoPng } from "@/lib/logo-actions";
import {
  LOGO_CATEGORIES,
  PRIMARY_VARIANT,
  listVariants,
  logoDownloadUrl,
  logoFileName,
  logoMatchesQuery,
  variantLabel,
  type BrandLogo,
} from "@/lib/logos";

export default function LogosPage() {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";
  const toast = useToast();

  const [logos, setLogos] = useState<BrandLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/logos", {
        headers: { "x-user-email": userEmail },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load logos");
      setLogos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logos");
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return logos.filter((logo) => {
      if (category !== "All" && logo.category !== category) return false;
      return logoMatchesQuery(logo, query);
    });
  }, [logos, category, query]);

  async function onDownload(logo: BrandLogo, url: string, variant: string) {
    const key = `${logo.id}:download`;
    setBusy(key);
    try {
      const filename = logoFileName(logo.slug, variant, url);
      await downloadLogoPng(url, filename);
      toast.success("Downloaded", { description: filename });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function onCopy(logo: BrandLogo, url: string) {
    const key = `${logo.id}:copy`;
    setBusy(key);
    try {
      await copyLogoPng(url);
      toast.success("Copied PNG");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Logos"
        description="Drag a logo into Photoshop — it drops the full-size transparent PNG."
        actions={
          <Button icon={<Plus size={18} strokeWidth={1.75} />} onClick={() => setAddOpen(true)}>
            Add logo
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
            <Input
              small
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or alias"
              aria-label="Search logos"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
            {["All", ...LOGO_CATEGORIES].map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "h-8 px-3 inline-flex items-center rounded-control text-sm font-medium transition-colors duration-150",
                    active ? "bg-ink text-white" : "bg-surface border border-border text-text-2 hover:text-text hover:border-border-strong",
                    FOCUS_RING
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </PageHeader>

      {loading && <LoadingBlock message="Loading logos" />}

      {!loading && error && (
        <Card>
          <p className="text-sm text-danger-fg">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<ImageOff size={20} />}
          title={logos.length === 0 ? "No logos yet" : "No logos match"}
          description={logos.length === 0 ? "Add the first transparent PNG." : "Try another name, alias, or category."}
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-xs text-text-3 mb-3">
            {filtered.length === logos.length ? `${logos.length} logos` : `${filtered.length} of ${logos.length}`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {filtered.map((logo) => (
              <LogoCard
                key={logo.id}
                logo={logo}
                busy={busy}
                onDownload={onDownload}
                onCopy={onCopy}
              />
            ))}
          </div>
        </>
      )}

      <AddLogoModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(logo) => setLogos((prev) => [...prev, logo].sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </PageContainer>
  );
}

function LogoCard({
  logo,
  busy,
  onDownload,
  onCopy,
}: {
  logo: BrandLogo;
  busy: string | null;
  onDownload: (logo: BrandLogo, url: string, variant: string) => void;
  onCopy: (logo: BrandLogo, url: string) => void;
}) {
  const options = listVariants(logo.variants);
  const [variant, setVariant] = useState(
    options.some((option) => option.key === PRIMARY_VARIANT) ? PRIMARY_VARIANT : options[0]?.key ?? PRIMARY_VARIANT
  );
  const selected = options.find((option) => option.key === variant) ?? options[0] ?? null;
  const url = selected?.url ?? null;
  const filename = url ? logoFileName(logo.slug, selected.key, url) : null;

  return (
    <Card padding="none" className="overflow-hidden flex flex-col">
      <div className="logo-checker h-28 border-b border-border">
        {url ? (
          // Plain <img>, not next/image: the drag source has to be this full-res PNG URL
          // so Photoshop receives the transparent file instead of a resized preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`${logo.name} ${variantLabel(selected.key)}`}
            draggable
            data-logo-slug={logo.slug}
            data-logo-variant={selected.key}
            title={`Drag ${logo.name} into Photoshop`}
            className="h-full w-full object-contain"
            onDragStart={(event) => {
              try {
                event.dataTransfer.setData("DownloadURL", logoDownloadUrl(url, filename!));
                event.dataTransfer.effectAllowed = "copy";
              } catch {
                // Native image drag still carries the PNG URL.
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-text-3 px-2 text-center">No image</div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text truncate" title={logo.name}>
            {logo.name}
          </p>
          <p className="text-xs text-text-3 truncate">{logo.category}</p>
        </div>
        {options.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${logo.name} variants`}>
            {options.map((option) => {
              const active = option.key === selected?.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setVariant(option.key)}
                  className={cn(
                    "h-6 px-2 inline-flex items-center rounded-pill text-xs font-medium transition-colors duration-150",
                    active ? "bg-ink text-white" : "bg-surface-2 text-text-2 hover:text-text",
                    FOCUS_RING
                  )}
                >
                  {variantLabel(option.key)}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 mt-auto">
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} strokeWidth={1.75} />}
            disabled={!url}
            loading={busy === `${logo.id}:download`}
            onClick={() => url && selected && onDownload(logo, url, selected.key)}
          >
            Download
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy size={14} strokeWidth={1.75} />}
            disabled={!url}
            loading={busy === `${logo.id}:copy`}
            onClick={() => url && onCopy(logo, url)}
          >
            Copy
          </Button>
        </div>
      </div>
    </Card>
  );
}
