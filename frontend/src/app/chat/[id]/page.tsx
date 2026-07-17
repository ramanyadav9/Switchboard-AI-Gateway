"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { conversations, chatStream } from "@/lib/api";

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
          <span className="text-[#464554]">({content.length} chars)</span>
        )}
      </button>
      {(open || isStreaming) && (
        <div className="mt-2 px-3 py-2 bg-[#a855f7]/5 border border-[#a855f7]/10 rounded text-[11px] font-[family-name:var(--font-mono)] text-[#908fa0] leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
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
      className="absolute top-2 right-2 text-[10px] font-[family-name:var(--font-mono)] text-[#908fa0] hover:text-[#e5e2e1] bg-[#171717] border border-[#262626] rounded px-1.5 py-0.5 transition opacity-0 group-hover:opacity-100"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MessageContent({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim() || "";
          const code = lang ? lines.slice(1).join("\n") : lines.join("\n");
          return (
            <div
              key={i}
              className="my-2 bg-[#050505] border border-[#262626] rounded overflow-hidden group relative"
            >
              {lang && (
                <div className="px-3 py-1 border-b border-[#262626] text-[10px] text-[#908fa0] font-[family-name:var(--font-mono)]">
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
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </>
  );
}

export default function ConversationPage() {
  const params = useParams();
  const id = params.id as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamThinking, setStreamThinking] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    conversations
      .get(id)
      .then((data) => {
        setModel(data.model || "");
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
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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
      const res = await chatStream(
        { conversation_id: id, content: userMsg.content },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setMessages([
          ...updated,
          { role: "assistant", content: `Error: ${err.detail || err.text || "Request failed"}` },
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#908fa0]">
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
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-[#464554]">
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
              <div className={`max-w-[85%] ${m.role === "user" ? "" : ""}`}>
                {m.role === "assistant" && m.thinking && (
                  <ThinkingBlock content={m.thinking} />
                )}
                {m.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded bg-[#c0c1ff] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[12px] text-[#1000a9]">
                        smart_toy
                      </span>
                    </div>
                    <span className="text-[12px] text-[#c7c4d7]">
                      Assistant
                    </span>
                    {model && (
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#464554] bg-[#171717] border border-[#262626] rounded px-1.5 py-0.5">
                        {model}
                      </span>
                    )}
                  </div>
                )}
                <div
                  className={`px-4 py-3 rounded-xl text-[14px] leading-[22px] ${
                    m.role === "user"
                      ? "bg-[#6366f1] text-white rounded-br-sm"
                      : "bg-[#171717] border border-[#262626] text-[#e5e2e1]"
                  }`}
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
                      <div className="w-5 h-5 rounded bg-[#c0c1ff] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[12px] text-[#1000a9]">
                          smart_toy
                        </span>
                      </div>
                      <span className="text-[12px] text-[#c7c4d7]">
                        Assistant
                      </span>
                    </div>
                    <div className="px-4 py-3 rounded-xl text-[14px] leading-[22px] bg-[#171717] border border-[#262626] text-[#e5e2e1]">
                      <MessageContent text={streamContent} />
                      <span className="inline-block w-1.5 h-4 bg-[#c0c1ff] ml-0.5 animate-pulse rounded-sm" />
                    </div>
                  </>
                )}
                {!streamContent && !streamThinking && (
                  <div className="flex items-center gap-2 text-[#908fa0] text-[13px]">
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
            <div className="flex justify-start animate-fade-in">
              <div className="flex items-center gap-2 text-[#908fa0] text-[13px]">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#262626] bg-[#131313] p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2 focus-within:border-[#6366f1] transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              className="flex-1 bg-transparent py-1.5 text-[14px] text-[#e5e2e1] placeholder:text-[#464554] focus:outline-none resize-none max-h-[150px]"
              placeholder="Message Switchboard..."
              disabled={streaming}
              style={{ minHeight: "24px" }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 150) + "px";
              }}
            />
            {streaming ? (
              <button
                onClick={stop}
                className="bg-[#f43f5e] hover:bg-[#e11d48] text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">
                  stop
                </span>
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="bg-[#6366f1] hover:bg-[#4f46e5] text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">
                  arrow_upward
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-[#464554] font-[family-name:var(--font-mono)]">
            <span>Shift + Enter for new line</span>
            <span>&middot;</span>
            <span>Switchboard can make mistakes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
