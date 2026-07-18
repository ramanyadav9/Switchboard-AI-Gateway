"use client";

import { useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type Tab = "chat" | "stt";
type Message = { role: string; content: string; thinking?: string };

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseThinkTags(text: string): { thinking: string; content: string } {
  const match = text.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (match) return { thinking: match[1].trim(), content: match[2].trim() };
  const openMatch = text.match(/^<think>([\s\S]*)$/);
  if (openMatch) return { thinking: openMatch[1].trim(), content: "" };
  return { thinking: "", content: text };
}

function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
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
          <span className={`material-symbols-outlined text-[12px] transition-transform ${open ? "rotate-90" : ""}`}>chevron_right</span>
        )}
        {isStreaming ? "Thinking..." : open ? "Hide thinking" : "Thought for a moment"}
        {!isStreaming && <span style={{ color: "var(--fg-muted)" }}>({content.length} chars)</span>}
      </button>
      {(open || isStreaming) && (
        <div className="mt-2 px-3 py-2 bg-[#a855f7]/5 border border-[#a855f7]/10 rounded text-[11px] font-[family-name:var(--font-mono)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto" style={{ color: "var(--fg-muted)" }}>
          {content}
          {isStreaming && <span className="inline-block w-1 h-3 bg-[#a855f7] ml-0.5 animate-pulse rounded-sm" />}
        </div>
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>("chat");
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -m-8">
      {/* Top Toolbar */}
      <header className="h-14 border-b flex items-center justify-between px-4 md:px-6 shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <h2 className="text-[18px] leading-[28px] font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--accent)", fontVariationSettings: "'FILL' 1" }}>science</span>
          Playground
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-lg border" style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}>
            <button
              onClick={() => setTab("chat")}
              className={`px-4 py-1.5 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] flex items-center gap-2 transition-colors ${
                tab === "chat" ? "shadow-sm" : ""
              }`}
              style={
                tab === "chat"
                  ? { background: "var(--accent-subtle)", color: "var(--accent)", borderColor: "var(--border-hover)", borderWidth: "1px", borderStyle: "solid" }
                  : { color: "var(--fg-secondary)" }
              }
            >
              <span className="material-symbols-outlined text-[14px]">forum</span>
              Chat
            </button>
            <button
              onClick={() => setTab("stt")}
              className={`px-4 py-1.5 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] flex items-center gap-2 transition-colors ${
                tab === "stt" ? "shadow-sm" : ""
              }`}
              style={
                tab === "stt"
                  ? { background: "var(--accent-subtle)", color: "var(--accent)", borderColor: "var(--border-hover)", borderWidth: "1px", borderStyle: "solid" }
                  : { color: "var(--fg-secondary)" }
              }
            >
              <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
              Speech-to-Text
            </button>
          </div>
          {/* Mobile config toggle (only for chat tab) */}
          {tab === "chat" && (
            <button
              onClick={() => setConfigOpen(!configOpen)}
              className="md:hidden p-2 rounded transition-colors hover:bg-white/5"
              style={{ color: "var(--fg-secondary)" }}
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </button>
          )}
        </div>
        <div className="hidden md:block" />
      </header>

      {tab === "chat" ? <ChatPlayground configOpen={configOpen} setConfigOpen={setConfigOpen} /> : <SttPlayground />}
    </div>
  );
}

function ChatPlayground({ configOpen, setConfigOpen }: { configOpen: boolean; setConfigOpen: (v: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [model, setModel] = useState("Qwen3-14B");
  const [models, setModels] = useState<string[]>(["Qwen3-14B"]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxLength, setMaxLength] = useState(2048);
  const [topP, setTopP] = useState(1.0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/models`, { headers: authHeaders() });
        const data = await res.json();
        const ids: string[] = (data?.data || []).map((m: { id: string }) => m.id).filter(Boolean);
        if (ids.length) { setModels(ids); setModel(ids[0]); }
      } catch { /* keep default */ }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, streamingThinking]);

  async function send() {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input };
    const systemMsgs: { role: string; content: string }[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }]
      : [];
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setLoading(true);
    setStreaming("");
    setStreamingThinking("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          model,
          messages: [...systemMsgs, ...allMessages.map(m => ({ role: m.role, content: m.content }))],
          stream: true,
          temperature,
          max_tokens: maxLength,
          top_p: topP,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setMessages([...allMessages, { role: "assistant", content: `Error: ${err.detail || "Request failed"}` }]);
        setLoading(false);
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
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) rawContent += delta.content;
            if (delta?.reasoning_content) rawThinking += delta.reasoning_content;

            const tp = parseThinkTags(rawContent);
            const thinking = rawThinking || tp.thinking;
            const content = tp.content;
            if (thinking) setStreamingThinking(thinking);
            if (content) setStreaming(content);
            else if (rawContent && tp.thinking) setStreaming("");
          } catch { /* skip */ }
        }
      }

      const tp = parseThinkTags(rawContent);
      const finalThinking = rawThinking || tp.thinking;
      const finalContent = tp.content || rawContent;

      setMessages([...allMessages, {
        role: "assistant",
        content: finalContent || "No response",
        thinking: finalThinking || undefined,
      }]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setMessages([...allMessages, { role: "assistant", content: `Error: ${msg}` }]);
      }
    } finally {
      setStreaming("");
      setStreamingThinking("");
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clearChat() {
    setMessages([]);
    setStreaming("");
    setStreamingThinking("");
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      {/* Mobile config overlay */}
      {configOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setConfigOpen(false)} />
      )}

      {/* Left Panel — Model Configuration */}
      <div
        className={`${configOpen ? "fixed left-0 top-14 bottom-0 z-40 w-[300px]" : "hidden"} md:relative md:block md:w-[300px] border-r p-4 flex flex-col gap-5 overflow-y-auto shrink-0`}
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] leading-[18px]" style={{ color: "var(--fg-secondary)" }}>
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span className="font-semibold">Model Configuration</span>
          </div>
          <button onClick={() => setConfigOpen(false)} className="md:hidden" style={{ color: "var(--fg-secondary)" }}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Model selector */}
        <div className="flex flex-col gap-1">
          <label className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-secondary)" }}>Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="t-input rounded px-3 py-2 text-[13px] font-[family-name:var(--font-mono)]"
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* System Prompt */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <label className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-secondary)" }}>System Prompt</label>
            <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--fg-muted)" }}>help</span>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="t-input rounded px-3 py-2 text-[13px] resize-none font-[family-name:var(--font-mono)]"
            placeholder="You are a helpful AI assistant..."
          />
        </div>

        {/* Temperature */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px]" style={{ color: "var(--fg-secondary)" }}>Temperature</label>
            <span className="font-[family-name:var(--font-mono)] text-[13px] border rounded px-2 py-0.5 w-12 text-center" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>{temperature}</span>
          </div>
          <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-[#c0c1ff]" />
        </div>

        {/* Max Length */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px]" style={{ color: "var(--fg-secondary)" }}>Max Length</label>
            <span className="font-[family-name:var(--font-mono)] text-[13px] border rounded px-2 py-0.5 w-16 text-center" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>{maxLength}</span>
          </div>
          <input type="range" min="256" max="8192" step="256" value={maxLength} onChange={(e) => setMaxLength(parseInt(e.target.value))} className="w-full accent-[#c0c1ff]" />
        </div>

        {/* Top P */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px]" style={{ color: "var(--fg-secondary)" }}>Top P</label>
            <span className="font-[family-name:var(--font-mono)] text-[13px] border rounded px-2 py-0.5 w-12 text-center" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>{topP}</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))} className="w-full accent-[#c0c1ff]" />
        </div>

        {messages.length > 0 && (
          <button onClick={clearChat} className="t-btn-ghost mt-auto text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 justify-center">
            <span className="material-symbols-outlined text-[14px]">delete</span>
            Clear conversation
          </button>
        )}
      </div>

      {/* Right Panel — Chat Area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--bg)" }}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--fg-muted)" }}>
              <span className="material-symbols-outlined text-[48px] mb-3">forum</span>
              <p className="text-[14px]">Send a message to start chatting</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
              <div className="max-w-[80%]">
                {m.role === "assistant" && m.thinking && <ThinkingBlock content={m.thinking} />}
                {m.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
                      <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--accent)" }}>smart_toy</span>
                    </div>
                    <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>Assistant</span>
                    <span className="font-[family-name:var(--font-mono)] text-[11px] rounded px-1.5 py-0.5 border" style={{ color: "var(--fg-muted)", background: "var(--surface)", borderColor: "var(--border)" }}>{model}</span>
                  </div>
                )}
                <div
                  className={`px-4 py-3 rounded-lg text-[14px] leading-[20px] whitespace-pre-wrap ${
                    m.role === "user"
                      ? "text-white rounded-br-sm"
                      : "border font-[family-name:var(--font-mono)] text-[13px] leading-[20px]"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)" }
                      : { background: "var(--surface)", borderColor: "var(--border)" }
                  }
                >
                  {m.content}
                </div>
              </div>
            </div>
          ))}
          {(streaming || streamingThinking) && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[80%]">
                {streamingThinking && (
                  <ThinkingBlock content={streamingThinking} isStreaming={!streaming} />
                )}
                {streaming && (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
                        <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--accent)" }}>smart_toy</span>
                      </div>
                      <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>Assistant</span>
                    </div>
                    <div className="px-4 py-3 rounded-lg text-[13px] leading-[20px] border font-[family-name:var(--font-mono)] whitespace-pre-wrap" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                      {streaming}
                      <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ background: "var(--accent)" }} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-1 transition-colors focus-within:border-[#6366f1]" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              className="flex-1 bg-transparent py-2 text-[14px] focus:outline-none"
              style={{ color: "var(--fg)" }}
              placeholder="Enter a prompt..."
              disabled={loading}
            />
            <button className="p-1 transition-colors hover:opacity-80" style={{ color: "var(--fg-muted)" }}>
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            {loading ? (
              <button
                onClick={stop}
                className="bg-[#f43f5e] hover:bg-[#e11d48] text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">stop</span>
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="t-btn w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 mt-2 text-[11px] font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>
            <span>Direct API · /v1/chat/completions</span>
            <span>&middot;</span>
            <span>Enter to send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type SttMode = "live" | "record" | "upload";

function SttPlayground() {
  const [mode, setMode] = useState<SttMode>("live");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [translated, setTranslated] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveTranslation, setLiveTranslation] = useState("");
  const [detectedLang, setDetectedLang] = useState("");
  const [detectedEmotion, setDetectedEmotion] = useState("");
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sttEngine, setSttEngine] = useState<"sensevoice" | "whisper">("sensevoice");
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [targetLang, setTargetLang] = useState("en");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const WS_BASE = API_BASE.replace(/^http/, "ws");
  const audioCtxRef = useRef<AudioContext | null>(null);

  async function startLive() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;

      const token = localStorage.getItem("token") || "";
      let wsUrl = `${WS_BASE}/ws/transcribe?token=${token}&engine=${sttEngine}&language=auto`;
      if (translateEnabled) wsUrl += `&target_language=${targetLang}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setLiveActive(true);
        setLiveTranscript("");
        setLiveTranslation("");
        setDetectedLang("");
        setDetectedEmotion("");
        setRecordingTime(0);
        timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

        if (sttEngine === "sensevoice") {
          const ctx = new AudioContext({ sampleRate: 16000 });
          audioCtxRef.current = ctx;
          await ctx.audioWorklet.addModule("/pcm-processor.js");
          const source = ctx.createMediaStreamSource(stream);
          const worklet = new AudioWorkletNode(ctx, "pcm-processor");
          worklet.port.onmessage = (e: MessageEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(new Uint8Array(e.data));
            }
          };
          source.connect(worklet);
          worklet.connect(ctx.destination);
        } else {
          const recorder = new MediaRecorder(stream);
          recorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              e.data.arrayBuffer().then((buf) => ws.send(new Uint8Array(buf)));
            }
          };
          recorder.start(250);
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if ((msg.type === "partial" || msg.type === "final") && msg.text) {
            if (sttEngine === "sensevoice") {
              setLiveTranscript((prev) => prev ? prev + " " + msg.text : msg.text);
            } else {
              setLiveTranscript(msg.text);
            }
            if (msg.language) setDetectedLang(msg.language);
            if (msg.emotion) setDetectedEmotion(msg.emotion);
            if (msg.translation) setLiveTranslation(msg.translation);
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => setLiveTranscript((prev) => prev + "\n[Connection error]");
      ws.onclose = () => setLiveActive(false);
    } catch {
      setLiveTranscript("Error: Microphone access denied");
    }
  }

  function stopLive() {
    recorderRef.current?.stop();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }));
      setTimeout(() => wsRef.current?.close(), 1000);
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setLiveActive(false);
    setRecordingTime(0);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setFile(new File([blob], "recording.webm", { type: recorder.mimeType }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      setTranscript("Error: Microphone access denied");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setRecordingTime(0);
  }

  async function doTranslate(text: string) {
    if (!text.trim()) return;
    setTranslating(true);
    try {
      const res = await fetch(`${API_BASE}/me/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text, target_language: targetLang }),
      });
      const data = await res.json();
      setTranslated(data.translated || "");
    } catch {
      setTranslated("[Translation failed]");
    } finally {
      setTranslating(false);
    }
  }

  async function transcribe() {
    if (!file || loading) return;
    setLoading(true);
    setTranscript("");
    setTranslated("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", "whisper-large-v3-turbo");
      const res = await fetch(`${API_BASE}/v1/audio/transcriptions`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();
      const text = data.text || "No transcription returned";
      setTranscript(text);
      if (translateEnabled && text) await doTranslate(text);
    } catch (err: unknown) {
      setTranscript(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  const modeButton = (m: SttMode, icon: string, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] transition-colors ${
        mode === m ? "border" : ""
      }`}
      style={
        mode === m
          ? { background: "var(--accent-subtle)", color: "var(--accent)", borderColor: "var(--border-hover)" }
          : { color: "var(--fg-muted)" }
      }
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="flex-1 p-6 overflow-auto" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex gap-1 rounded-lg p-1 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {modeButton("live", "stream", "Live")}
          {modeButton("record", "mic", "Record")}
          {modeButton("upload", "upload_file", "Upload")}
        </div>

        {/* Config: model + translate */}
        <div className="t-card rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--fg-muted)" }}>model_training</span>
            <div>
              <div className="text-[13px]">STT Model</div>
              <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>{sttEngine === "sensevoice" ? "Fast streaming, emotion detection" : "Accurate batch, 99 languages"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
            <button
              onClick={() => setSttEngine("sensevoice")}
              className="px-3 py-1 rounded text-[11px] font-[family-name:var(--font-mono)] transition"
              style={sttEngine === "sensevoice" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--fg-muted)" }}
            >
              SenseVoice
            </button>
            <button
              onClick={() => setSttEngine("whisper")}
              className="px-3 py-1 rounded text-[11px] font-[family-name:var(--font-mono)] transition"
              style={sttEngine === "whisper" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--fg-muted)" }}
            >
              Whisper
            </button>
          </div>
        </div>

        <div className="t-card rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--fg-muted)" }}>translate</span>
            <div>
              <div className="text-[13px]">Translate after transcription</div>
              <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Auto-detect language, optionally translate via LLM</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {translateEnabled && (
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="t-input rounded px-2 py-1 text-[12px] font-[family-name:var(--font-mono)]"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
                <option value="ar">Arabic</option>
                <option value="ko">Korean</option>
              </select>
            )}
            <button
              onClick={() => setTranslateEnabled(!translateEnabled)}
              className="w-10 h-5 rounded-full transition-colors relative"
              style={{ background: translateEnabled ? "var(--accent)" : "var(--bg-emphasis)" }}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${translateEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        {mode === "live" && (
          <div className="t-card rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-secondary)" }}>Live transcription</div>
              {liveActive && (
                <span className="flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-mono)] text-[#ff4444]">
                  <span className="w-2 h-2 rounded-full bg-[#ff4444] animate-pulse" />
                  LIVE {formatTime(recordingTime)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={liveActive ? stopLive : startLive}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  liveActive
                    ? "bg-[#ff4444] hover:bg-[#cc3333] shadow-[0_0_24px_rgba(255,68,68,0.3)]"
                    : "hover:opacity-90 shadow-[0_0_24px_rgba(99,102,241,0.15)]"
                }`}
                style={!liveActive ? { background: "var(--accent)" } : undefined}
              >
                <span className="material-symbols-outlined text-white text-[28px]">{liveActive ? "stop" : "stream"}</span>
              </button>
              <div>
                <div className="text-[14px]">{liveActive ? "Listening & transcribing..." : "Start live transcription"}</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{liveActive ? "Auto-detects language per phrase — switch anytime" : "Speak in any language, switch mid-conversation"}</div>
              </div>
            </div>
            <div>
              {(detectedLang || detectedEmotion) && (
                <div className="flex items-center gap-2 mb-2">
                  {detectedLang && (
                    <>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-muted)" }}>Lang</span>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] bg-[#6366f1]/15 text-[#c0c1ff] px-2 py-0.5 rounded border border-[#6366f1]/20">{detectedLang}</span>
                    </>
                  )}
                  {detectedEmotion && (
                    <>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-muted)" }}>Emotion</span>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] bg-[#ffb783]/15 text-[#ffb783] px-2 py-0.5 rounded border border-[#ffb783]/20">{detectedEmotion}</span>
                    </>
                  )}
                </div>
              )}
              <div className="border rounded p-4 min-h-[100px] text-[13px] leading-[20px] whitespace-pre-wrap font-[family-name:var(--font-mono)]" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>
                {liveTranscript || <span style={{ color: "var(--fg-muted)" }}>{liveActive ? "Waiting for speech..." : "Transcript will appear here..."}</span>}
                {liveActive && <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ background: "var(--accent)" }} />}
              </div>
            </div>
            {liveTranslation && (
              <div className="animate-fade-in">
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase mb-2 flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  Translation ({targetLang.toUpperCase()})
                </div>
                <div className="border rounded p-4 text-[13px] leading-[20px] whitespace-pre-wrap font-[family-name:var(--font-mono)]" style={{ background: "var(--code-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}>
                  {liveTranslation}
                  {liveActive && <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ background: "var(--accent)" }} />}
                </div>
              </div>
            )}
            {liveTranscript && !liveActive && (
              <div className="flex items-center gap-3">
                <button onClick={() => navigator.clipboard.writeText(liveTranscript)} className="text-[12px] hover:opacity-80 transition flex items-center gap-1 font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  Copy
                </button>
                {translateEnabled && !translated && (
                  <button
                    onClick={() => doTranslate(liveTranscript)}
                    disabled={translating}
                    className="text-[12px] hover:opacity-80 transition flex items-center gap-1 font-[family-name:var(--font-mono)]"
                    style={{ color: "var(--accent)" }}
                  >
                    <span className="material-symbols-outlined text-[14px]">translate</span>
                    {translating ? "Translating..." : `Translate to ${targetLang.toUpperCase()}`}
                  </button>
                )}
              </div>
            )}
            {translated && !liveActive && (
              <div className="animate-fade-in">
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase mb-2 flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  Translation ({targetLang.toUpperCase()})
                </div>
                <div className="border rounded p-4 text-[13px] leading-[20px] whitespace-pre-wrap font-[family-name:var(--font-mono)]" style={{ background: "var(--code-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}>{translated}</div>
              </div>
            )}
          </div>
        )}

        {mode === "record" && (
          <div className="t-card rounded-lg p-6 space-y-5">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-secondary)" }}>Record then transcribe</div>
            <div className="flex items-center gap-4">
              <button onClick={recording ? stopRecording : startRecording} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shrink-0 ${recording ? "bg-[#ff4444] hover:bg-[#cc3333] animate-pulse shadow-[0_0_20px_rgba(255,68,68,0.3)]" : "hover:opacity-90 shadow-[0_0_20px_rgba(99,102,241,0.2)]"}`} style={!recording ? { background: "var(--accent)" } : undefined}>
                <span className="material-symbols-outlined text-white text-[28px]">{recording ? "stop" : "mic"}</span>
              </button>
              <div>
                <div className="text-[14px]">
                  {recording ? <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ff4444] animate-pulse" />Recording... {formatTime(recordingTime)}</span> : file ? file.name : "Click to record"}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{recording ? "Click stop, then transcribe" : "Record audio, then send to Whisper"}</div>
              </div>
            </div>
            <button onClick={transcribe} disabled={!file || loading || recording} className="t-btn text-[14px] font-medium px-4 py-2.5 rounded flex items-center gap-2 transition-colors disabled:opacity-40 w-full justify-center">
              {loading && <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              {loading ? "Transcribing..." : "Transcribe"}
            </button>
          </div>
        )}

        {mode === "upload" && (
          <div className="t-card rounded-lg p-6 space-y-5">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-secondary)" }}>Upload audio file</div>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-lg py-8 cursor-pointer hover:opacity-80 transition" style={{ borderColor: "var(--border)", background: "var(--code-bg)" }}>
              <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              <span className="material-symbols-outlined text-[24px]" style={{ color: "var(--fg-muted)" }}>upload_file</span>
              <span className="text-[14px]" style={{ color: "var(--fg-secondary)" }}>{file ? file.name : "Click to select an audio file"}</span>
            </label>
            <button onClick={transcribe} disabled={!file || loading} className="t-btn text-[14px] font-medium px-4 py-2.5 rounded flex items-center gap-2 transition-colors disabled:opacity-40 w-full justify-center">
              {loading && <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              {loading ? "Transcribing..." : "Transcribe"}
            </button>
          </div>
        )}

        {/* Transcript + Translation (record/upload) */}
        {transcript && mode !== "live" && (
          <div className="t-card rounded-lg p-6 animate-fade-in space-y-4">
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase mb-2" style={{ color: "var(--fg-secondary)" }}>Transcript</div>
              <div className="border rounded p-4 text-[13px] leading-[20px] whitespace-pre-wrap font-[family-name:var(--font-mono)]" style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}>{transcript}</div>
            </div>
            {translated && (
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase mb-2 flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  Translation ({targetLang.toUpperCase()})
                </div>
                <div className="border rounded p-4 text-[13px] leading-[20px] whitespace-pre-wrap font-[family-name:var(--font-mono)]" style={{ background: "var(--code-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}>{translated}</div>
              </div>
            )}
            {translating && (
              <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Translating...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
