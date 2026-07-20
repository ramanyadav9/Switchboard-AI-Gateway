"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { research } from "@/lib/api";
import { useToast } from "@/components/toast";

type ResearchStatus = "planning" | "searching" | "reading" | "analyzing" | "writing" | "done" | "failed" | "cancelled";

type ResearchSource = {
  url: string;
  title?: string;
};

type ResearchTask = {
  id: string;
  query: string;
  status: ResearchStatus;
  round?: number;
  total_rounds?: number;
  sources_count?: number;
  sources?: ResearchSource[];
  report?: string;
  error?: string;
  created_at: string;
};

const STATUS_CONFIG: Record<ResearchStatus, { color: string; bg: string; border: string; icon: string; label: string }> = {
  planning:  { color: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)", icon: "edit_note",      label: "Planning" },
  searching: { color: "#fcd34d", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", icon: "search",         label: "Searching" },
  reading:   { color: "#fdba74", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.25)", icon: "menu_book",      label: "Reading" },
  analyzing: { color: "#d8b4fe", bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.25)", icon: "psychology",     label: "Analyzing" },
  writing:   { color: "#a5b4fc", bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.25)", icon: "draw",           label: "Writing" },
  done:      { color: "#86efac", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.25)",  icon: "check_circle",   label: "Done" },
  failed:    { color: "#fca5a5", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.25)",  icon: "error",          label: "Failed" },
  cancelled: { color: "#9ca3af", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)", icon: "cancel",        label: "Cancelled" },
};

const ACTIVE_STATUSES: ResearchStatus[] = ["planning", "searching", "reading", "analyzing", "writing"];

function Spinner({ size = "h-3.5 w-3.5" }: { size?: string }) {
  return (
    <svg className={`animate-spin ${size}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: ResearchStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.planning;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase px-2 py-0.5 rounded border"
      style={{ background: config.bg, color: config.color, borderColor: config.border }}
    >
      <span className="material-symbols-outlined text-[12px]">{config.icon}</span>
      {config.label}
    </span>
  );
}

function ProgressBar({ round, totalRounds, status }: { round: number; totalRounds: number; status: ResearchStatus }) {
  const statusOrder: ResearchStatus[] = ["planning", "searching", "reading", "analyzing", "writing"];
  const statusIdx = statusOrder.indexOf(status);
  const stepsInRound = statusOrder.length;
  const completedSteps = Math.max(0, (round - 1) * stepsInRound + (statusIdx >= 0 ? statusIdx + 1 : 0));
  const totalSteps = totalRounds * stepsInRound;
  const pct = totalSteps > 0 ? Math.min(100, Math.round((completedSteps / totalSteps) * 100)) : 0;

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.planning;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>
          {pct}%
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-emphasis)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: config.color }}
        />
      </div>
    </div>
  );
}

// --- Markdown rendering ---
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Pattern: bold, italic, inline code, links
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let lastIdx = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    if (match[1]) {
      // bold
      nodes.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      // italic
      nodes.push(<em key={key++}>{match[4]}</em>);
    } else if (match[5]) {
      // inline code
      nodes.push(
        <code
          key={key++}
          className="font-[family-name:var(--font-mono)] text-[12px] px-1 py-0.5 rounded border"
          style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // link
      nodes.push(
        <a
          key={key++}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="t-link"
        >
          {match[8]}
        </a>
      );
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

function MarkdownReport({ text }: { text: string }) {
  // Split on code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-[14px] leading-[22px]">
      {parts.map((part, i) => {
        // Code block
        if (part.startsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim() || "";
          const code = lang ? lines.slice(1).join("\n") : lines.join("\n");
          return (
            <pre
              key={i}
              className="border rounded p-3 text-[13px] leading-[20px] overflow-x-auto font-[family-name:var(--font-mono)]"
              style={{ background: "var(--code-bg)", borderColor: "var(--border)", color: "var(--fg-secondary)" }}
            >
              {lang && (
                <div
                  className="text-[10px] tracking-[0.05em] font-bold uppercase mb-2"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {lang}
                </div>
              )}
              {code}
            </pre>
          );
        }

        // Regular text — parse line by line
        const lines = part.split("\n");
        const elements: React.ReactNode[] = [];
        let listBuffer: React.ReactNode[] = [];
        let orderedBuffer: React.ReactNode[] = [];

        function flushList() {
          if (listBuffer.length > 0) {
            elements.push(
              <ul key={`ul-${elements.length}`} className="space-y-1 pl-4">
                {listBuffer.map((item, idx) => (
                  <li key={idx} className="list-disc" style={{ color: "var(--fg-secondary)" }}>
                    {item}
                  </li>
                ))}
              </ul>
            );
            listBuffer = [];
          }
          if (orderedBuffer.length > 0) {
            elements.push(
              <ol key={`ol-${elements.length}`} className="space-y-1 pl-4">
                {orderedBuffer.map((item, idx) => (
                  <li key={idx} className="list-decimal" style={{ color: "var(--fg-secondary)" }}>
                    {item}
                  </li>
                ))}
              </ol>
            );
            orderedBuffer = [];
          }
        }

        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];
          const trimmed = line.trim();

          if (!trimmed) {
            flushList();
            continue;
          }

          // Headings
          const h1 = trimmed.match(/^#\s+(.+)/);
          if (h1) {
            flushList();
            elements.push(
              <h2 key={`h1-${j}`} className="text-[22px] leading-[28px] font-semibold mt-4 mb-1">
                {renderInlineMarkdown(h1[1])}
              </h2>
            );
            continue;
          }
          const h2 = trimmed.match(/^##\s+(.+)/);
          if (h2) {
            flushList();
            elements.push(
              <h3 key={`h2-${j}`} className="text-[18px] leading-[24px] font-semibold mt-3 mb-1">
                {renderInlineMarkdown(h2[1])}
              </h3>
            );
            continue;
          }
          const h3 = trimmed.match(/^###\s+(.+)/);
          if (h3) {
            flushList();
            elements.push(
              <h4 key={`h3-${j}`} className="text-[16px] leading-[22px] font-semibold mt-2 mb-1">
                {renderInlineMarkdown(h3[1])}
              </h4>
            );
            continue;
          }

          // Unordered list
          const ul = trimmed.match(/^[-*]\s+(.+)/);
          if (ul) {
            if (orderedBuffer.length > 0) flushList();
            listBuffer.push(<span key={j}>{renderInlineMarkdown(ul[1])}</span>);
            continue;
          }

          // Ordered list
          const ol = trimmed.match(/^\d+\.\s+(.+)/);
          if (ol) {
            if (listBuffer.length > 0) flushList();
            orderedBuffer.push(<span key={j}>{renderInlineMarkdown(ol[1])}</span>);
            continue;
          }

          // Regular paragraph
          flushList();
          elements.push(
            <p key={`p-${j}`} style={{ color: "var(--fg-secondary)" }}>
              {renderInlineMarkdown(trimmed)}
            </p>
          );
        }

        flushList();
        return <div key={i}>{elements}</div>;
      })}
    </div>
  );
}

export default function ResearchPage() {
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<ResearchTask | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const loadTasks = useCallback(() => {
    research
      .list()
      .then((data: ResearchTask[]) => {
        const list = Array.isArray(data) ? data : [];
        setTasks(list);
        // If there's a currently active task, update it
        const running = list.find((t) => ACTIVE_STATUSES.includes(t.status));
        if (running && (!activeTask || activeTask.id === running.id)) {
          setActiveTask(running);
        }
      })
      .catch(() => toast("Failed to load research tasks", "error"))
      .finally(() => setLoading(false));
  }, [toast, activeTask]);

  useEffect(() => {
    loadTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stream SSE for active research
  useEffect(() => {
    if (!activeTask || !ACTIVE_STATUSES.includes(activeTask.status)) return;

    const controller = new AbortController();
    streamAbortRef.current = controller;

    async function streamEvents() {
      try {
        const res = await research.stream(activeTask!.id);
        if (!res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (controller.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") break;

            try {
              const data = JSON.parse(dataStr);
              setActiveTask((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  status: data.status || prev.status,
                  round: data.round ?? prev.round,
                  total_rounds: data.total_rounds ?? prev.total_rounds,
                  sources_count: data.sources_count ?? data.sources?.length ?? prev.sources_count,
                  sources: data.sources || prev.sources,
                  report: data.report || prev.report,
                  error: data.error || prev.error,
                };
              });

              if (data.status === "done" || data.status === "failed" || data.status === "cancelled") {
                loadTasks();
              }
            } catch {
              /* skip unparseable lines */
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          // Stream ended or error — refresh the list
          loadTasks();
        }
      }
    }

    streamEvents();

    return () => {
      controller.abort();
    };
  }, [activeTask?.id, activeTask?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || starting) return;
    setStarting(true);
    try {
      const result = await research.start(query.trim());
      setQuery("");
      setActiveTask({
        id: result.id,
        query: query.trim(),
        status: "planning",
        round: 1,
        total_rounds: result.total_rounds || 5,
        sources_count: 0,
        created_at: new Date().toISOString(),
      });
      toast("Research started", "success");
      loadTasks();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to start research", "error");
    } finally {
      setStarting(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await research.cancel(id);
      toast("Research cancelled", "success");
      if (activeTask?.id === id) {
        streamAbortRef.current?.abort();
        setActiveTask((prev) => (prev ? { ...prev, status: "cancelled" } : null));
      }
      loadTasks();
    } catch {
      toast("Failed to cancel research", "error");
    }
  }

  function copyReport(text: string) {
    if (!text) { toast("Nothing to copy", "error"); return; }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
      toast("Report copied", "success");
    } catch {
      toast("Failed to copy", "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await research.delete(id);
      toast("Research deleted", "success");
      if (activeTask?.id === id) setActiveTask(null);
      if (expandedId === id) setExpandedId(null);
      loadTasks();
    } catch {
      toast("Failed to delete research", "error");
    }
  }

  function downloadPdf(query: string, report: string) {
    if (!report) { toast("No report to download", "error"); return; }

    function md2html(md: string): string {
      let html = md;
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
        `<pre><code>${lang ? `<span style="color:#666;font-size:11px">${lang}</span>\n` : ""}${code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>`
      );
      html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
      html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      html = html.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:13px">$1</code>');
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4f46e5">$1</a>');
      html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
      html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
      html = html.replace(/(<li>[\s\S]*?<\/li>)\n?(?=<li>)/g, "$1");
      html = html.replace(/((?:<li>[\s\S]*?<\/li>\s*)+)/g, "<ul>$1</ul>");
      html = html.replace(/^---$/gm, "<hr>");
      const blocks = html.split(/\n\n+/);
      html = blocks.map(b => {
        const t = b.trim();
        if (!t) return "";
        if (/^<[huo]|^<pre|^<hr/i.test(t)) return t;
        return `<p>${t.replace(/\n/g, "<br>")}</p>`;
      }).join("\n");
      return html;
    }

    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const safeQuery = query.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const body = md2html(report);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Research: ${query.replace(/"/g, "")}</title>
<style>
body{font-family:Georgia,"Times New Roman",serif;max-width:780px;margin:50px auto;padding:0 24px;color:#1a1a1a;line-height:1.8;font-size:15px}
h1{font-size:26px;border-bottom:2px solid #222;padding-bottom:10px;margin-top:32px}
h2{font-size:20px;margin-top:28px;color:#333}
h3{font-size:17px;margin-top:22px;color:#444}
h4{font-size:15px;margin-top:18px;color:#555}
p{margin:10px 0}
ul,ol{padding-left:24px;margin:10px 0}
li{margin:4px 0}
pre{background:#f5f5f5;padding:14px;border-radius:6px;overflow-x:auto;font-size:13px;border:1px solid #e0e0e0}
hr{border:none;border-top:1px solid #ddd;margin:24px 0}
a{color:#4f46e5;text-decoration:none}
a:hover{text-decoration:underline}
strong{color:#111}
.header{border-bottom:1px solid #eee;padding-bottom:16px;margin-bottom:24px}
.meta{color:#777;font-size:13px;line-height:1.6}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;color:#999;font-size:12px;text-align:center}
@media print{body{margin:0;max-width:100%}a{color:#333}}
</style></head><body>
<div class="header">
<h1 style="border:none;padding:0;margin:0 0 8px 0">Research Report</h1>
<div class="meta">
<strong>Query:</strong> ${safeQuery}<br>
<strong>Date:</strong> ${date}<br>
<strong>Platform:</strong> Switchboard AI Gateway
</div></div>
${body}
<div class="footer">Generated by Switchboard AI Gateway &mdash; ${date}</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${query.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Downloaded — open in browser and Print → Save as PDF", "success");
  }

  // Combine active task with history, avoiding duplicates
  const sortedTasks = (() => {
    const map = new Map<string, ResearchTask>();
    if (activeTask) map.set(activeTask.id, activeTask);
    for (const t of tasks) {
      if (!map.has(t.id)) map.set(t.id, t);
      else {
        // Merge: keep the more up-to-date version
        const existing = map.get(t.id)!;
        if (t.report && !existing.report) map.set(t.id, { ...existing, ...t });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  })();

  const isActiveRunning = activeTask && ACTIVE_STATUSES.includes(activeTask.status);

  return (
    <div className="max-w-[1280px] mx-auto w-full flex flex-col gap-4">
      {/* Page Header */}
      <div>
        <h2 className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold">Deep Research</h2>
        <p className="text-[14px] leading-[20px] mt-1" style={{ color: "var(--fg-secondary)" }}>
          Run multi-step research tasks with web search, source analysis, and report generation.
        </p>
      </div>

      {/* Research Input */}
      <form onSubmit={handleStart} className="t-card rounded-lg p-4">
        <label
          className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase block mb-2"
          style={{ color: "var(--fg-secondary)" }}
        >
          Research Query
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px]"
              style={{ color: "var(--fg-muted)" }}
            >
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="t-input w-full rounded px-3 py-2.5 pl-10 text-[14px]"
              placeholder="What would you like to research? e.g. 'Compare React Server Components vs traditional SSR approaches'"
              disabled={!!isActiveRunning}
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || starting || !!isActiveRunning}
            className="t-btn text-[14px] font-medium px-5 py-2.5 rounded flex items-center gap-2 shadow-sm whitespace-nowrap disabled:opacity-50"
          >
            {starting && <Spinner />}
            {starting ? "Starting..." : "Start Research"}
          </button>
        </div>
        {isActiveRunning && (
          <p className="text-[11px] mt-2" style={{ color: "var(--fg-muted)" }}>
            A research task is already running. Wait for it to finish or cancel it before starting a new one.
          </p>
        )}
      </form>

      {/* Active Research Progress */}
      {activeTask && ACTIVE_STATUSES.includes(activeTask.status) && (
        <div
          className="t-card rounded-lg p-5 space-y-4 border-l-4"
          style={{ borderLeftColor: STATUS_CONFIG[activeTask.status]?.color || "var(--accent)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[20px]" style={{ color: STATUS_CONFIG[activeTask.status]?.color }}>
                  search
                </span>
                <span className="text-[14px] font-semibold truncate">Researching</span>
                <StatusBadge status={activeTask.status} />
              </div>
              <p className="text-[13px] mt-1 line-clamp-2" style={{ color: "var(--fg-secondary)" }}>
                &ldquo;{activeTask.query}&rdquo;
              </p>
            </div>
            <button
              onClick={() => handleCancel(activeTask.id)}
              className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[14px]">cancel</span>
              Cancel
            </button>
          </div>

          {/* Progress Details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="border rounded px-3 py-2" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-muted)" }}>
                Status
              </div>
              <div className="text-[13px] mt-0.5 font-medium" style={{ color: STATUS_CONFIG[activeTask.status]?.color }}>
                {STATUS_CONFIG[activeTask.status]?.label || activeTask.status}
              </div>
            </div>
            <div className="border rounded px-3 py-2" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-muted)" }}>
                Round
              </div>
              <div className="text-[13px] mt-0.5 font-medium">
                {activeTask.round || 1}/{activeTask.total_rounds || 5}
              </div>
            </div>
            <div className="border rounded px-3 py-2" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-muted)" }}>
                Sources
              </div>
              <div className="text-[13px] mt-0.5 font-medium">
                {activeTask.sources_count || 0} found
              </div>
            </div>
          </div>

          <ProgressBar
            round={activeTask.round || 1}
            totalRounds={activeTask.total_rounds || 5}
            status={activeTask.status}
          />
        </div>
      )}

      {/* Research History */}
      <div className="t-card rounded-xl overflow-hidden flex flex-col">
        <div
          className="px-4 py-2 border-b flex justify-between items-center"
          style={{ borderColor: "var(--border)", background: "var(--bg-muted)" }}
        >
          <h3 className="text-[12px] leading-[18px] font-semibold">Research History</h3>
          <span className="text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>
            {sortedTasks.length} {sortedTasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--fg-muted)" }}>
            <Spinner size="h-5 w-5" />
            <p className="text-[14px] mt-3">Loading research tasks...</p>
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--fg-muted)" }}>
            <span className="material-symbols-outlined text-[48px] mb-3">science</span>
            <p className="text-[14px]">No research tasks yet.</p>
            <p className="text-[12px] mt-1">Enter a query above to start your first deep research.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {sortedTasks.map((task) => {
              const isExpanded = expandedId === task.id;
              const isRunning = ACTIVE_STATUSES.includes(task.status);
              const displayTask = activeTask?.id === task.id ? activeTask : task;

              return (
                <div key={task.id}>
                  {/* Task Row */}
                  <div
                    className="group px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                    onClick={async () => {
                      if (isExpanded) { setExpandedId(null); return; }
                      setExpandedId(task.id);
                      if (task.status === "done" && !task.report) {
                        try {
                          const full = await research.get(task.id);
                          setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, report: full.report, sources: full.sources } : t));
                        } catch { /* ignore */ }
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <StatusBadge status={displayTask.status} />
                          {displayTask.round && displayTask.total_rounds && (
                            <span
                              className="text-[10px] font-[family-name:var(--font-mono)] tracking-[0.05em] font-bold uppercase"
                              style={{ color: "var(--fg-muted)" }}
                            >
                              Round {displayTask.round}/{displayTask.total_rounds}
                            </span>
                          )}
                          {(displayTask.sources_count ?? 0) > 0 && (
                            <span
                              className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.05em] font-bold uppercase"
                              style={{ color: "var(--fg-muted)" }}
                            >
                              <span className="material-symbols-outlined text-[12px]">link</span>
                              {displayTask.sources_count} sources
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] leading-[20px] line-clamp-2">{displayTask.query}</p>
                        <p className="text-[11px] mt-1 font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>
                          {new Date(displayTask.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isRunning && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(task.id);
                            }}
                            className="text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1 hover:bg-[#fca5a5]/10"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            <span className="material-symbols-outlined text-[14px]">cancel</span>
                            Cancel
                          </button>
                        )}
                        <span
                          className={`material-symbols-outlined text-[18px] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          style={{ color: "var(--fg-muted)" }}
                        >
                          expand_more
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Error message */}
                      {displayTask.error && (
                        <div
                          className="border rounded-lg px-4 py-3 text-[13px]"
                          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", color: "#fca5a5" }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-[16px]">error</span>
                            <span className="font-semibold">Error</span>
                          </div>
                          {displayTask.error}
                        </div>
                      )}

                      {/* Running indicator */}
                      {isRunning && activeTask?.id === task.id && (
                        <ProgressBar
                          round={activeTask.round || 1}
                          totalRounds={activeTask.total_rounds || 5}
                          status={activeTask.status}
                        />
                      )}

                      {/* Report */}
                      {displayTask.report && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div
                              className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase"
                              style={{ color: "var(--fg-secondary)" }}
                            >
                              Research Report
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); copyReport(displayTask.report!); }}
                                className="t-btn-ghost text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                {copiedReport ? "Copied!" : "Copy"}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadPdf(displayTask.query, displayTask.report!); }}
                                className="t-btn-ghost text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">download</span>
                                PDF
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); if (confirm("Delete this research?")) handleDelete(task.id); }}
                                className="text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1 hover:bg-white/5"
                                style={{ color: "var(--error)" }}
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                Delete
                              </button>
                            </div>
                          </div>
                          <div
                            className="border rounded-lg p-5 overflow-x-auto"
                            style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}
                          >
                            <MarkdownReport text={displayTask.report} />
                          </div>
                        </div>
                      )}

                      {/* Sources */}
                      {displayTask.sources && displayTask.sources.length > 0 && (
                        <div>
                          <div
                            className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase mb-2"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            Sources ({displayTask.sources.length})
                          </div>
                          <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border)" }}>
                            {displayTask.sources.map((src, idx) => (
                              <a
                                key={idx}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors border-b last:border-b-0"
                                style={{ borderColor: "var(--border)" }}
                              >
                                <span
                                  className="material-symbols-outlined text-[14px] shrink-0"
                                  style={{ color: "var(--accent)" }}
                                >
                                  open_in_new
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] truncate" style={{ color: "var(--accent)" }}>
                                    {src.title || src.url}
                                  </div>
                                  {src.title && (
                                    <div
                                      className="text-[11px] font-[family-name:var(--font-mono)] truncate"
                                      style={{ color: "var(--fg-muted)" }}
                                    >
                                      {src.url}
                                    </div>
                                  )}
                                </div>
                                <span
                                  className="font-[family-name:var(--font-mono)] text-[10px] shrink-0"
                                  style={{ color: "var(--fg-muted)" }}
                                >
                                  [{idx + 1}]
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Loading placeholder for in-progress with no report yet */}
                      {isRunning && !displayTask.report && (
                        <div className="flex items-center gap-3 py-6 justify-center" style={{ color: "var(--fg-muted)" }}>
                          <Spinner size="h-4 w-4" />
                          <span className="text-[13px]">Researching... report will appear here when ready.</span>
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

      {/* Bottom info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="t-card rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: "var(--accent)" }}>
              info
            </span>
            <div>
              <h3 className="text-[14px] leading-[20px] font-semibold">How It Works</h3>
              <p className="text-[12px] leading-[18px] mt-1" style={{ color: "var(--fg-secondary)" }}>
                Deep Research runs multiple rounds of web search, reads and analyzes sources, then synthesizes a
                comprehensive report with citations. Each round refines the search based on findings.
              </p>
            </div>
          </div>
        </div>
        <div className="t-card rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: "var(--accent)" }}>
              tips_and_updates
            </span>
            <div>
              <h3 className="text-[14px] leading-[20px] font-semibold">Tips for Better Results</h3>
              <p className="text-[12px] leading-[18px] mt-1" style={{ color: "var(--fg-secondary)" }}>
                Be specific in your query. Include context like time period, domain, or comparison criteria. For example:
                &ldquo;Compare PostgreSQL vs MySQL performance for write-heavy workloads in 2024&rdquo;.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
