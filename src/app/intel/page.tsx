"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";

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
  { label: "Needs Text", status: "needs_text" },
  { label: "Live", status: "live" },
  { label: "Deleted", status: "deleted" },
];

/* ── Category colors for badges ── */
const CATEGORY_COLORS: Record<string, string> = {
  "data-center": "bg-blue-500/15 text-blue-500 border-blue-500/30",
  retail: "bg-green/15 text-green border-green/30",
  land: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  market: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  infrastructure: "bg-orange-500/15 text-orange-500 border-orange-500/30",
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

  return (
    <AppShell>
      <div className="px-6 py-6 max-w-[1000px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-dm text-xl font-bold text-charcoal">Market Intel</h1>
            <p className="font-dm text-sm text-medium-gray mt-1">
              Review, edit, and approve news briefs before they go live.
            </p>
          </div>
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="px-4 py-2 bg-charcoal text-white text-xs font-medium rounded-btn hover:bg-black transition-colors"
          >
            {showManualForm ? "Cancel" : "+ Submit Article"}
          </button>
        </div>

        {/* Manual submit form — collapsible */}
        {showManualForm && (
          <div className="bg-white rounded-card border border-border-light p-5 mb-6">
            <h3 className="font-dm text-sm font-semibold text-charcoal mb-3">
              Paste an article to generate a brief
            </h3>
            <input
              type="text"
              value={manualHeadline}
              onChange={(e) => setManualHeadline(e.target.value)}
              placeholder="Article headline (optional)"
              className="w-full px-3 py-2 text-sm border border-border-light rounded-btn mb-3 focus:outline-none focus:border-green"
            />
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste the full article text here..."
              rows={6}
              className="w-full px-3 py-2 text-sm border border-border-light rounded-btn mb-3 focus:outline-none focus:border-green resize-y"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualText.trim() || manualSubmitting}
              className="px-5 py-2.5 bg-green text-white text-xs font-medium rounded-btn hover:bg-green-dark transition-colors disabled:opacity-50"
            >
              {manualSubmitting ? "Processing..." : "Generate Brief"}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-border-light pb-0">
          {TABS.map((tab, i) => (
            <button
              key={tab.status}
              onClick={() => {
                setActiveTab(i);
                setEditingId(null);
                setCategoryFilter("all");
                setPasteTextId(null);
              }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-2
                ${activeTab === i ? "text-charcoal" : "text-medium-gray hover:text-charcoal"}`}
            >
              {tab.label}
              {/* Show count badge for needs_text and pending */}
              {(tab.status === "needs_text" || tab.status === "pending") &&
                (tabCounts[tab.status] || 0) > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      tab.status === "needs_text"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-green/10 text-green"
                    }`}
                  >
                    {tabCounts[tab.status]}
                  </span>
                )}
              {activeTab === i && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-green rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Category filter chips (not shown on needs_text tab) */}
        {briefs.length > 0 && TABS[activeTab].status !== "needs_text" && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1 rounded-btn text-xs font-medium transition-colors border
                ${categoryFilter === "all"
                  ? "bg-charcoal text-white border-charcoal"
                  : "bg-white text-medium-gray border-border-light hover:border-border-medium"}`}
            >
              All ({briefs.length})
            </button>
            {Object.entries(categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
                  className={`px-3 py-1 rounded-btn text-xs font-medium transition-colors border capitalize
                    ${categoryFilter === cat
                      ? "bg-charcoal text-white border-charcoal"
                      : "bg-white text-medium-gray border-border-light hover:border-border-medium"}`}
                >
                  {cat.replace("-", " ")} ({count})
                </button>
              ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredBriefs.length === 0 && (
          <div className="text-center py-20">
            <p className="font-dm text-medium-gray text-sm">
              {TABS[activeTab].status === "pending"
                ? "No pending briefs. Check back tomorrow morning."
                : TABS[activeTab].status === "needs_text"
                  ? "No articles waiting for text. All caught up."
                  : TABS[activeTab].status === "live"
                    ? "No live briefs yet. Approve some from the Pending tab."
                    : "No deleted briefs."}
            </p>
          </div>
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
                <div
                  key={brief.id}
                  className={`bg-white rounded-card border overflow-hidden ${
                    isNeedsText ? "border-amber-300/50" : "border-border-light"
                  }`}
                >
                  <div className="px-5 py-5">
                    {/* Row 1: Title + category badge */}
                    <div className="flex items-start gap-3 mb-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.title || ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          className="flex-1 px-3 py-1.5 text-[15px] font-semibold border border-border-light rounded-btn focus:outline-none focus:border-green"
                        />
                      ) : (
                        <h3 className="flex-1 font-dm text-[15px] font-semibold text-charcoal leading-snug">
                          {brief.title}
                        </h3>
                      )}
                      {/* Category badge + relevance score */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isNeedsText && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-btn border bg-amber-100 text-amber-600 border-amber-300/50">
                            Needs Text
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-btn border ${
                            CATEGORY_COLORS[brief.category] || "bg-white/5 text-medium-gray border-border-light"
                          }`}
                        >
                          {isEditing ? (
                            <select
                              value={editForm.category || ""}
                              onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                              className="bg-transparent text-[10px] font-bold uppercase border-none focus:outline-none cursor-pointer"
                            >
                              <option value="data-center">Data Center</option>
                              <option value="retail">Retail</option>
                              <option value="land">Land</option>
                              <option value="market">Market</option>
                              <option value="infrastructure">Infrastructure</option>
                            </select>
                          ) : (
                            brief.category.replace("-", " ")
                          )}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-btn ${
                            brief.relevance_score >= 70
                              ? "bg-green/10 text-green"
                              : brief.relevance_score >= 40
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {brief.relevance_score}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Date · Source · link to article */}
                    <div className="flex items-center gap-2 mb-4 text-[12px] text-medium-gray">
                      <span>{formatShortDate(brief.source_date || brief.created_at)}</span>
                      {brief.source_name && (
                        <>
                          <span className="text-border-medium">·</span>
                          <span>{brief.source_name}</span>
                        </>
                      )}
                      {brief.source_url && (
                        <>
                          <span className="text-border-medium">·</span>
                          <a
                            href={brief.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            Source
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </>
                      )}
                      {/* Tags inline */}
                      {brief.tags.length > 0 && (
                        <>
                          <span className="text-border-medium">·</span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={(editForm.tags || []).join(", ")}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                                }))
                              }
                              className="flex-1 px-2 py-0.5 text-[12px] border border-border-light rounded-btn focus:outline-none focus:border-green"
                              placeholder="Tags (comma-separated)"
                            />
                          ) : (
                            <span className="text-medium-gray/60">
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
                          <>
                            <p className="font-dm text-[12px] text-medium-gray mb-3">
                              Open the source article, copy the text, and paste it below. GPT will generate the full brief.
                            </p>
                            <textarea
                              value={pasteText}
                              onChange={(e) => setPasteText(e.target.value)}
                              placeholder="Paste the full article text here..."
                              rows={6}
                              className="w-full px-3 py-2 text-[13px] leading-relaxed border border-border-light rounded-btn focus:outline-none focus:border-green resize-y mb-3"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleProcessText(brief.id)}
                                disabled={!pasteText.trim() || isProcessing}
                                className="px-4 py-2 bg-green text-white text-xs font-medium rounded-btn hover:bg-green-dark transition-colors disabled:opacity-50"
                              >
                                {isProcessing ? "Processing..." : "Generate Brief"}
                              </button>
                              <button
                                onClick={() => {
                                  setPasteTextId(null);
                                  setPasteText("");
                                }}
                                className="px-4 py-2 text-medium-gray text-xs font-medium hover:text-charcoal transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="bg-amber-50 rounded-btn px-4 py-3 border border-amber-200/50">
                            <p className="font-dm text-[13px] text-amber-700">
                              Headline only — article text needed for full brief.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Summary — What Happened */}
                        <div className="mb-4">
                          <span className="text-[10px] font-bold text-medium-gray/50 uppercase tracking-wider block mb-1.5">
                            What Happened
                          </span>
                          {isEditing ? (
                            <textarea
                              value={editForm.summary || ""}
                              onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))}
                              rows={4}
                              className="w-full px-3 py-2 text-[13px] leading-relaxed border border-border-light rounded-btn focus:outline-none focus:border-green resize-y"
                            />
                          ) : (
                            <p className="font-dm text-[13px] text-charcoal/75 leading-relaxed">
                              {brief.summary}
                            </p>
                          )}
                        </div>

                        {/* Impact — What This Means */}
                        <div className="mb-5 border-l-2 border-green/30 pl-4">
                          <span className="text-[10px] font-bold text-green/60 uppercase tracking-wider block mb-1.5">
                            What This Means
                          </span>
                          {isEditing ? (
                            <textarea
                              value={editForm.impact || ""}
                              onChange={(e) => setEditForm((f) => ({ ...f, impact: e.target.value }))}
                              rows={4}
                              className="w-full px-3 py-2 text-[13px] leading-relaxed border border-border-light rounded-btn focus:outline-none focus:border-green resize-y"
                            />
                          ) : (
                            <p className="font-dm text-[13px] text-charcoal/55 leading-relaxed">
                              {brief.impact}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border-light/60 mt-1 pt-3">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveAndApprove(brief.id)}
                            disabled={isSaving}
                            className="px-4 py-2 bg-green text-white text-xs font-medium rounded-btn hover:bg-green-dark transition-colors disabled:opacity-50"
                          >
                            {isSaving ? "..." : "Save & Approve"}
                          </button>
                          <button
                            onClick={() => saveEdits(brief.id)}
                            disabled={isSaving}
                            className="px-4 py-2 bg-charcoal text-white text-xs font-medium rounded-btn hover:bg-black transition-colors disabled:opacity-50"
                          >
                            Save Draft
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 text-medium-gray text-xs font-medium hover:text-charcoal transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Pending tab actions */}
                          {TABS[activeTab].status === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(brief.id)}
                                disabled={isSaving}
                                className="px-4 py-2 bg-green text-white text-xs font-medium rounded-btn hover:bg-green-dark transition-colors disabled:opacity-50"
                              >
                                {isSaving ? "..." : "Approve"}
                              </button>
                              <button
                                onClick={() => startEditing(brief)}
                                className="px-4 py-2 bg-white text-charcoal text-xs font-medium rounded-btn border border-border-light hover:border-border-medium transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(brief.id)}
                                disabled={isSaving}
                                className="ml-auto px-4 py-2 text-red-400 text-xs font-medium hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </>
                          )}

                          {/* Needs Text tab actions */}
                          {TABS[activeTab].status === "needs_text" && (
                            <>
                              {!isPasting && (
                                <button
                                  onClick={() => {
                                    setPasteTextId(brief.id);
                                    setPasteText("");
                                  }}
                                  className="px-4 py-2 bg-charcoal text-white text-xs font-medium rounded-btn hover:bg-black transition-colors"
                                >
                                  Paste Article Text
                                </button>
                              )}
                              {brief.source_url && (
                                <a
                                  href={brief.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-4 py-2 bg-white text-blue-500 text-xs font-medium rounded-btn border border-border-light hover:border-blue-300 transition-colors inline-flex items-center gap-1"
                                >
                                  Open Article
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                              <button
                                onClick={() => handleDelete(brief.id)}
                                disabled={isSaving}
                                className="ml-auto px-4 py-2 text-red-400 text-xs font-medium hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                Skip
                              </button>
                            </>
                          )}

                          {/* Live tab actions */}
                          {TABS[activeTab].status === "live" && (
                            <>
                              <button
                                onClick={() => startEditing(brief)}
                                className="px-4 py-2 bg-white text-charcoal text-xs font-medium rounded-btn border border-border-light hover:border-border-medium transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleUnpublish(brief.id)}
                                disabled={isSaving}
                                className="px-4 py-2 text-amber-600 text-xs font-medium hover:text-amber-800 transition-colors disabled:opacity-50"
                              >
                                Unpublish
                              </button>
                              <button
                                onClick={() => handleDelete(brief.id)}
                                disabled={isSaving}
                                className="ml-auto px-4 py-2 text-red-400 text-xs font-medium hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </>
                          )}

                          {/* Deleted tab actions */}
                          {TABS[activeTab].status === "deleted" && (
                            <button
                              onClick={() => handleRestore(brief.id)}
                              disabled={isSaving}
                              className="px-4 py-2 bg-white text-charcoal text-xs font-medium rounded-btn border border-border-light hover:border-border-medium transition-colors disabled:opacity-50"
                            >
                              Restore to Pending
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
