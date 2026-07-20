"use client";

import { useEffect, useState, useCallback } from "react";
import { skills } from "@/lib/api";
import { useToast } from "@/components/toast";

type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  usage_count?: number;
  created_at: string;
};

const CATEGORIES = ["general", "coding", "writing", "analysis", "research"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  general: { bg: "rgba(99,102,241,0.12)", text: "#a5b4fc", border: "rgba(99,102,241,0.25)" },
  coding: { bg: "rgba(34,197,94,0.12)", text: "#86efac", border: "rgba(34,197,94,0.25)" },
  writing: { bg: "rgba(168,85,247,0.12)", text: "#d8b4fe", border: "rgba(168,85,247,0.25)" },
  analysis: { bg: "rgba(245,158,11,0.12)", text: "#fcd34d", border: "rgba(245,158,11,0.25)" },
  research: { bg: "rgba(6,182,212,0.12)", text: "#67e8f9", border: "rgba(6,182,212,0.25)" },
};

const CATEGORY_ICONS: Record<Category, string> = {
  general: "auto_awesome",
  coding: "code",
  writing: "edit_note",
  analysis: "analytics",
  research: "science",
};

function Spinner({ size = "h-3.5 w-3.5" }: { size?: string }) {
  return (
    <svg className={`animate-spin ${size}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORIES.includes(category as Category) ? (category as Category) : "general";
  const colors = CATEGORY_COLORS[cat];
  const icon = CATEGORY_ICONS[cat];
  return (
    <span
      className="inline-flex items-center gap-1 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase px-2 py-0.5 rounded border"
      style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
      {cat}
    </span>
  );
}

export default function SkillsPage() {
  const [skillList, setSkillList] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState<string>("general");

  const { toast } = useToast();

  const loadSkills = useCallback(() => {
    skills
      .list()
      .then((data: Skill[]) => setSkillList(Array.isArray(data) ? data : []))
      .catch(() => toast("Failed to load skills", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormContent("");
    setFormCategory("general");
    setEditing(null);
    setShowForm(false);
  }

  function openEdit(skill: Skill) {
    setFormName(skill.name);
    setFormDescription(skill.description);
    setFormContent(skill.content);
    setFormCategory(skill.category || "general");
    setEditing(skill);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await skills.update(editing.id, {
          name: formName,
          description: formDescription,
          content: formContent,
          category: formCategory,
        });
        toast("Skill updated", "success");
      } else {
        await skills.create({
          name: formName,
          description: formDescription,
          content: formContent,
          category: formCategory,
        });
        toast("Skill created", "success");
      }
      resetForm();
      loadSkills();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save skill", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this skill? This cannot be undone.")) return;
    try {
      await skills.delete(id);
      toast("Skill deleted", "success");
      if (expandedId === id) setExpandedId(null);
      loadSkills();
    } catch {
      toast("Failed to delete skill", "error");
    }
  }

  const filtered = skillList.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || s.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-[1280px] mx-auto w-full flex flex-col gap-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold">Skills</h2>
          <p className="text-[14px] leading-[20px] mt-1" style={{ color: "var(--fg-secondary)" }}>
            Manage reusable prompt templates for common tasks.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="t-btn text-[14px] leading-[20px] font-medium px-4 py-2 rounded flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Skill
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="t-card rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] leading-[20px] font-semibold">
              {editing ? "Edit Skill" : "Create New Skill"}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="hover:opacity-80 transition"
              style={{ color: "var(--fg-secondary)" }}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase block mb-1"
                style={{ color: "var(--fg-secondary)" }}
              >
                Name
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="t-input w-full rounded px-3 py-2 text-[14px]"
                placeholder="e.g. Code Review"
                required
                autoFocus
              />
            </div>
            <div>
              <label
                className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase block mb-1"
                style={{ color: "var(--fg-secondary)" }}
              >
                Category
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="t-input w-full rounded px-3 py-2 text-[14px] font-[family-name:var(--font-mono)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase block mb-1"
              style={{ color: "var(--fg-secondary)" }}
            >
              Description
            </label>
            <input
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="t-input w-full rounded px-3 py-2 text-[14px]"
              placeholder="Brief description of what this skill does"
              required
            />
          </div>

          <div>
            <label
              className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase block mb-1"
              style={{ color: "var(--fg-secondary)" }}
            >
              Prompt Template
            </label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={6}
              className="t-input w-full rounded px-3 py-2 text-[13px] leading-[20px] resize-y font-[family-name:var(--font-mono)]"
              placeholder={`e.g. Review the following code for bugs, performance issues, and best practices:\n\n{code}`}
              required
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
              Use {"{variable}"} placeholders for dynamic content.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="t-btn text-[14px] font-medium px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Spinner />}
              {saving ? "Saving..." : editing ? "Update Skill" : "Create Skill"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="t-btn-ghost text-[14px] px-4 py-2 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search and Filter Bar */}
      <div className="t-card rounded-xl overflow-hidden">
        <div
          className="px-4 py-2 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
          style={{ borderColor: "var(--border)", background: "var(--bg-muted)" }}
        >
          <h3 className="text-[12px] leading-[18px] font-semibold">
            {filtered.length} {filtered.length === 1 ? "Skill" : "Skills"}
          </h3>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Category filter */}
            <div className="flex border rounded p-0.5 shrink-0" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
              <button
                onClick={() => setFilterCategory("all")}
                className="px-2 py-1 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] transition"
                style={
                  filterCategory === "all"
                    ? { background: "var(--bg-emphasis)", color: "var(--fg)" }
                    : { color: "var(--fg-muted)" }
                }
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCategory(c)}
                  className="px-2 py-1 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] transition hidden sm:block"
                  style={
                    filterCategory === c
                      ? { background: "var(--bg-emphasis)", color: "var(--fg)" }
                      : { color: "var(--fg-muted)" }
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            {/* Mobile category select */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="t-input rounded text-[12px] px-2 py-1 font-[family-name:var(--font-mono)] sm:hidden"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            {/* Search */}
            <div className="relative flex-1 sm:flex-none">
              <span
                className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[16px]"
                style={{ color: "var(--fg-secondary)" }}
              >
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="t-input rounded text-[12px] pl-8 pr-2 py-1 w-full sm:w-[200px] font-[family-name:var(--font-mono)]"
                placeholder="Search skills..."
                type="text"
              />
            </div>
          </div>
        </div>

        {/* Skills Grid */}
        <div className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--fg-muted)" }}>
              <Spinner size="h-5 w-5" />
              <p className="text-[14px] mt-3">Loading skills...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--fg-muted)" }}>
              <span className="material-symbols-outlined text-[48px] mb-3">auto_awesome</span>
              <p className="text-[14px]">
                {searchQuery || filterCategory !== "all"
                  ? "No skills match your filters."
                  : "No skills yet. Create one to get started."}
              </p>
              {!searchQuery && filterCategory === "all" && (
                <button
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors mt-3 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Create your first skill
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((skill) => {
                const isExpanded = expandedId === skill.id;
                return (
                  <div
                    key={skill.id}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isExpanded ? "md:col-span-2 xl:col-span-3" : ""
                    }`}
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    {/* Card Header */}
                    <div
                      className="px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-[14px] leading-[20px] font-semibold truncate">{skill.name}</h4>
                            <CategoryBadge category={skill.category || "general"} />
                          </div>
                          <p
                            className="text-[12px] leading-[18px] line-clamp-2"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            {skill.description}
                          </p>
                        </div>
                        <span
                          className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          style={{ color: "var(--fg-muted)" }}
                        >
                          expand_more
                        </span>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 mt-2">
                        {skill.usage_count !== undefined && (
                          <span
                            className="flex items-center gap-1 text-[11px] font-[family-name:var(--font-mono)]"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            <span className="material-symbols-outlined text-[12px]">bar_chart</span>
                            {skill.usage_count} uses
                          </span>
                        )}
                        <span
                          className="text-[11px] font-[family-name:var(--font-mono)]"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          {new Date(skill.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "var(--border)" }}>
                        <div>
                          <div
                            className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase mb-1.5"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            Prompt Template
                          </div>
                          <pre
                            className="border rounded p-3 text-[13px] leading-[20px] whitespace-pre-wrap overflow-x-auto font-[family-name:var(--font-mono)]"
                            style={{
                              background: "var(--code-bg)",
                              borderColor: "var(--border)",
                              color: "var(--fg-secondary)",
                            }}
                          >
                            {skill.content}
                          </pre>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(skill.content);
                              toast("Copied to clipboard", "success");
                            }}
                            className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">content_copy</span>
                            Copy
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(skill);
                            }}
                            className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(skill.id);
                            }}
                            className="text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 hover:bg-[#ffb4ab]/10"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="t-card rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: "var(--accent)" }}>
              lightbulb
            </span>
            <div>
              <h3 className="text-[14px] leading-[20px] font-semibold">Skill Ideas</h3>
              <p className="text-[12px] leading-[18px] mt-1" style={{ color: "var(--fg-secondary)" }}>
                Create skills for recurring tasks: code reviews, summarization, data analysis, email drafting, or
                translation. Use {"{placeholders}"} for dynamic input.
              </p>
            </div>
          </div>
        </div>
        <div className="t-card rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: "var(--accent)" }}>
              integration_instructions
            </span>
            <div>
              <h3 className="text-[14px] leading-[20px] font-semibold">API Access</h3>
              <p className="text-[12px] leading-[18px] mt-1" style={{ color: "var(--fg-secondary)" }}>
                Skills are available via the REST API. Reference them by ID in your chat completions to apply prompt
                templates programmatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
