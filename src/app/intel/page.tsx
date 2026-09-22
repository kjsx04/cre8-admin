"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  PageContainer,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  Tone,
  cn,
} from "@/components/ui";

/**
 * /intel — Market Intel approval queue.
 * Morning workflow: review pending briefs, approve/edit/delete.
 * Tabs: Pending | Needs Text | Live | Deleted
 *
 * "Needs Text" tab: paywalled articles where GPT only saw the headline.
 * Kevin pastes the article text → GPT generates the full brief → moves to Pending.
 *
 * Manual submit: paste any article at the top to create a brief from scratch.
 */

/* ── Types ── */
interface Brief {
  id: string;
  title: string;
  slug: string;
  summary: string;
  impact: string;
  category: string;
  tags: string[];
  source_name: string | null;
  source_url: string | null;
  source_date: string | null;
  status: "pending" | "live" | "deleted" | "needs_text";
  relevance_score: number;
  original_headline: string | null;
  original_summary: string | null;
  original_impact: string | null;
  was_edited: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/* ── Tab config ── */
const TABS = [
  { label: "Pending", status: "pending" },
  { label: "Needs text", status: "needs_text" },
  { label: "Live", status: "live" },
  { label: "Deleted", status: "deleted" },
];

/* ── Category → Badge tone (design-system tones instead of raw palette colors) ── */
const CATEGORY_TONES: Record<string, Tone> = {
  "data-center": "info",
  retail: "success",
  land: "warning",
  market: "neutral",
  infrastructure: "accent",
};

/* ── Format date ── */
function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function IntelPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Brief>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  /* ── Manual submit state ── */
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualHeadline, setManualHeadline] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  /* ── Paste text state (for needs_text briefs) ── */
  const [pasteTextId, setPasteTextId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  /* ── Tab counts (fetched separately so badges always show) ── */
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  /* ── Fetch tab counts ── */
  const fetchTabCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    for (const tab of TABS) {
      try {
        const res = await fetch(`/api/intel?status=${tab.status}&limit=200`);
        const data = await res.json();
        counts[tab.status] = Array.isArray(data) ? data.length : 0;
      } catch {
        counts[tab.status] = 0;
      }
    }
    setTabCounts(counts);
  }, []);

  /* ── Fetch briefs ── */
  const fetchBriefs = useCallback(async () => {
    setLoading(true);
    try {
      const status = TABS[activeTab].status;
      const res = await fetch(`/api/intel?status=${status}`);
      const data = await res.json();
      setBriefs(Array.isArray(data) ? data : []);
    } catch {
      setBriefs([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchBriefs();
    fetchTabCounts();
  }, [fetchBriefs, fetchTabCounts]);

  /* ── Approve a brief (pending → live) ── */
  const handleApprove = async (id: string) => {
    setSaving(id);
    try {
      await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "live" }),
      });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      fetchTabCounts();
    } finally {
      setSaving(null);
    }
  };

  /* ── Soft-delete a brief ── */
  const handleDelete = async (id: string) => {
    setSaving(id);
    try {
      await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "deleted" }),
      });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      fetchTabCounts();
    } finally {
      setSaving(null);
    }
  };

  /* ── Restore a deleted brief back to pending ── */
  const handleRestore = async (id: string) => {
    setSaving(id);
    try {
      await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "pending" }),
      });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      fetchTabCounts();
    } finally {
      setSaving(null);
    }
  };

  /* ── Unpublish a live brief back to pending ── */
  const handleUnpublish = async (id: string) => {
    setSaving(id);
    try {
      await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "pending", published_at: null }),
      });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      fetchTabCounts();
    } finally {
      setSaving(null);
    }
  };

  /* ── Start editing a brief ── */
  const startEditing = (brief: Brief) => {
    setEditingId(brief.id);
    setEditForm({
      title: brief.title,
      summary: brief.summary,
      impact: brief.impact,
      category: brief.category,
      tags: brief.tags,
    });
  };

  /* ── Save edits ── */
  const saveEdits = async (id: string) => {
    setSaving(id);
    try {
      const res = await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editForm }),
      });
      const updated = await res.json();
      setBriefs((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
      setEditingId(null);
    } finally {
      setSaving(null);
    }
  };

  /* ── Save + approve in one action ── */
  const saveAndApprove = async (id: string) => {
    setSaving(id);
    try {
      await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ...editForm,
          status: "live",
          published_at: new Date().toISOString(),
        }),
      });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      setEditingId(null);
      fetchTabCounts();
    } finally {
      setSaving(null);
    }
  };

  /* ── Process pasted text for a needs_text brief ── */
  const handleProcessText = async (id: string) => {
    if (!pasteText.trim()) return;
    setProcessing(id);
    try {
      const res = await fetch("/api/intel/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text: pasteText }),
      });
      if (res.ok) {
        /* Brief moved to pending — remove from needs_text list */
        setBriefs((prev) => prev.filter((b) => b.id !== id));
        setPasteTextId(null);
        setPasteText("");
        fetchTabCounts();
      }
    } finally {
      setProcessing(null);
    }
  };

  /* ── Manual article submission ── */
  const handleManualSubmit = async () => {
    if (!manualText.trim()) return;
    setManualSubmitting(true);
    try {
      const res = await fetch("/api/intel/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: manualHeadline || null,
          text: manualText,
        }),
      });
      if (res.ok) {
        setManualHeadline("");
        setManualText("");
        setShowManualForm(false);
        /* Refresh if on pending tab */
        if (activeTab === 0) fetchBriefs();
        fetchTabCounts();
      }
    } finally {
      setManualSubmitting(false);
    }
  };

  /* ── Filtered briefs ── */
  const filteredBriefs =
    categoryFilter === "all"
      ? briefs
      : briefs.filter((b) => b.category === categoryFilter);

  /* ── Count by category for filter badges ── */
  const categoryCounts = briefs.reduce<Record<string, number>>((acc, b) => {
    acc[b.category] = (acc[b.category] || 0) + 1;
    return acc;
  }, {});

  /* ── Tab items for the Tabs primitive (counts only for pending / needs_text, as before) ── */
  const tabItems = TABS.map((tab) => ({
    value: tab.status,
    label: tab.label,
    count:
      (tab.status === "needs_text" || tab.status === "pending") && (tabCounts[tab.status] || 0) > 0
        ? tabCounts[tab.status]
        : undefined,
  }));

  return (
    <AppShell>
      {/* Shared page wrapper + header */}
      <PageContainer width="default">
        <PageHeader
          title="Market Intel"
          description="Review, edit, and approve news briefs before they go live."
          actions={
            <Button
              variant={showManualForm ? "secondary" : "primary"}
              onClick={() => setShowManualForm(!showManualForm)}
              icon={showManualForm ? <X size={18} strokeWidth={1.75} /> : <Plus size={18} strokeWidth={1.75} />}
            >
              {showManualForm ? "Cancel" : "Submit article"}
            </Button>
          }
        >
          {/* Status tabs */}
          <Tabs
            items={tabItems}
            value={TABS[activeTab].status}
            onChange={(status) => {
              const i = TABS.findIndex((t) => t.status === status);
              setActiveTab(i);
              setEditingId(null);
              setCategoryFilter("all");
              setPasteTextId(null);
            }}
          />
        </PageHeader>

        {/* Manual submit form — collapsible */}
        {showManualForm && (
          <Card className="mb-6">
            <h3 className="text-md font-semibold text-text mb-4">
              Paste an article to generate a brief
            </h3>
            <div className="space-y-4">
              <Field label="Headline" action="Optional">
                <Input
                  type="text"
                  value={manualHeadline}
                  onChange={(e) => setManualHeadline(e.target.value)}
                  placeholder="Article headline (optional)"
                />
              </Field>
              <Field label="Article text">
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Paste the full article text here..."
                  rows={6}
                />
              </Field>
              <Button
                onClick={handleManualSubmit}
                disabled={!manualText.trim() || manualSubmitting}
                loading={manualSubmitting}
              >
                {manualSubmitting ? "Processing..." : "Generate brief"}
              </Button>
            </div>
          </Card>
        )}

        {/* Category filter chips (not shown on needs_text tab) — selected chip is black (action) */}
        {briefs.length > 0 && TABS[activeTab].status !== "needs_text" && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <Button
              size="sm"
              variant={categoryFilter === "all" ? "primary" : "secondary"}
              onClick={() => setCategoryFilter("all")}
            >
              All ({briefs.length})
            </Button>
            {Object.entries(categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <Button
                  key={cat}
                  size="sm"
                  variant={categoryFilter === cat ? "primary" : "secondary"}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
                  className="capitalize"
                >
                  {cat.replace("-", " ")} ({count})
                </Button>
              ))}
          </div>
        )}

        {/* Loading state */}
        {loading && <LoadingBlock />}

        {/* Empty state */}
        {!loading && filteredBriefs.length === 0 && (
          <EmptyState
            title={
              TABS[activeTab].status === "pending"
                ? "No pending briefs"
                : TABS[activeTab].status === "needs_text"
                  ? "No articles waiting for text"
                  : TABS[activeTab].status === "live"
                    ? "No live briefs yet"
                    : "No deleted briefs"
            }
            description={
              TABS[activeTab].status === "pending"
                ? "Check back tomorrow morning."
                : TABS[activeTab].status === "needs_text"
                  ? "All caught up."
                  : TABS[activeTab].status === "live"
                    ? "Approve some from the Pending tab."
                    : undefined
            }
          />
        )}

        {/* Brief cards */}
        {!loading && (
          <div className="space-y-4">
            {filteredBriefs.map((brief) => {
              const isEditing = editingId === brief.id;
              const isSaving = saving === brief.id;
              const isNeedsText = brief.status === "needs_text";
              const isPasting = pasteTextId === brief.id;
              const isProcessing = processing === brief.id;

              return (
                <Card
                  key={brief.id}
                  // Needs-text briefs get a warning-tinted border so they stand out
                  className={cn(isNeedsText && "border-warning-fg/40")}
                >
                  {/* Row 1: Title + category badge */}
                  <div className="flex items-start gap-3 mb-2">
                    {isEditing ? (
                      <Field className="flex-1">
                        <Input
                          type="text"
                          value={editForm.title || ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          className="font-semibold text-md"
                        />
                      </Field>
                    ) : (
                      <h3 className="flex-1 text-md font-semibold text-text leading-snug">
                        {brief.title}
                      </h3>
                    )}
                    {/* Category badge + relevance score */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isNeedsText && <Badge tone="warning">Needs text</Badge>}
                      {isEditing ? (
                        <Select
                          small
                          value={editForm.category || ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                          className="w-40"
                        >
                          <option value="data-center">Data Center</option>
                          <option value="retail">Retail</option>
                          <option value="land">Land</option>
                          <option value="market">Market</option>
                          <option value="infrastructure">Infrastructure</option>
                        </Select>
                      ) : (
                        <Badge tone={CATEGORY_TONES[brief.category] || "neutral"} className="capitalize">
                          {brief.category.replace("-", " ")}
                        </Badge>
                      )}
                      {/* Relevance score — green / amber / red by threshold */}
                      <Badge
                        tone={
                          brief.relevance_score >= 70
                            ? "success"
                            : brief.relevance_score >= 40
                              ? "warning"
                              : "danger"
                        }
                        title="Relevance score"
                      >
                        {brief.relevance_score}
                      </Badge>
                    </div>
                  </div>

                  {/* Row 2: Date · Source · link to article */}
                  <div className="flex items-center gap-2 mb-4 text-xs text-text-2 flex-wrap">
                    <span>{formatShortDate(brief.source_date || brief.created_at)}</span>
                    {brief.source_name && (
                      <>
                        <span className="text-text-3">·</span>
                        <span>{brief.source_name}</span>
                      </>
                    )}
                    {brief.source_url && (
                      <>
                        <span className="text-text-3">·</span>
                        <a
                          href={brief.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-info-fg hover:underline transition-colors"
                        >
                          Source
                          <ExternalLink size={12} strokeWidth={1.75} />
                        </a>
                      </>
                    )}
                    {/* Tags inline */}
                    {brief.tags.length > 0 && (
                      <>
                        <span className="text-text-3">·</span>
                        {isEditing ? (
                          <Field className="flex-1 min-w-[200px]">
                            <Input
                              type="text"
                              small
                              value={(editForm.tags || []).join(", ")}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                                }))
                              }
                              placeholder="Tags (comma-separated)"
                            />
                          </Field>
                        ) : (
                          <span className="text-text-3">
                            {brief.tags.join(", ")}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── NEEDS TEXT: show paste area instead of summary/impact ── */}
                  {isNeedsText ? (
                    <div className="mb-4">
                      {isPasting ? (
                        <div className="space-y-4">
                          <p className="text-xs text-text-2">
                            Open the source article, copy the text, and paste it below. GPT will generate the full brief.
                          </p>
                          <Field label="Article text">
                            <Textarea
                              value={pasteText}
                              onChange={(e) => setPasteText(e.target.value)}
                              placeholder="Paste the full article text here..."
                              rows={6}
                              className="text-sm leading-relaxed"
                              autoFocus
                            />
                          </Field>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleProcessText(brief.id)}
                              disabled={!pasteText.trim() || isProcessing}
                              loading={isProcessing}
                            >
                              {isProcessing ? "Processing..." : "Generate brief"}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setPasteTextId(null);
                                setPasteText("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-warning-bg rounded-control px-4 py-3">
                          <p className="text-sm text-warning-fg">
                            Headline only — article text needed for full brief.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Summary — What Happened */}
                      <div className="mb-4">
                        {isEditing ? (
                          <Field label="What happened">
                            <Textarea
                              value={editForm.summary || ""}
                              onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))}
                              rows={4}
                              className="text-sm leading-relaxed"
                            />
                          </Field>
                        ) : (
                          <>
                            <span className="text-xs font-medium text-text-3 block mb-1.5">
                              What happened
                            </span>
                            <p className="text-sm text-text-2 leading-relaxed">
                              {brief.summary}
                            </p>
                          </>
                        )}
                      </div>

                      {/* Impact — What This Means (green rule = the "so what" callout) */}
                      <div className="mb-5 border-l-2 border-accent/40 pl-4">
                        {isEditing ? (
                          <Field label="What this means">
                            <Textarea
                              value={editForm.impact || ""}
                              onChange={(e) => setEditForm((f) => ({ ...f, impact: e.target.value }))}
                              rows={4}
                              className="text-sm leading-relaxed"
                            />
                          </Field>
                        ) : (
                          <>
                            <span className="text-xs font-medium text-accent-strong block mb-1.5">
                              What this means
                            </span>
                            <p className="text-sm text-text-2 leading-relaxed">
                              {brief.impact}
                            </p>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t border-border mt-1 pt-4">
                    {isEditing ? (
                      <>
                        <Button onClick={() => saveAndApprove(brief.id)} disabled={isSaving} loading={isSaving}>
                          Save & approve
                        </Button>
                        <Button variant="secondary" onClick={() => saveEdits(brief.id)} disabled={isSaving}>
                          Save draft
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {/* Pending tab actions */}
                        {TABS[activeTab].status === "pending" && (
                          <>
                            <Button onClick={() => handleApprove(brief.id)} disabled={isSaving} loading={isSaving}>
                              Approve
                            </Button>
                            <Button variant="secondary" onClick={() => startEditing(brief)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => handleDelete(brief.id)}
                              disabled={isSaving}
                              className="ml-auto text-danger-fg hover:text-danger-fg"
                            >
                              Delete
                            </Button>
                          </>
                        )}

                        {/* Needs Text tab actions */}
                        {TABS[activeTab].status === "needs_text" && (
                          <>
                            {!isPasting && (
                              <Button
                                onClick={() => {
                                  setPasteTextId(brief.id);
                                  setPasteText("");
                                }}
                              >
                                Paste article text
                              </Button>
                            )}
                            {brief.source_url && (
                              <a
                                href={brief.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 h-control px-3.5 text-base font-medium rounded-control bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong transition-colors duration-150"
                              >
                                Open article
                                <ExternalLink size={16} strokeWidth={1.75} />
                              </a>
                            )}
                            <Button
                              variant="ghost"
                              onClick={() => handleDelete(brief.id)}
                              disabled={isSaving}
                              className="ml-auto text-danger-fg hover:text-danger-fg"
                            >
                              Skip
                            </Button>
                          </>
                        )}

                        {/* Live tab actions */}
                        {TABS[activeTab].status === "live" && (
                          <>
                            <Button variant="secondary" onClick={() => startEditing(brief)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => handleUnpublish(brief.id)}
                              disabled={isSaving}
                              className="text-warning-fg hover:text-warning-fg"
                            >
                              Unpublish
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => handleDelete(brief.id)}
                              disabled={isSaving}
                              className="ml-auto text-danger-fg hover:text-danger-fg"
                            >
                              Delete
                            </Button>
                          </>
                        )}

                        {/* Deleted tab actions */}
                        {TABS[activeTab].status === "deleted" && (
                          <Button variant="secondary" onClick={() => handleRestore(brief.id)} disabled={isSaving}>
                            Restore to pending
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
