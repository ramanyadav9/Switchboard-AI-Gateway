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
        {!isStreaming && <span className="text-[#464554]">({content.length} chars)</span>}
      </button>
      {(open || isStreaming) && (
        <div className="mt-2 px-3 py-2 bg-[#a855f7]/5 border border-[#a855f7]/10 rounded text-[11px] font-[family-name:var(--font-mono)] text-[#908fa0] leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
          {content}
          {isStreaming && <span className="inline-block w-1 h-3 bg-[#a855f7] ml-0.5 animate-pulse rounded-sm" />}
        </div>
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -m-8">
      {/* Top Toolbar */}
      <header className="h-14 border-b border-[#353534] flex items-center justify-between px-6 bg-[#131313] shrink-0">
        <h2 className="text-[18px] leading-[28px] font-semibold text-[#e5e2e1] flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#c0c1ff]" style={{ fontVariationSettings: "'FILL' 1" }}>science</span>
          Playground
        </h2>
        <div className="flex p-1 bg-[#201f1f] rounded-lg border border-[#353534]">
          <button
            onClick={() => setTab("chat")}
            className={`px-4 py-1.5 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] flex items-center gap-2 transition-colors ${
              tab === "chat"
                ? "bg-[#353534] text-[#c0c1ff] border border-[#464554] shadow-sm"
                : "text-[#c7c4d7] hover:text-[#e5e2e1]"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">forum</span>
            Chat
          </button>
          <button
            onClick={() => setTab("stt")}
            className={`px-4 py-1.5 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] flex items-center gap-2 transition-colors ${
              tab === "stt"
                ? "bg-[#353534] text-[#c0c1ff] border border-[#464554] shadow-sm"
                : "text-[#c7c4d7] hover:text-[#e5e2e1]"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
            Speech-to-Text
          </button>
        </div>
        <div />
      </header>

      {tab === "chat" ? <ChatPlayground /> : <SttPlayground />}
    </div>
  );
}

function ChatPlayground() {
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
    <div className="flex flex-1 min-h-0">
      {/* Left Panel — Model Configuration */}
      <div className="w-[300px] border-r border-[#262626] bg-[#131313] p-4 flex flex-col gap-5 overflow-y-auto shrink-0">
        <div className="flex items-center gap-2 text-[12px] leading-[18px] text-[#c7c4d7]">
          <span className="material-symbols-outlined text-[16px]">tune</span>
          <span className="font-semibold text-[#e5e2e1]">Model Configuration</span>
        </div>

        {/* Model selector */}
        <div className="flex flex-col gap-1">
          <label className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 text-[13px] text-[#e5e2e1] focus:outline-none focus:border-[#6366f1] transition-colors font-[family-name:var(--font-mono)]"
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* System Prompt */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <label className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">System Prompt</label>
            <span className="material-symbols-outlined text-[14px] text-[#464554]">help</span>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 text-[13px] text-[#e5e2e1] placeholder:text-[#464554] focus:outline-none focus:border-[#6366f1] transition-colors resize-none font-[family-name:var(--font-mono)]"
            placeholder="You are a helpful AI assistant..."
          />
        </div>

        {/* Temperature */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px] text-[#c7c4d7]">Temperature</label>
            <span className="font-[family-name:var(--font-mono)] text-[13px] text-[#e5e2e1] bg-[#0a0a0a] border border-[#262626] rounded px-2 py-0.5 w-12 text-center">{temperature}</span>
          </div>
          <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-[#c0c1ff]" />
        </div>

        {/* Max Length */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px] text-[#c7c4d7]">Max Length</label>
            <span className="font-[family-name:var(--font-mono)] text-[13px] text-[#e5e2e1] bg-[#0a0a0a] border border-[#262626] rounded px-2 py-0.5 w-16 text-center">{maxLength}</span>
          </div>
          <input type="range" min="256" max="8192" step="256" value={maxLength} onChange={(e) => setMaxLength(parseInt(e.target.value))} className="w-full accent-[#c0c1ff]" />
        </div>

        {/* Top P */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px] text-[#c7c4d7]">Top P</label>
            <span className="font-[family-name:var(--font-mono)] text-[13px] text-[#e5e2e1] bg-[#0a0a0a] border border-[#262626] rounded px-2 py-0.5 w-12 text-center">{topP}</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))} className="w-full accent-[#c0c1ff]" />
        </div>

        {messages.length > 0 && (
          <button onClick={clearChat} className="mt-auto border border-[#262626] text-[#c7c4d7] hover:bg-[#262626] hover:text-[#e5e2e1] text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 justify-center">
            <span className="material-symbols-outlined text-[14px]">delete</span>
            Clear conversation
          </button>
        )}
      </div>

      {/* Right Panel — Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-[#464554]">
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
                    <div className="w-5 h-5 rounded bg-[#c0c1ff] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[12px] text-[#1000a9]">smart_toy</span>
                    </div>
                    <span className="text-[12px] text-[#c7c4d7]">Assistant</span>
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#464554] bg-[#171717] border border-[#262626] rounded px-1.5 py-0.5">{model}</span>
                  </div>
                )}
                <div className={`px-4 py-3 rounded-lg text-[14px] leading-[20px] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[#6366f1] text-white rounded-br-sm"
                    : "bg-[#171717] border border-[#262626] text-[#e5e2e1] font-[family-name:var(--font-mono)] text-[13px] leading-[20px]"
                }`}>
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
                      <div className="w-5 h-5 rounded bg-[#c0c1ff] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[12px] text-[#1000a9]">smart_toy</span>
                      </div>
                      <span className="text-[12px] text-[#c7c4d7]">Assistant</span>
                    </div>
                    <div className="px-4 py-3 rounded-lg text-[13px] leading-[20px] bg-[#171717] border border-[#262626] text-[#e5e2e1] font-[family-name:var(--font-mono)] whitespace-pre-wrap">
                      {streaming}
                      <span className="inline-block w-1.5 h-4 bg-[#c0c1ff] ml-0.5 animate-pulse rounded-sm" />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-[#262626] p-4 bg-[#131313]">
          <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1 focus-within:border-[#6366f1] transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              className="flex-1 bg-transparent py-2 text-[14px] text-[#e5e2e1] placeholder:text-[#464554] focus:outline-none"
              placeholder="Enter a prompt..."
              disabled={loading}
            />
            <button className="text-[#908fa0] hover:text-[#c7c4d7] transition-colors p-1">
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
                className="bg-[#6366f1] hover:bg-[#4f46e5] text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-[#464554] font-[family-name:var(--font-mono)]">
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
          // Raw PCM via AudioWorklet — no container format
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
          // Whisper: MediaRecorder WebM (WhisperLiveKit handles it)
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

  // ── Record: capture full audio, then transcribe ──
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
        mode === m
          ? "bg-[#353534] text-[#c0c1ff] border border-[#464554]"
          : "text-[#908fa0] hover:text-[#c7c4d7]"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="flex-1 p-6 overflow-auto bg-[#0a0a0a]">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex gap-1 bg-[#171717] border border-[#262626] rounded-lg p-1">
          {modeButton("live", "stream", "Live")}
          {modeButton("record", "mic", "Record")}
          {modeButton("upload", "upload_file", "Upload")}
        </div>

        {/* Config: model + translate */}
        <div className="bg-[#171717] border border-[#262626] rounded-lg px-4 py-3 flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-[#908fa0]">model_training</span>
            <div>
              <div className="text-[13px] text-[#e5e2e1]">STT Model</div>
              <div className="text-[11px] text-[#908fa0]">{sttEngine === "sensevoice" ? "Fast streaming, emotion detection" : "Accurate batch, 99 languages"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-[#0a0a0a] border border-[#262626] rounded-lg p-0.5">
            <button
              onClick={() => setSttEngine("sensevoice")}
              className={`px-3 py-1 rounded text-[11px] font-[family-name:var(--font-mono)] transition ${
                sttEngine === "sensevoice" ? "bg-[#6366f1] text-white" : "text-[#908fa0] hover:text-[#c7c4d7]"
              }`}
            >
              SenseVoice
            </button>
            <button
              onClick={() => setSttEngine("whisper")}
              className={`px-3 py-1 rounded text-[11px] font-[family-name:var(--font-mono)] transition ${
                sttEngine === "whisper" ? "bg-[#6366f1] text-white" : "text-[#908fa0] hover:text-[#c7c4d7]"
              }`}
            >
              Whisper
            </button>
          </div>
        </div>

        <div className="bg-[#171717] border border-[#262626] rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-[#908fa0]">translate</span>
            <div>
              <div className="text-[13px] text-[#e5e2e1]">Translate after transcription</div>
              <div className="text-[11px] text-[#908fa0]">Auto-detect language, optionally translate via LLM</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {translateEnabled && (
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="bg-[#0a0a0a] border border-[#262626] rounded px-2 py-1 text-[12px] text-[#e5e2e1] font-[family-name:var(--font-mono)] focus:outline-none focus:border-[#6366f1]"
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
              className={`w-10 h-5 rounded-full transition-colors relative ${translateEnabled ? "bg-[#6366f1]" : "bg-[#353534]"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${translateEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        {mode === "live" && (
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Live transcription</div>
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
                    : "bg-[#6366f1] hover:bg-[#4f46e5] shadow-[0_0_24px_rgba(99,102,241,0.15)]"
                }`}
              >
                <span className="material-symbols-outlined text-white text-[28px]">{liveActive ? "stop" : "stream"}</span>
              </button>
              <div>
                <div className="text-[14px] text-[#e5e2e1]">{liveActive ? "Listening & transcribing..." : "Start live transcription"}</div>
                <div className="text-[12px] text-[#908fa0] mt-0.5">{liveActive ? "Auto-detects language per phrase — switch anytime" : "Speak in any language, switch mid-conversation"}</div>
              </div>
            </div>
            <div>
              {(detectedLang || detectedEmotion) && (
                <div className="flex items-center gap-2 mb-2">
                  {detectedLang && (
                    <>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#908fa0] uppercase">Lang</span>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] bg-[#6366f1]/15 text-[#c0c1ff] px-2 py-0.5 rounded border border-[#6366f1]/20">{detectedLang}</span>
                    </>
                  )}
                  {detectedEmotion && (
                    <>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#908fa0] uppercase">Emotion</span>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] bg-[#ffb783]/15 text-[#ffb783] px-2 py-0.5 rounded border border-[#ffb783]/20">{detectedEmotion}</span>
                    </>
                  )}
                </div>
              )}
              <div className="bg-[#050505] border border-[#262626] rounded p-4 min-h-[100px] text-[13px] leading-[20px] text-[#e5e2e1] whitespace-pre-wrap font-[family-name:var(--font-mono)]">
                {liveTranscript || <span className="text-[#464554]">{liveActive ? "Waiting for speech..." : "Transcript will appear here..."}</span>}
                {liveActive && <span className="inline-block w-1.5 h-4 bg-[#6366f1] ml-0.5 animate-pulse rounded-sm" />}
              </div>
            </div>
            {liveTranslation && (
              <div className="animate-fade-in">
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#6366f1] uppercase mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  Translation ({targetLang.toUpperCase()})
                </div>
                <div className="bg-[#050505] border border-[#6366f1]/20 rounded p-4 text-[13px] leading-[20px] text-[#c0c1ff] whitespace-pre-wrap font-[family-name:var(--font-mono)]">
                  {liveTranslation}
                  {liveActive && <span className="inline-block w-1.5 h-4 bg-[#6366f1] ml-0.5 animate-pulse rounded-sm" />}
                </div>
              </div>
            )}
            {liveTranscript && !liveActive && (
              <div className="flex items-center gap-3">
                <button onClick={() => navigator.clipboard.writeText(liveTranscript)} className="text-[12px] text-[#908fa0] hover:text-[#c7c4d7] transition flex items-center gap-1 font-[family-name:var(--font-mono)]">
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  Copy
                </button>
                {translateEnabled && !translated && (
                  <button
                    onClick={() => doTranslate(liveTranscript)}
                    disabled={translating}
                    className="text-[12px] text-[#6366f1] hover:text-[#c0c1ff] transition flex items-center gap-1 font-[family-name:var(--font-mono)]"
                  >
                    <span className="material-symbols-outlined text-[14px]">translate</span>
                    {translating ? "Translating..." : `Translate to ${targetLang.toUpperCase()}`}
                  </button>
                )}
              </div>
            )}
            {translated && !liveActive && (
              <div className="animate-fade-in">
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#6366f1] uppercase mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  Translation ({targetLang.toUpperCase()})
                </div>
                <div className="bg-[#050505] border border-[#6366f1]/20 rounded p-4 text-[13px] leading-[20px] text-[#c0c1ff] whitespace-pre-wrap font-[family-name:var(--font-mono)]">{translated}</div>
              </div>
            )}
          </div>
        )}

        {mode === "record" && (
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 space-y-5">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Record then transcribe</div>
            <div className="flex items-center gap-4">
              <button onClick={recording ? stopRecording : startRecording} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shrink-0 ${recording ? "bg-[#ff4444] hover:bg-[#cc3333] animate-pulse shadow-[0_0_20px_rgba(255,68,68,0.3)]" : "bg-[#6366f1] hover:bg-[#4f46e5] shadow-[0_0_20px_rgba(99,102,241,0.2)]"}`}>
                <span className="material-symbols-outlined text-white text-[28px]">{recording ? "stop" : "mic"}</span>
              </button>
              <div>
                <div className="text-[14px] text-[#e5e2e1]">
                  {recording ? <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ff4444] animate-pulse" />Recording... {formatTime(recordingTime)}</span> : file ? file.name : "Click to record"}
                </div>
                <div className="text-[12px] text-[#908fa0] mt-0.5">{recording ? "Click stop, then transcribe" : "Record audio, then send to Whisper"}</div>
              </div>
            </div>
            <button onClick={transcribe} disabled={!file || loading || recording} className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[14px] font-medium px-4 py-2.5 rounded flex items-center gap-2 transition-colors disabled:opacity-40 w-full justify-center">
              {loading && <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              {loading ? "Transcribing..." : "Transcribe"}
            </button>
          </div>
        )}

        {mode === "upload" && (
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 space-y-5">
            <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Upload audio file</div>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-[#262626] rounded-lg py-8 cursor-pointer hover:border-[#6366f1]/40 transition bg-[#0a0a0a]">
              <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              <span className="material-symbols-outlined text-[24px] text-[#464554]">upload_file</span>
              <span className="text-[14px] text-[#c7c4d7]">{file ? file.name : "Click to select an audio file"}</span>
            </label>
            <button onClick={transcribe} disabled={!file || loading} className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[14px] font-medium px-4 py-2.5 rounded flex items-center gap-2 transition-colors disabled:opacity-40 w-full justify-center">
              {loading && <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              {loading ? "Transcribing..." : "Transcribe"}
            </button>
          </div>
        )}

        {/* Transcript + Translation (record/upload) */}
        {transcript && mode !== "live" && (
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 animate-fade-in space-y-4">
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase mb-2">Transcript</div>
              <div className="bg-[#050505] border border-[#262626] rounded p-4 text-[13px] leading-[20px] text-[#e5e2e1] whitespace-pre-wrap font-[family-name:var(--font-mono)]">{transcript}</div>
            </div>
            {translated && (
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#6366f1] uppercase mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  Translation ({targetLang.toUpperCase()})
                </div>
                <div className="bg-[#050505] border border-[#6366f1]/20 rounded p-4 text-[13px] leading-[20px] text-[#c0c1ff] whitespace-pre-wrap font-[family-name:var(--font-mono)]">{translated}</div>
              </div>
            )}
            {translating && (
              <div className="flex items-center gap-2 text-[12px] text-[#908fa0]">
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
