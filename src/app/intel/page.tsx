"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";

/**
 * /intel — Market Intel approval queue.
 * Morning workflow: review pending briefs, approve/edit/delete.
 * Tabs: Pending | Live | Deleted
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
  source_date: string | null;
  status: "pending" | "live" | "deleted";
  relevance_score: number;
  original_headline: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/* ── Tab config ── */
const TABS = [
  { label: "Pending", status: "pending" },
  { label: "Live", status: "live" },
  { label: "Deleted", status: "deleted" },
];

/* ── Category colors for badges ── */
const CATEGORY_COLORS: Record<string, string> = {
  "data-center": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  retail: "bg-green/15 text-green border-green/30",
  land: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  market: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  infrastructure: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

/* ── Tag colors ── */
const TAG_COLORS: Record<string, string> = {
  zoning: "bg-yellow-500/10 text-yellow-500",
  power: "bg-orange-500/10 text-orange-400",
  expansion: "bg-emerald-500/10 text-emerald-400",
  operator: "bg-blue-500/10 text-blue-400",
  infrastructure: "bg-purple-500/10 text-purple-400",
  policy: "bg-pink-500/10 text-pink-400",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || "bg-white/5 text-medium-gray";
}

/* ── Format date ── */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Brief>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
  }, [fetchBriefs]);

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
      <div className="px-6 py-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-dm text-xl font-bold text-charcoal">Market Intel</h1>
            <p className="font-dm text-sm text-medium-gray mt-1">
              Review, edit, and approve news briefs before they go live.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Brief count */}
            <span className="font-dm text-sm text-medium-gray">
              {filteredBriefs.length} brief{filteredBriefs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-border-light pb-0">
          {TABS.map((tab, i) => (
            <button
              key={tab.status}
              onClick={() => {
                setActiveTab(i);
                setExpandedId(null);
                setEditingId(null);
                setCategoryFilter("all");
              }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative
                ${
                  activeTab === i
                    ? "text-charcoal"
                    : "text-medium-gray hover:text-charcoal"
                }`}
            >
              {tab.label}
              {activeTab === i && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-green rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Category filter chips */}
        {briefs.length > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1 rounded-btn text-xs font-medium transition-colors border
                ${
                  categoryFilter === "all"
                    ? "bg-charcoal text-white border-charcoal"
                    : "bg-white text-medium-gray border-border-light hover:border-border-medium"
                }`}
            >
              All ({briefs.length})
            </button>
            {Object.entries(categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
                  className={`px-3 py-1 rounded-btn text-xs font-medium transition-colors border
                    ${
                      categoryFilter === cat
                        ? "bg-charcoal text-white border-charcoal"
                        : "bg-white text-medium-gray border-border-light hover:border-border-medium"
                    }`}
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
              {activeTab === 0
                ? "No pending briefs. Check back tomorrow morning."
                : activeTab === 1
                  ? "No live briefs yet. Approve some from the Pending tab."
                  : "No deleted briefs."}
            </p>
          </div>
        )}

        {/* Brief cards */}
        {!loading && (
          <div className="space-y-3">
            {filteredBriefs.map((brief) => {
              const isExpanded = expandedId === brief.id;
              const isEditing = editingId === brief.id;
              const isSaving = saving === brief.id;

              return (
                <div
                  key={brief.id}
                  className="bg-white rounded-card border border-border-light overflow-hidden transition-shadow hover:shadow-sm"
                >
                  {/* Collapsed row — always visible */}
                  <div
                    className="px-5 py-4 cursor-pointer"
                    onClick={() => {
                      if (!isEditing) {
                        setExpandedId(isExpanded ? null : brief.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-4">
                      {/* Relevance score indicator */}
                      <div
                        className={`w-10 h-10 rounded-btn flex items-center justify-center text-xs font-bold shrink-0 mt-0.5
                          ${
                            brief.relevance_score >= 70
                              ? "bg-green/15 text-green"
                              : brief.relevance_score >= 40
                                ? "bg-amber-500/15 text-amber-500"
                                : "bg-red-500/15 text-red-400"
                          }`}
                      >
                        {brief.relevance_score}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {/* Category badge */}
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-btn border ${
                              CATEGORY_COLORS[brief.category] ||
                              "bg-white/5 text-medium-gray border-border-light"
                            }`}
                          >
                            {brief.category.replace("-", " ")}
                          </span>
                          {/* Source + date */}
                          {brief.source_name && (
                            <span className="text-[11px] text-medium-gray">
                              via {brief.source_name}
                            </span>
                          )}
                          <span className="text-[11px] text-medium-gray/60">
                            {formatShortDate(brief.created_at)}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-dm text-sm font-semibold text-charcoal leading-snug">
                          {brief.title}
                        </h3>

                        {/* Original headline — shown dimmed if different */}
                        {brief.original_headline &&
                          brief.original_headline !== brief.title && (
                            <p className="font-dm text-[11px] text-medium-gray/50 mt-1 truncate">
                              Original: {brief.original_headline}
                            </p>
                          )}
                      </div>

                      {/* Quick actions (non-expanded) */}
                      {!isExpanded && activeTab === 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(brief.id);
                            }}
                            disabled={isSaving}
                            className="px-3 py-1.5 bg-green text-white text-xs font-medium rounded-btn hover:bg-green-dark transition-colors disabled:opacity-50"
                          >
                            {isSaving ? "..." : "Approve"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(brief.id);
                            }}
                            disabled={isSaving}
                            className="px-3 py-1.5 bg-white text-red-500 text-xs font-medium rounded-btn border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}

                      {/* Expand indicator */}
                      <svg
                        className={`w-4 h-4 text-medium-gray/40 shrink-0 mt-1 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-border-light pt-4">
                      {isEditing ? (
                        /* ── Edit mode ── */
                        <div className="space-y-4">
                          {/* Title */}
                          <div>
                            <label className="block text-[11px] font-medium text-medium-gray uppercase tracking-wider mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={editForm.title || ""}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, title: e.target.value }))
                              }
                              className="w-full px-3 py-2 text-sm border border-border-light rounded-btn focus:outline-none focus:border-green"
                            />
                          </div>

                          {/* Summary */}
                          <div>
                            <label className="block text-[11px] font-medium text-medium-gray uppercase tracking-wider mb-1">
                              Summary (What Happened)
                            </label>
                            <textarea
                              value={editForm.summary || ""}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, summary: e.target.value }))
                              }
                              rows={4}
                              className="w-full px-3 py-2 text-sm border border-border-light rounded-btn focus:outline-none focus:border-green resize-y"
                            />
                          </div>

                          {/* Impact */}
                          <div>
                            <label className="block text-[11px] font-medium text-medium-gray uppercase tracking-wider mb-1">
                              Impact (What This Means)
                            </label>
                            <textarea
                              value={editForm.impact || ""}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, impact: e.target.value }))
                              }
                              rows={4}
                              className="w-full px-3 py-2 text-sm border border-border-light rounded-btn focus:outline-none focus:border-green resize-y"
                            />
                          </div>

                          {/* Category + Tags row */}
                          <div className="flex gap-4">
                            <div className="w-48">
                              <label className="block text-[11px] font-medium text-medium-gray uppercase tracking-wider mb-1">
                                Category
                              </label>
                              <select
                                value={editForm.category || ""}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, category: e.target.value }))
                                }
                                className="w-full px-3 py-2 text-sm border border-border-light rounded-btn focus:outline-none focus:border-green bg-white"
                              >
                                <option value="data-center">Data Center</option>
                                <option value="retail">Retail</option>
                                <option value="land">Land</option>
                                <option value="market">Market</option>
                                <option value="infrastructure">Infrastructure</option>
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="block text-[11px] font-medium text-medium-gray uppercase tracking-wider mb-1">
                                Tags (comma-separated)
                              </label>
                              <input
                                type="text"
                                value={(editForm.tags || []).join(", ")}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    tags: e.target.value
                                      .split(",")
                                      .map((t) => t.trim())
                                      .filter(Boolean),
                                  }))
                                }
                                className="w-full px-3 py-2 text-sm border border-border-light rounded-btn focus:outline-none focus:border-green"
                              />
                            </div>
                          </div>

                          {/* Edit actions */}
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => saveEdits(brief.id)}
                              disabled={isSaving}
                              className="px-4 py-2 bg-green text-white text-xs font-medium rounded-btn hover:bg-green-dark transition-colors disabled:opacity-50"
                            >
                              {isSaving ? "Saving..." : "Save Changes"}
                            </button>
                            <button
                              onClick={() => {
                                /* Save + approve in one action */
                                setSaving(brief.id);
                                fetch("/api/intel", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    id: brief.id,
                                    ...editForm,
                                    status: "live",
                                    published_at: new Date().toISOString(),
                                  }),
                                }).then(() => {
                                  setBriefs((prev) =>
                                    prev.filter((b) => b.id !== brief.id)
                                  );
                                  setSaving(null);
                                  setEditingId(null);
                                });
                              }}
                              disabled={isSaving}
                              className="px-4 py-2 bg-charcoal text-white text-xs font-medium rounded-btn hover:bg-black transition-colors disabled:opacity-50"
                            >
                              Save &amp; Approve
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-4 py-2 text-medium-gray text-xs font-medium hover:text-charcoal transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Read mode ── */
                        <div>
                          {/* Tags */}
                          {brief.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              {brief.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-btn ${getTagColor(tag)}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Summary */}
                          <div className="mb-4">
                            <span className="text-[10px] font-bold text-medium-gray/50 uppercase tracking-wider block mb-1.5">
                              What Happened
                            </span>
                            <p className="font-dm text-sm text-charcoal/80 leading-relaxed">
                              {brief.summary}
                            </p>
                          </div>

                          {/* Impact */}
                          <div className="mb-5 border-l-2 border-green/30 pl-4">
                            <span className="text-[10px] font-bold text-green/60 uppercase tracking-wider block mb-1.5">
                              What This Means
                            </span>
                            <p className="font-dm text-sm text-charcoal/60 leading-relaxed">
                              {brief.impact}
                            </p>
                          </div>

                          {/* Meta info */}
                          <div className="flex items-center gap-4 text-[11px] text-medium-gray/50 mb-4">
                            <span>Score: {brief.relevance_score}</span>
                            <span>Created: {formatDate(brief.created_at)}</span>
                            {brief.published_at && (
                              <span>Published: {formatDate(brief.published_at)}</span>
                            )}
                            <span>Slug: {brief.slug}</span>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {activeTab === 0 && (
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
                                  className="px-4 py-2 text-red-500 text-xs font-medium hover:text-red-700 transition-colors disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {activeTab === 1 && (
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
                                  className="px-4 py-2 text-red-500 text-xs font-medium hover:text-red-700 transition-colors disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {activeTab === 2 && (
                              <button
                                onClick={() => handleRestore(brief.id)}
                                disabled={isSaving}
                                className="px-4 py-2 bg-white text-charcoal text-xs font-medium rounded-btn border border-border-light hover:border-border-medium transition-colors disabled:opacity-50"
                              >
                                Restore to Pending
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
