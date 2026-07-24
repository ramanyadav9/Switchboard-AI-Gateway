"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { conversations, chatStream, models as modelsApi, skills as skillsApi, research as researchApi, search as searchApi, agents as agentsApi } from "@/lib/api";
import { useToast } from "@/components/toast";

type ToolCall = { id?: string; name: string; arguments?: string; tool?: string; params?: Record<string, string>; result?: unknown; error?: string; success?: boolean; duration?: number };
type Message = { id?: string; role: string; content: string; thinking?: string; message_type?: string; tool_calls_json?: ToolCall[]; tool_call_id?: string };
type AgentInfo = { id: string; name: string; hostname?: string; os?: string; workspace: string; status: string; tools?: string[]; last_seen?: string };

function agentRelTime(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function agentOsIcon(os?: string): string {
  const l = (os || "").toLowerCase();
  if (l.includes("darwin") || l.includes("mac")) return "laptop_mac";
  if (l.includes("win")) return "desktop_windows";
  return "computer";
}

function parseThinkTags(text: string) {
  const match = text.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (match) return { thinking: match[1].trim(), content: match[2].trim() };
  const open = text.match(/^<think>([\s\S]*)$/);
  if (open) return { thinking: open[1].trim(), content: "" };
  return { thinking: "", content: text };
}

function ThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-mono)] text-[#a855f7] hover:text-[#c084fc] transition"
      >
        {isStreaming ? (
          <div className="w-3 h-3 rounded-full border-2 border-[#a855f7] border-t-transparent animate-spin shrink-0" />
        ) : (
          <span
            className={`material-symbols-outlined text-[12px] transition-transform ${open ? "rotate-90" : ""}`}
          >
            chevron_right
          </span>
        )}
        {isStreaming
          ? "Thinking..."
          : open
          ? "Hide thinking"
          : "Thought for a moment"}
        {!isStreaming && (
          <span style={{ color: "var(--fg-muted)" }}>({content.length} chars)</span>
        )}
      </button>
      {(open || isStreaming) && (
        <div className="mt-2 px-3 py-2 bg-[#a855f7]/5 border border-[#a855f7]/10 rounded text-[11px] font-[family-name:var(--font-mono)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto" style={{ color: "var(--fg-muted)" }}>
          {content}
          {isStreaming && (
            <span className="inline-block w-1 h-3 bg-[#a855f7] ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 text-[10px] font-[family-name:var(--font-mono)] rounded px-1.5 py-0.5 transition opacity-0 group-hover:opacity-100"
      style={{
        color: "var(--fg-muted)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ---- Markdown rendering ---- */

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded text-[13px] font-[family-name:var(--font-mono)]"
          style={{ background: "var(--code-bg)", color: "var(--accent)" }}
        >
          {match[4]}
        </code>
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <a
          key={match.index}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          {match[5]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (listItems.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag
        key={elements.length}
        className={`my-2 pl-6 ${listType === "ol" ? "list-decimal" : "list-disc"}`}
        style={{ color: "var(--fg-secondary)" }}
      >
        {listItems.map((item, j) => (
          <li key={j} className="my-0.5">
            {renderInline(item)}
          </li>
        ))}
      </Tag>
    );
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const sizes = [
        "text-xl font-bold",
        "text-lg font-bold",
        "text-base font-semibold",
        "text-sm font-semibold",
      ];
      elements.push(
        <div key={elements.length} className={`${sizes[level - 1]} mt-3 mb-1`}>
          {renderInline(headingMatch[2])}
        </div>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();

    if (trimmed === "") {
      elements.push(<div key={elements.length} className="h-2" />);
    } else {
      elements.push(
        <span key={elements.length} className="block">
          {renderInline(line)}
        </span>
      );
    }
  }
  flushList();

  return <>{elements}</>;
}

function SearchIndicator({ phase, results }: { phase: string; results: { title: string; url: string }[] }) {
  const steps = [
    { key: "searching", icon: "search", label: "Searching the web" },
    { key: "reading", icon: "auto_stories", label: "Reading sources" },
    { key: "answering", icon: "edit_note", label: "Writing answer" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === phase);

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[85%]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
            <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--accent)" }}>travel_explore</span>
          </div>
          <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>Web Search</span>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-muted)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-6 mb-3">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${i <= activeIdx ? "" : "opacity-30"}`}
                  style={i === activeIdx
                    ? { background: "var(--accent)", color: "#fff" }
                    : i < activeIdx
                    ? { background: "var(--success)", color: "#fff" }
                    : { background: "var(--bg-emphasis)" }
                  }
                >
                  {i < activeIdx ? (
                    <span className="material-symbols-outlined text-[12px]">check</span>
                  ) : i === activeIdx ? (
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--fg-muted)" }}>{step.icon}</span>
                  )}
                </div>
                <span className={`text-[11px] ${i === activeIdx ? "font-medium" : ""}`} style={{ color: i <= activeIdx ? "var(--fg-secondary)" : "var(--fg-muted)" }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-4 h-4">
              <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: "var(--accent)" }} />
              <div className="relative w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "var(--accent)" }}>
                <span className="material-symbols-outlined text-[10px] text-white">{steps[activeIdx]?.icon || "search"}</span>
              </div>
            </div>
            <span className="text-[12px] font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-secondary)" }}>
              {phase === "searching" && "Querying search engines"}
              {phase === "reading" && `Found ${results.length} sources`}
              {phase === "answering" && "Generating response with citations"}
              <span className="inline-flex ml-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </span>
          </div>

          {results.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] animate-fade-in"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--success)" }}>check_circle</span>
                  <span className="truncate" style={{ color: "var(--fg-secondary)" }}>{r.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolCallBlock({ tool, params, result, error, success, duration, isLive }: {
  tool: string; params: Record<string, string>;
  result?: unknown; error?: string; success?: boolean; duration?: number; isLive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const icons: Record<string, string> = {
    read_file: "description", write_file: "edit_document", edit_file: "find_replace",
    bash: "terminal", grep: "search", glob: "folder_open", ls: "folder",
  };
  const isPending = success === undefined && !error;
  const statusColor = isPending ? "var(--fg-muted)" : success === false ? "var(--error)" : "var(--success)";

  function formatResult(r: unknown): string {
    if (typeof r === "string") return r;
    if (!r || typeof r !== "object") return JSON.stringify(r, null, 2);
    const obj = r as Record<string, unknown>;
    if (obj.content && typeof obj.content === "string") return obj.content;
    if (obj.output && typeof obj.output === "string") return obj.output;
    if (obj.entries && Array.isArray(obj.entries)) {
      return (obj.entries as {name: string; type: string; size?: number}[])
        .map(e => `${e.type === "dir" ? "📁" : "📄"} ${e.name}${e.size ? `  (${e.size > 1024 ? (e.size/1024).toFixed(1)+"K" : e.size+"B"})` : ""}`)
        .join("\n");
    }
    if (obj.results && Array.isArray(obj.results)) {
      return (obj.results as {file: string; matches: string[]}[])
        .map(r => `${r.file}\n${(r.matches||[]).join("\n")}`)
        .join("\n\n");
    }
    if (obj.files && Array.isArray(obj.files)) {
      return (obj.files as {path: string; size?: number; is_dir?: boolean}[])
        .map(f => `${f.is_dir ? "📁" : "📄"} ${f.path}`)
        .join("\n");
    }
    if (obj.edited) return `✓ Edited ${obj.edited}`;
    if (obj.written) return `✓ Written ${obj.written} bytes to ${obj.path || "file"}`;
    return JSON.stringify(r, null, 2);
  }

  const summary = tool === "bash" && params.command ? `$ ${String(params.command).slice(0, 80)}`
    : (tool === "read_file" || tool === "write_file" || tool === "edit_file" || tool === "grep" || tool === "glob") && params.path ? String(params.path)
    : tool === "ls" ? (params.path || ".") : "";

  return (
    <div className="my-1.5 rounded-lg overflow-hidden" style={{ border: `1px solid ${isPending ? "var(--accent)" : "var(--border)"}` }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:brightness-110"
        style={{ background: "var(--bg-muted)" }}>
        {isPending && isLive ? (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        ) : (
          <span className="material-symbols-outlined text-[14px]" style={{ color: statusColor }}>
            {icons[tool] || "build"}
          </span>
        )}
        <span className="font-[family-name:var(--font-mono)] font-semibold" style={{ color: statusColor }}>{tool}</span>
        {summary && (
          <span className="font-[family-name:var(--font-mono)] truncate flex-1 text-left" style={{ color: "var(--fg-muted)" }}>{summary}</span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {duration != null && duration > 0 && (
            <span className="font-[family-name:var(--font-mono)] text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--fg-muted)", background: "var(--bg)" }}>
              {duration > 1000 ? `${(duration/1000).toFixed(1)}s` : `${duration}ms`}
            </span>
          )}
          {success === true && <span className="material-symbols-outlined text-[13px]" style={{ color: "var(--success)" }}>check_circle</span>}
          {success === false && <span className="material-symbols-outlined text-[13px]" style={{ color: "var(--error)" }}>cancel</span>}
          <span className={`material-symbols-outlined text-[12px] transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--fg-muted)" }}>expand_more</span>
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] leading-[18px] max-h-[400px] overflow-auto" style={{ background: "var(--code-bg)", color: "var(--code-fg)" }}>
          {error ? (
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[13px] mt-0.5 shrink-0" style={{ color: "var(--error)" }}>error</span>
              <pre className="whitespace-pre-wrap" style={{ color: "var(--error)" }}>{error}</pre>
            </div>
          ) : result ? (
            <pre className="whitespace-pre-wrap">{formatResult(result)}</pre>
          ) : (
            <div className="flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
              Running...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageContent({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="prose-sm">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim() || "";
          const code = lang ? lines.slice(1).join("\n") : lines.join("\n");
          return (
            <div
              key={i}
              className="my-2 rounded overflow-hidden group relative"
              style={{
                background: "var(--code-bg)",
                border: "1px solid var(--border)",
              }}
            >
              {lang && (
                <div
                  className="px-3 py-1 text-[10px] font-[family-name:var(--font-mono)]"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    color: "var(--fg-muted)",
                  }}
                >
                  {lang}
                </div>
              )}
              <CopyButton text={code} />
              <pre className="px-3 py-2 text-[13px] leading-[20px] overflow-x-auto font-[family-name:var(--font-mono)]">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        return <InlineMarkdown key={i} text={part} />;
      })}
    </div>
  );
}

/* ---- Model selector ---- */

function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const [modelList, setModelList] = useState<{ id: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    modelsApi
      .list()
      .then((res: { data?: { id: string }[] }) => {
        setModelList(res.data || []);
      })
      .catch(() => {});
  }, []);

  if (modelList.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-[family-name:var(--font-mono)] transition-colors hover:bg-white/5"
        style={{
          color: "var(--fg-muted)",
          border: "1px solid var(--border)",
        }}
      >
        <span className="material-symbols-outlined text-[14px]">model_training</span>
        {value || "Select model"}
        <span className="material-symbols-outlined text-[12px]">expand_more</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full mt-1 left-0 z-20 min-w-[220px] rounded-lg shadow-lg py-1 max-h-60 overflow-auto"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            {modelList.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[12px] font-[family-name:var(--font-mono)] transition-colors hover:bg-white/5 flex items-center gap-2"
                style={{
                  color: m.id === value ? "var(--accent)" : "var(--fg-secondary)",
                }}
              >
                {m.id === value && (
                  <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--accent)" }}>check</span>
                )}
                <span className={m.id === value ? "" : "ml-[22px]"}>{m.id}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Main page ---- */

const SLASH_COMMANDS = [
  { name: "help", icon: "help", description: "Show all commands" },
  { name: "compact", icon: "compress", description: "Summarize context to free tokens" },
  { name: "clear", icon: "delete_sweep", description: "Start new conversation" },
  { name: "model", icon: "smart_toy", description: "Switch AI model" },
  { name: "agent", icon: "terminal", description: "Select coding agent" },
  { name: "skills", icon: "psychology", description: "Browse prompt templates" },
  { name: "search", icon: "search", description: "Toggle web search mode" },
  { name: "research", icon: "travel_explore", description: "Toggle deep research mode" },
  { name: "export", icon: "download", description: "Export conversation as markdown" },
  { name: "cost", icon: "payments", description: "Show token usage" },
  { name: "undo", icon: "undo", description: "Undo last file change (git)" },
  { name: "diff", icon: "difference", description: "Show file changes (git)" },
  { name: "logout", icon: "logout", description: "Disconnect" },
];

export default function AgentConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [model, setModel] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamThinking, setStreamThinking] = useState("");
  const [chatMode, setChatMode] = useState<"chat" | "search" | "research">("chat");
  const [researchProgress, setResearchProgress] = useState<{ status: string; round: number; sources: number } | null>(null);
  const [searchPhase, setSearchPhase] = useState<"idle" | "searching" | "reading" | "answering">("idle");
  const [searchResults, setSearchResults] = useState<{ title: string; url: string }[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [skillsList, setSkillsList] = useState<{ id: string; name: string; content: string; category: string }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([]);
  const [showAgentPanel, setShowAgentPanel] = useState(true);
  const [toolCalls, setToolCalls] = useState<{tool: string; params: Record<string, string>; result?: unknown; error?: string; success?: boolean; duration?: number}[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptApplied = useRef(false);

  function loadAgents() {
    agentsApi.list().then((list: AgentInfo[]) => {
      const arr = Array.isArray(list) ? list : [];
      setAgentsList(arr);
      setSelectedAgent((cur) => {
        if (cur) {
          // Keep selection in sync with fresh status
          const fresh = arr.find((a) => a.id === cur.id);
          return fresh || cur;
        }
        const online = arr.filter((a) => a.status === "online");
        return online.length > 0 ? online[0] : null;
      });
    }).catch(() => {});
  }

  // Auto-refresh agent list every 5s
  useEffect(() => {
    loadAgents();
    const t = setInterval(loadAgents, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnectAgent(agentId: string) {
    try {
      await agentsApi.disconnect(agentId);
      if (selectedAgent?.id === agentId) setSelectedAgent(null);
      loadAgents();
    } catch {
      toast("Failed to disconnect agent", "error");
    }
  }

  useEffect(() => {
    conversations
      .get(id)
      .then((data) => {
        const m = data.model || "";
        setModel(m);
        setSelectedModel(m);
        setMessages(
          (data.messages || []).map(
            (m: { id: string; role: string; content: string; thinking?: string; message_type?: string; tool_calls_json?: ToolCall[]; tool_call_id?: string }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              thinking: m.thinking || undefined,
              message_type: m.message_type || "text",
              tool_calls_json: m.tool_calls_json || undefined,
              tool_call_id: m.tool_call_id || undefined,
            })
          )
        );
        if (!promptApplied.current) {
          const prompt = searchParams.get("prompt");
          if (prompt && (data.messages || []).length === 0) {
            setInput(prompt);
          }
          promptApplied.current = true;
        }
      })
      .catch(() => {
        toast("Failed to load conversation", "error");
      })
      .finally(() => setLoading(false));

    loadAgents();
  }, [id, searchParams, toast]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamContent, streamThinking]);

  async function send() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: input };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setStreaming(true);
    setStreamContent("");
    setStreamThinking("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await chatStream({
        conversation_id: id,
        content: userMsg.content,
        agent_id: selectedAgent?.id,
        ...(selectedModel && selectedModel !== model ? { model: selectedModel } : {}),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const errMsg = err.detail || err.text || "Request failed";
        toast(`Error: ${errMsg}`, "error");
        setMessages([
          ...updated,
          { role: "assistant", content: `Error: ${errMsg}` },
        ]);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let rawContent = "";
      let rawThinking = "";

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
          const data = trimmed.slice(6);
          try {
            const msg = JSON.parse(data);
            if (msg.type === "token") {
              if (msg.content) rawContent += msg.content;
              if (msg.reasoning) rawThinking += msg.reasoning;

              const parsed = parseThinkTags(rawContent);
              const thinking = rawThinking || parsed.thinking;
              const content = parsed.content;

              if (thinking) setStreamThinking(thinking);
              if (content) setStreamContent(content);
              else if (rawContent && parsed.thinking) setStreamContent("");
            } else if (msg.type === "tool_call") {
              setToolCalls(prev => [...prev, { tool: msg.tool, params: msg.params }]);
            } else if (msg.type === "tool_result") {
              setToolCalls(prev => prev.map((tc, i) =>
                i === prev.length - 1 ? { ...tc, result: msg.result, error: msg.error, success: msg.success, duration: msg.duration_ms } : tc
              ));
            } else if (msg.type === "done") {
              setStreamContent("");
              setStreamThinking("");
              setToolCalls([]);
              conversations.get(id).then((data) => {
                setMessages(
                  (data.messages || []).map(
                    (msg: { id: string; role: string; content: string; thinking?: string; message_type?: string; tool_calls_json?: ToolCall[]; tool_call_id?: string }) => ({
                      id: msg.id, role: msg.role, content: msg.content,
                      thinking: msg.thinking || undefined,
                      message_type: msg.message_type || "text",
                      tool_calls_json: msg.tool_calls_json || undefined,
                      tool_call_id: msg.tool_call_id || undefined,
                    })
                  )
                );
              }).catch(() => {
                const parsed = parseThinkTags(rawContent);
                setMessages([...updated, {
                  role: "assistant",
                  content: parsed.content || rawContent || "No response",
                  thinking: rawThinking || parsed.thinking || undefined,
                }]);
              });
            } else if (msg.type === "error") {
              toast(`Stream error: ${msg.text}`, "error");
              setMessages([
                ...updated,
                { role: "assistant", content: `Error: ${msg.text}` },
              ]);
              setStreamContent("");
              setStreamThinking("");
              setToolCalls([]);
            }
          } catch {
            /* skip malformed */
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast(`Error: ${msg}`, "error");
        setMessages([
          ...updated,
          { role: "assistant", content: `Error: ${msg}` },
        ]);
      }
      setStreamContent("");
      setStreamThinking("");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    if (streamContent || streamThinking) {
      const parsed = parseThinkTags(streamContent);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: parsed.content || streamContent || "(stopped)",
          thinking: streamThinking || parsed.thinking || undefined,
        },
      ]);
    }
    setStreamContent("");
    setStreamThinking("");
    setStreaming(false);
  }

  async function sendResearch() {
    if (!input.trim() || streaming) return;
    const query = input.trim();
    const userMsg: Message = { role: "user", content: `**Research:** ${query}` };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setStreaming(true);
    setResearchProgress({ status: "planning", round: 0, sources: 0 });

    try {
      const { id: researchId } = await researchApi.start(query, id);
      const res = await researchApi.stream(researchId);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            setResearchProgress({ status: data.status, round: data.round || 0, sources: data.sources || 0 });
            if (data.status === "done" && data.report) {
              setMessages([...updated, { role: "assistant", content: data.report }]);
            } else if (data.status === "failed") {
              setMessages([...updated, { role: "assistant", content: `Research failed: ${data.report || "Unknown error"}` }]);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Research failed";
      setMessages([...updated, { role: "assistant", content: `Error: ${msg}` }]);
      toast(msg, "error");
    } finally {
      setStreaming(false);
      setResearchProgress(null);
    }
  }

  async function sendWithSearch() {
    if (!input.trim() || streaming) return;
    const query = input.trim();
    const userMsg: Message = { role: "user", content: query };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setStreaming(true);
    setStreamContent("");
    setStreamThinking("");
    setSearchPhase("searching");
    setSearchResults([]);

    try {
      const { results } = await searchApi.web(query, 5);
      setSearchPhase("reading");
      setSearchResults(results.map((r: { title: string; url: string }) => ({ title: r.title, url: r.url })));
      await new Promise((r) => setTimeout(r, 800));
      setSearchPhase("answering");
      const searchContext = results.map((r: { title: string; url: string; snippet: string }, i: number) =>
        `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`
      ).join("\n\n");

      const searchPrompt = `Answer this question using the search results below. Cite sources inline with [1], [2], etc. If the results don't contain enough info, say so.\n\nQuestion: ${query}\n\nSearch Results:\n${searchContext}`;

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await chatStream({
        conversation_id: id,
        content: searchPrompt,
        display_content: query,
        model: selectedModel || undefined,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setMessages([...updated, { role: "assistant", content: `Error: ${err.detail || "Search failed"}` }]);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let rawContent = "";
      let rawThinking = "";

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
          const data = trimmed.slice(6);
          try {
            const msg = JSON.parse(data);
            if (msg.type === "token") {
              if (msg.content) rawContent += msg.content;
              if (msg.reasoning) rawThinking += msg.reasoning;
              const parsed = parseThinkTags(rawContent);
              if (rawThinking || parsed.thinking) setStreamThinking(rawThinking || parsed.thinking);
              if (parsed.content) setStreamContent(parsed.content);
            } else if (msg.type === "done") {
              const parsed = parseThinkTags(rawContent);
              const sourcesFooter = "\n\n---\n**Sources:**\n" + results.map((r: { title: string; url: string }, i: number) =>
                `[${i + 1}] [${r.title}](${r.url})`
              ).join("\n");
              setMessages([...updated, {
                role: "assistant",
                content: (parsed.content || rawContent || "No response") + sourcesFooter,
                thinking: rawThinking || parsed.thinking || undefined,
              }]);
              setStreamContent("");
              setStreamThinking("");
            } else if (msg.type === "error") {
              setMessages([...updated, { role: "assistant", content: `Error: ${msg.text}` }]);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const msg = err instanceof Error ? err.message : "Search failed";
        setMessages([...updated, { role: "assistant", content: `Error: ${msg}` }]);
        toast(msg, "error");
      }
    } finally {
      setStreaming(false);
      setStreamContent("");
      setStreamThinking("");
      setSearchPhase("idle");
      setSearchResults([]);
      abortRef.current = null;
    }
  }

  function loadSkills() {
    skillsApi.list().then(setSkillsList).catch(() => {});
  }

  function insertSkill(content: string) {
    setInput((prev) => prev + content);
    setShowSkills(false);
  }

  function handleSlashCommand(cmd: string) {
    setShowSlashCommands(false);
    setInput("");
    switch (cmd) {
      case "clear":
        conversations.create({ mode: "agent" }).then((conv: { id: string }) => router.push(`/chat/agent/${conv.id}`)).catch(() => toast("Failed", "error"));
        break;
      case "compact":
        setInput("Please summarize our conversation so far in a few key points.");
        break;
      case "model":
        break;
      case "agent":
        loadAgents();
        setShowAgentPicker(true);
        break;
      case "skills":
        loadSkills();
        setShowSkills(true);
        break;
      case "search":
        setChatMode(chatMode === "search" ? "chat" : "search");
        break;
      case "research":
        setChatMode(chatMode === "research" ? "chat" : "research");
        break;
      case "export": {
        const md = messages.map(m => `**${m.role}:** ${m.content}`).join("\n\n---\n\n");
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "conversation.md"; a.click();
        URL.revokeObjectURL(url);
        toast("Exported as markdown", "success");
        break;
      }
      case "help":
        toast("Type / to see all commands", "info");
        break;
      case "cost": {
        const tokens = messages.reduce((sum, m) => sum + (m.content?.length || 0) / 3, 0);
        toast(`~${Math.round(tokens)} tokens used in this conversation`, "info");
        break;
      }
      case "undo":
        if (selectedAgent) {
          setInput("Run `git checkout -- .` to undo the last file changes.");
        } else {
          toast("Select an agent first", "info");
        }
        break;
      case "diff":
        if (selectedAgent) {
          setInput("Run `git diff` to show me what files changed.");
        } else {
          toast("Select an agent first", "info");
        }
        break;
      case "logout":
        localStorage.removeItem("token");
        router.push("/login");
        break;
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--fg-muted)" }}>
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading conversation...
      </div>
    );
  }

  const onlineCount = agentsList.filter((a) => a.status === "online").length;

  return (
    <div className="flex h-full">
    <div className="flex flex-col h-full flex-1 min-w-0">
      {/* Header with model selector + Agent Mode */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0 gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
            style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}
          >
            <span className="material-symbols-outlined text-[14px]">terminal</span>
            Agent Mode
          </div>
          {selectedModel && selectedModel !== model && (
            <span
              className="text-[11px] font-[family-name:var(--font-mono)] px-2 py-0.5 rounded"
              style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}
            >
              Model override active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/chat/${id}`}
            className="flex items-center gap-1 text-[12px] transition-colors hover:opacity-80"
            style={{ color: "var(--fg-muted)" }}
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Chat
          </Link>
          <button
            onClick={() => setShowAgentPanel(!showAgentPanel)}
            className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-white/5"
            style={showAgentPanel ? { color: "#a855f7", background: "rgba(168,85,247,0.12)" } : { color: "var(--fg-muted)" }}
            title="Toggle agents panel"
          >
            <span className="material-symbols-outlined text-[14px]">dns</span>
            <span className="hidden md:inline">Agents</span>
            {onlineCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: "var(--success)", color: "#fff" }}>{onlineCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-[60vh]" style={{ color: "var(--fg-muted)" }}>
              <span className="material-symbols-outlined text-[48px] mb-3">terminal</span>
              <p className="text-[14px]">Agent mode &mdash; tools and commands available</p>
              {selectedAgent ? (
                <p className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
                  Connected to <span className="font-semibold" style={{ color: "var(--fg-secondary)" }}>{selectedAgent.name}</span>
                </p>
              ) : (
                <p className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
                  No agent selected &mdash; pick one from the toolbar below
                </p>
              )}
            </div>
          )}

          {messages.map((m, i) => {
            // Skip tool-role messages — they're shown inline with the tool_call
            if (m.role === "tool") return null;

            // Tool call assistant messages — render thinking + ToolCallBlocks
            if (m.role === "assistant" && m.message_type === "tool_call" && m.tool_calls_json) {
              const toolResults = messages.filter(rm => rm.role === "tool" && m.tool_calls_json?.some(tc => tc.id === rm.tool_call_id));
              const parsedTc = parseThinkTags(m.content || "");
              const tcThinking = m.thinking || parsedTc.thinking;
              const tcText = parsedTc.content;
              return (
                <div key={m.id || i} className="flex justify-start animate-fade-in">
                  <div className="max-w-[85%] w-full">
                    {tcThinking && <ThinkingBlock content={tcThinking} />}
                    {tcText && <div className="mb-2 text-[14px] leading-[22px]"><MessageContent text={tcText} /></div>}
                    {m.tool_calls_json.map((tc, j) => {
                      let params: Record<string, string> = {};
                      try { params = JSON.parse(tc.arguments || "{}"); } catch { /* skip */ }
                      const resultMsg = toolResults.find(rm => rm.tool_call_id === tc.id);
                      let result: unknown = undefined;
                      let error: string | undefined;
                      let success: boolean | undefined;
                      if (resultMsg) {
                        try {
                          const parsed = JSON.parse(resultMsg.content);
                          if (parsed.error) { error = parsed.error; success = false; }
                          else { result = parsed; success = true; }
                        } catch { result = resultMsg.content; success = true; }
                      }
                      return <ToolCallBlock key={j} tool={tc.name} params={params} result={result} error={error} success={success} />;
                    })}
                  </div>
                </div>
              );
            }

            return (
            <div
              key={m.id || i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
            >
              <div className="max-w-[85%]">
                {m.role === "assistant" && m.thinking && (
                  <ThinkingBlock content={m.thinking} />
                )}
                {m.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
                      <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--accent)" }}>smart_toy</span>
                    </div>
                    <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>Assistant</span>
                    {model && (
                      <span className="font-[family-name:var(--font-mono)] text-[10px] rounded px-1.5 py-0.5" style={{ color: "var(--fg-muted)", background: "var(--surface)", border: "1px solid var(--border)" }}>
                        {model}
                      </span>
                    )}
                  </div>
                )}
                <div
                  className={`px-4 py-3 rounded-xl text-[14px] leading-[22px] ${m.role === "user" ? "text-white rounded-br-sm" : ""}`}
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)" }
                      : { background: "var(--surface)", border: "1px solid var(--border)" }
                  }
                >
                  <MessageContent text={m.content} />
                </div>
              </div>
            </div>
            );
          })}

          {/* Streaming tool calls */}
          {streaming && toolCalls.length > 0 && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%] w-full">
                {toolCalls.map((tc, i) => <ToolCallBlock key={i} {...tc} isLive />)}
              </div>
            </div>
          )}
          {streaming && (streamContent || streamThinking) && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%]">
                {streamThinking && (
                  <ThinkingBlock content={streamThinking} isStreaming={!streamContent} />
                )}
                {streamContent && (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
                        <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--accent)" }}>smart_toy</span>
                      </div>
                      <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>Assistant</span>
                    </div>
                    <div className="px-4 py-3 rounded-xl text-[14px] leading-[22px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <MessageContent text={streamContent} />
                      <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ background: "var(--accent)" }} />
                    </div>
                  </>
                )}
                {!streamContent && !streamThinking && (
                  <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </div>
                )}
              </div>
            </div>
          )}

          {streaming && !streamContent && !streamThinking && (
            searchPhase !== "idle" ? (
              <SearchIndicator phase={searchPhase} results={searchResults} />
            ) : (
              <div className="flex justify-start animate-fade-in">
                <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Research progress */}
      {researchProgress && (
        <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--accent-subtle)" }}>
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <div className="flex-1 text-[13px]" style={{ color: "var(--accent)" }}>
              <span className="font-semibold capitalize">{researchProgress.status}</span>
              {researchProgress.round > 0 && <span> · Round {researchProgress.round}/5</span>}
              {researchProgress.sources > 0 && <span> · {researchProgress.sources} sources</span>}
            </div>
            <button onClick={stop} className="text-[12px] px-2 py-1 rounded transition-colors hover:bg-white/10" style={{ color: "var(--fg-muted)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pt-3 pb-2" style={{ borderTop: researchProgress ? "none" : "1px solid var(--border)", background: "var(--bg)" }}>
        <div className="max-w-3xl mx-auto">
          {/* Skills picker dropdown */}
          {showSkills && skillsList.length > 0 && (
            <div className="mb-2 rounded-lg border overflow-hidden max-h-[200px] overflow-y-auto" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {skillsList.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => insertSkill(skill.content)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--accent)" }}>psychology</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{skill.name}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--fg-muted)" }}>{skill.content.slice(0, 60)}...</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded ml-auto shrink-0 font-[family-name:var(--font-mono)]" style={{ background: "var(--bg-muted)", color: "var(--fg-muted)" }}>{skill.category}</span>
                </button>
              ))}
            </div>
          )}

          {/* Slash command palette */}
          {showSlashCommands && (
            <div className="mb-2 rounded-lg border overflow-hidden max-h-[300px] overflow-y-auto" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {SLASH_COMMANDS.filter(c => c.name.includes(slashFilter)).map(cmd => (
                <button key={cmd.name} onClick={() => handleSlashCommand(cmd.name)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5">
                  <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--accent)" }}>{cmd.icon}</span>
                  <div>
                    <div className="text-[13px] font-medium font-[family-name:var(--font-mono)]" style={{ color: "var(--fg)" }}>/{cmd.name}</div>
                    <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>{cmd.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Input box */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-end gap-2 px-3 py-2">
              <textarea
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (val.startsWith("/")) {
                    setShowSlashCommands(true);
                    setSlashFilter(val.slice(1).toLowerCase());
                  } else {
                    setShowSlashCommands(false);
                  }
                  if (val.endsWith("/")) { loadSkills(); setShowSkills(true); }
                  else if (showSkills && !val.includes("/")) setShowSkills(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    chatMode === "research" ? sendResearch() : chatMode === "search" ? sendWithSearch() : send();
                  }
                  if (e.key === "Escape") { setShowSkills(false); setShowTools(false); setShowSlashCommands(false); setShowAgentPicker(false); }
                }}
                rows={1}
                className="flex-1 bg-transparent py-1.5 text-[14px] focus:outline-none resize-none max-h-[150px]"
                style={{ color: "var(--fg)" }}
                placeholder={chatMode === "research" ? "What would you like to research?" : chatMode === "search" ? "Search the web..." : selectedAgent ? `Message ${selectedAgent.name}...` : "Select an agent below..."}
                disabled={streaming}
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 150) + "px";
                }}
              />
              {streaming ? (
                <button onClick={stop} className="bg-[#f43f5e] hover:bg-[#e11d48] text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0">
                  <span className="material-symbols-outlined text-[18px]">stop</span>
                </button>
              ) : (
                <button
                  onClick={chatMode === "research" ? sendResearch : chatMode === "search" ? sendWithSearch : send}
                  disabled={!input.trim()}
                  className="t-btn w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {chatMode === "research" ? "travel_explore" : chatMode === "search" ? "search" : "arrow_upward"}
                  </span>
                </button>
              )}
            </div>

            {/* Bottom tool bar */}
            <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-muted)" }}>
              {/* + button */}
              <button
                onClick={() => setShowTools(!showTools)}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: showTools ? "var(--accent)" : "var(--fg-muted)" }}
                title="More tools"
              >
                <span className="material-symbols-outlined text-[18px]" style={{ transform: showTools ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>add</span>
              </button>

              {/* Skills */}
              <button
                onClick={() => { if (!showSkills) loadSkills(); setShowSkills(!showSkills); setShowTools(false); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={{ color: showSkills ? "var(--accent)" : "var(--fg-muted)" }}
                title="Skills (prompt templates)"
              >
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                <span className="hidden sm:inline">Skills</span>
              </button>

              {/* Search */}
              <button
                onClick={() => setChatMode(chatMode === "search" ? "chat" : "search")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={chatMode === "search" ? { color: "var(--accent)", background: "var(--accent-subtle)" } : { color: "var(--fg-muted)" }}
                title="Web search mode"
              >
                <span className="material-symbols-outlined text-[14px]">search</span>
                <span className="hidden sm:inline">Search</span>
              </button>

              {/* Research */}
              <button
                onClick={() => setChatMode(chatMode === "research" ? "chat" : "research")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={chatMode === "research" ? { color: "var(--accent)", background: "var(--accent-subtle)" } : { color: "var(--fg-muted)" }}
                title="Deep research mode"
              >
                <span className="material-symbols-outlined text-[14px]">travel_explore</span>
                <span className="hidden sm:inline">Research</span>
              </button>

              {/* Agent selector */}
              <div className="relative">
                <button
                  onClick={() => { loadAgents(); setShowAgentPicker(!showAgentPicker); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                  style={selectedAgent ? { color: "#a855f7", background: "rgba(168,85,247,0.12)" } : { color: "var(--fg-muted)" }}
                >
                  <span className="material-symbols-outlined text-[14px]">terminal</span>
                  <span className="hidden sm:inline">{selectedAgent ? selectedAgent.name : "Agent"}</span>
                </button>
                {showAgentPicker && (
                  <div className="absolute bottom-full left-0 mb-1 rounded-lg border overflow-hidden min-w-[220px] z-50" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <button onClick={() => { setSelectedAgent(null); setShowAgentPicker(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/5" style={{ color: "var(--fg-secondary)" }}>
                      <span className="material-symbols-outlined text-[14px]">close</span> No agent
                    </button>
                    {agentsList.filter(a => a.status === "online").length === 0 && (
                      <div className="px-3 py-2 text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        No agents online
                      </div>
                    )}
                    {agentsList.filter(a => a.status === "online").map(agent => (
                      <button key={agent.id} onClick={() => { setSelectedAgent(agent); setShowAgentPicker(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/5"
                        style={{ color: selectedAgent?.id === agent.id ? "#a855f7" : "var(--fg-secondary)" }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: "var(--success)" }} />
                        {agent.name} <span style={{ color: "var(--fg-muted)" }}>&middot; {agent.workspace}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1" />
              <span className="text-[10px] font-[family-name:var(--font-mono)] hidden sm:block" style={{ color: "var(--fg-muted)" }}>
                {chatMode !== "chat" && <span style={{ color: "var(--accent)" }}>{chatMode === "search" ? "Search" : "Research"} · </span>}
                / commands · Shift+Enter newline
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Right agent status panel */}
    {showAgentPanel && (
      <aside className="w-[280px] shrink-0 hidden lg:flex flex-col overflow-hidden" style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center justify-between px-3 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]" style={{ color: "#a855f7" }}>dns</span>
            <span className="text-[13px] font-semibold">Agents</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-emphasis)", color: "var(--fg-muted)" }}>{agentsList.length}</span>
          </div>
          <button onClick={() => setShowAgentPanel(false)} className="hover:opacity-70" style={{ color: "var(--fg-muted)" }}>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {agentsList.length === 0 && (
            <div className="text-center py-8 px-3">
              <span className="material-symbols-outlined text-[32px] mb-2" style={{ color: "var(--fg-muted)" }}>computer</span>
              <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>No agents connected</p>
              <Link href="/chat/agents" className="text-[11px] mt-2 inline-block" style={{ color: "var(--accent)" }}>Install an agent →</Link>
            </div>
          )}
          {agentsList.map((agent) => {
            const isSel = selectedAgent?.id === agent.id;
            const dotColor = agent.status === "online" ? "var(--success)" : agent.status === "pending" ? "#eab308" : "var(--fg-muted)";
            return (
              <div key={agent.id} className="rounded-lg p-2.5 transition-colors" style={{ background: isSel ? "rgba(168,85,247,0.08)" : "var(--bg-muted)", border: `1px solid ${isSel ? "#a855f7" : "var(--border)"}` }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                  <span className="material-symbols-outlined text-[14px] shrink-0" style={{ color: "var(--fg-muted)" }}>{agentOsIcon(agent.os)}</span>
                  <span className="text-[13px] font-semibold truncate flex-1">{agent.name || agent.hostname || "Agent"}</span>
                  {isSel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#a855f7", color: "#fff" }}>ACTIVE</span>}
                </div>
                <div className="text-[10px] font-[family-name:var(--font-mono)] space-y-0.5 mb-2" style={{ color: "var(--fg-muted)" }}>
                  <div className="truncate">{agent.os || "Unknown"} · {agent.workspace || "~"}</div>
                  <div>
                    {agent.tools && agent.tools.length > 0 && <span>{agent.tools.length} tools · </span>}
                    <span style={{ textTransform: "capitalize", color: dotColor }}>{agent.status}</span>
                    {agent.status !== "pending" && <span> · {agentRelTime(agent.last_seen)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {agent.status === "pending" ? (
                    <button
                      onClick={async () => { try { await agentsApi.approve(agent.id); loadAgents(); toast("Agent approved", "success"); } catch { toast("Approve failed", "error"); } }}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded transition-colors t-btn"
                    >
                      <span className="material-symbols-outlined text-[13px]">check</span> Approve
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedAgent(isSel ? null : agent)}
                      disabled={agent.status !== "online"}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded transition-colors hover:bg-white/5 disabled:opacity-40"
                      style={{ border: "1px solid var(--border)", color: isSel ? "#a855f7" : "var(--fg-secondary)" }}
                    >
                      <span className="material-symbols-outlined text-[13px]">{isSel ? "check_circle" : "bolt"}</span>
                      {isSel ? "Active" : "Use"}
                    </button>
                  )}
                  <Link href="/chat/agents" title="Terminal & Files" className="flex items-center justify-center w-7 h-7 rounded transition-colors hover:bg-white/5" style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}>
                    <span className="material-symbols-outlined text-[13px]">terminal</span>
                  </Link>
                  <button onClick={() => disconnectAgent(agent.id)} title="Disconnect" className="flex items-center justify-center w-7 h-7 rounded transition-colors hover:bg-white/5" style={{ border: "1px solid var(--border)", color: "var(--error)" }}>
                    <span className="material-symbols-outlined text-[13px]">link_off</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-3 py-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <Link href="/chat/agents" className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded transition-colors hover:bg-white/5 w-full" style={{ color: "var(--fg-secondary)" }}>
            <span className="material-symbols-outlined text-[14px]">settings</span>
            Manage agents
          </Link>
        </div>
      </aside>
    )}
    </div>
  );
}
