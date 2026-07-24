"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { conversations, chatStream, models as modelsApi, skills as skillsApi, research as researchApi, search as searchApi } from "@/lib/api";
import { useToast } from "@/components/toast";

type Message = { id?: string; role: string; content: string; thinking?: string };

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

    // Headings
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

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }

    // Ordered list
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
          {/* Steps */}
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

          {/* Animated status */}
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

          {/* Source cards (appear during reading phase) */}
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

export default function ConversationPage() {
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptApplied = useRef(false);

  useEffect(() => {
    conversations
      .get(id)
      .then((data) => {
        const m = data.model || "";
        setModel(m);
        setSelectedModel(m);
        setMessages(
          (data.messages || []).map(
            (m: { id: string; role: string; content: string; thinking?: string }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              thinking: m.thinking || undefined,
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
            } else if (msg.type === "done") {
              const parsed = parseThinkTags(rawContent);
              const finalThinking = rawThinking || parsed.thinking;
              const finalContent = parsed.content || rawContent;
              setMessages([
                ...updated,
                {
                  role: "assistant",
                  content: finalContent || "No response",
                  thinking: finalThinking || undefined,
                },
              ]);
              setStreamContent("");
              setStreamThinking("");
            } else if (msg.type === "error") {
              toast(`Stream error: ${msg.text}`, "error");
              setMessages([
                ...updated,
                { role: "assistant", content: `Error: ${msg.text}` },
              ]);
              setStreamContent("");
              setStreamThinking("");
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
    const userMsg: Message = { role: "user", content: `🔍 **Research:** ${query}` };
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--fg-muted)" }}>
        <svg
          className="animate-spin h-5 w-5 mr-2"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading conversation...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with model selector */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <ModelSelector
          value={selectedModel}
          onChange={setSelectedModel}
        />
        {selectedModel && selectedModel !== model && (
          <span
            className="text-[11px] font-[family-name:var(--font-mono)] px-2 py-0.5 rounded"
            style={{
              color: "var(--accent)",
              background: "var(--accent-subtle)",
            }}
          >
            Model override active
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-[60vh]" style={{ color: "var(--fg-muted)" }}>
              <span className="material-symbols-outlined text-[48px] mb-3">
                forum
              </span>
              <p className="text-[14px]">Send a message to start chatting</p>
            </div>
          )}

          {messages.map((m, i) => (
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
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                      style={{ background: "var(--accent-subtle)" }}
                    >
                      <span
                        className="material-symbols-outlined text-[12px]"
                        style={{ color: "var(--accent)" }}
                      >
                        smart_toy
                      </span>
                    </div>
                    <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                      Assistant
                    </span>
                    {model && (
                      <span
                        className="font-[family-name:var(--font-mono)] text-[10px] rounded px-1.5 py-0.5"
                        style={{
                          color: "var(--fg-muted)",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {model}
                      </span>
                    )}
                  </div>
                )}
                <div
                  className={`px-4 py-3 rounded-xl text-[14px] leading-[22px] ${
                    m.role === "user" ? "text-white rounded-br-sm" : ""
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)" }
                      : {
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                        }
                  }
                >
                  <MessageContent text={m.content} />
                </div>
              </div>
            </div>
          ))}

          {/* Streaming */}
          {streaming && (streamContent || streamThinking) && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%]">
                {streamThinking && (
                  <ThinkingBlock
                    content={streamThinking}
                    isStreaming={!streamContent}
                  />
                )}
                {streamContent && (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ background: "var(--accent-subtle)" }}
                      >
                        <span
                          className="material-symbols-outlined text-[12px]"
                          style={{ color: "var(--accent)" }}
                        >
                          smart_toy
                        </span>
                      </div>
                      <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                        Assistant
                      </span>
                    </div>
                    <div
                      className="px-4 py-3 rounded-xl text-[14px] leading-[22px]"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <MessageContent text={streamContent} />
                      <span
                        className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm"
                        style={{ background: "var(--accent)" }}
                      />
                    </div>
                  </>
                )}
                {!streamContent && !streamThinking && (
                  <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
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

          {/* Input box */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-end gap-2 px-3 py-2">
              <textarea
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (val.endsWith("/")) { loadSkills(); setShowSkills(true); }
                  else if (showSkills && !val.includes("/")) setShowSkills(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    chatMode === "research" ? sendResearch() : chatMode === "search" ? sendWithSearch() : send();
                  }
                  if (e.key === "Escape") { setShowSkills(false); setShowTools(false); }
                }}
                rows={1}
                className="flex-1 bg-transparent py-1.5 text-[14px] focus:outline-none resize-none max-h-[150px]"
                style={{ color: "var(--fg)" }}
                placeholder={chatMode === "research" ? "What would you like to research?" : chatMode === "search" ? "Search the web..." : "Message Switchboard..."}
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

              {/* Tool buttons — always visible */}
              <button
                onClick={() => { if (!showSkills) loadSkills(); setShowSkills(!showSkills); setShowTools(false); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={{ color: showSkills ? "var(--accent)" : "var(--fg-muted)" }}
                title="Skills (prompt templates)"
              >
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                <span className="hidden sm:inline">Skills</span>
              </button>

              <button
                onClick={() => setChatMode(chatMode === "search" ? "chat" : "search")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={chatMode === "search" ? { color: "var(--accent)", background: "var(--accent-subtle)" } : { color: "var(--fg-muted)" }}
                title="Web search mode"
              >
                <span className="material-symbols-outlined text-[14px]">search</span>
                <span className="hidden sm:inline">Search</span>
              </button>

              <button
                onClick={() => setChatMode(chatMode === "research" ? "chat" : "research")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={chatMode === "research" ? { color: "var(--accent)", background: "var(--accent-subtle)" } : { color: "var(--fg-muted)" }}
                title="Deep research mode"
              >
                <span className="material-symbols-outlined text-[14px]">travel_explore</span>
                <span className="hidden sm:inline">Research</span>
              </button>

              {/* Agent mode button — switches this conversation to agent mode */}
              <button
                onClick={async () => {
                  try { await conversations.update(id, { mode: "agent" } as never); } catch {}
                  router.push(`/chat/agent/${id}`);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors hover:bg-white/5"
                style={{ color: "var(--fg-muted)" }}
                title="Switch to Agent Mode"
              >
                <span className="material-symbols-outlined text-[14px]">terminal</span>
                <span className="hidden sm:inline">Agent</span>
              </button>

              <div className="flex-1" />
              <span className="text-[10px] font-[family-name:var(--font-mono)] hidden sm:block" style={{ color: "var(--fg-muted)" }}>
                {chatMode !== "chat" && <span style={{ color: "var(--accent)" }}>{chatMode === "search" ? "🔍 Search" : "🌐 Research"} · </span>}
                ⇧↵ newline
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
