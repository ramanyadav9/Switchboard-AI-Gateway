import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  { icon: "chat", title: "AI Chat", desc: "Full conversation interface with streaming, thinking mode, and server-side history. Like ChatGPT, on your hardware." },
  { icon: "graphic_eq", title: "Real-time STT", desc: "Dual engine: SenseVoice for live streaming at ~70ms, Whisper for batch accuracy across 99 languages." },
  { icon: "code", title: "OpenAI-compatible API", desc: "Drop-in replacement. Change base_url and api_key — existing OpenAI SDK code works instantly." },
  { icon: "vpn_key", title: "API Key Management", desc: "Per-key model access, rate limits, and STT configuration. Full usage tracking and analytics." },
  { icon: "speed", title: "Built for Scale", desc: "300 concurrent users on a single GPU. Redis caching, connection pooling, prefix caching on vLLM." },
  { icon: "lock", title: "Complete Privacy", desc: "Zero data leaves your server. No telemetry, no cloud routing. Your models, your data, your control." },
];

const stats = [
  { value: "14B", label: "Parameter LLM" },
  { value: "<70ms", label: "STT latency" },
  { value: "300+", label: "Concurrent users" },
  { value: "0", label: "Cloud dependencies" },
];

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ────────────────────────────────────────── */}
      <header className="t-nav sticky top-0 z-50">
        <div className="flex justify-between items-center h-14 px-6 max-w-[1200px] mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs"
              style={{ background: "var(--accent)" }}
            >
              S
            </div>
            <span className="text-[15px] font-semibold">Switchboard</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-[13px]">
            <a href="#features" className="t-link">Features</a>
            <a href="#products" className="t-link">Products</a>
            <a href="#architecture" className="t-link">Architecture</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="t-link text-[13px] px-3 py-1.5 hidden sm:block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="t-btn text-[13px] px-4 py-1.5 rounded-md font-medium"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {/* ── Hero ──────────────────────────────────────── */}
        <section className="pt-24 lg:pt-32 pb-16 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] mb-8"
              style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
              Self-hosted AI Gateway
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-6">
              Your AI infrastructure,{" "}
              <span style={{ color: "var(--accent)" }}>under your control</span>
            </h1>
            <p
              className="text-lg leading-relaxed mb-10 max-w-2xl mx-auto"
              style={{ color: "var(--fg-secondary)" }}
            >
              Run AI chat, speech recognition, and a developer API on your own
              GPU. Full OpenAI compatibility. Zero data leaves your server.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/chat"
                className="t-btn px-6 py-2.5 rounded-md text-sm font-medium flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                Start chatting
              </Link>
              <Link
                href="/dashboard"
                className="t-btn-ghost px-6 py-2.5 rounded-md text-sm font-medium flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                API Dashboard
              </Link>
            </div>
          </div>

          {/* Chat preview */}
          <div className="mt-16 max-w-2xl mx-auto">
            <div className="t-card rounded-xl overflow-hidden">
              <div
                className="flex items-center px-4 py-2 border-b"
                style={{ borderColor: "var(--surface-border)", background: "var(--bg-muted)" }}
              >
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bg-emphasis)" }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bg-emphasis)" }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bg-emphasis)" }} />
                </div>
                <span
                  className="mx-auto font-[family-name:var(--font-mono)] text-[11px]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Switchboard Chat
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-end">
                  <div
                    className="px-4 py-2.5 rounded-2xl rounded-br-sm text-sm text-white max-w-[80%]"
                    style={{ background: "var(--accent)" }}
                  >
                    Explain how Kubernetes handles pod scheduling
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center"
                        style={{ background: "var(--accent-subtle)" }}
                      >
                        <span className="material-symbols-outlined text-[12px]" style={{ color: "var(--accent)" }}>
                          smart_toy
                        </span>
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Qwen3-14B</span>
                    </div>
                    <div
                      className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                      style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}
                    >
                      The Kubernetes scheduler assigns pods to nodes through a{" "}
                      <span style={{ color: "var(--accent)" }}>filtering</span> and{" "}
                      <span style={{ color: "var(--accent)" }}>scoring</span> process.
                      First, it filters nodes that don&apos;t meet requirements
                      (CPU, memory, taints). Then scores remaining nodes for
                      resource balance and affinity rules...
                      <span
                        className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm"
                        style={{ background: "var(--accent)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats ─────────────────────────────────────── */}
        <section className="py-10 border-y" style={{ borderColor: "var(--border)" }}>
          <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div
                  className="text-2xl font-bold font-[family-name:var(--font-mono)]"
                  style={{ color: "var(--accent)" }}
                >
                  {s.value}
                </div>
                <div className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ──────────────────────────────────── */}
        <section id="features" className="py-20 px-6">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                Built for production
              </h2>
              <p style={{ color: "var(--fg-secondary)" }} className="max-w-xl mx-auto">
                Everything to run AI inference at scale, without cloud lock-in.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f) => (
                <div key={f.title} className="t-card rounded-xl p-6">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: "var(--accent-subtle)" }}
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--accent)" }}>
                      {f.icon}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Products ──────────────────────────────────── */}
        <div id="products">
          {/* Chat */}
          <section className="py-20 px-6 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row items-center gap-16">
              <div className="flex-1">
                <div
                  className="font-[family-name:var(--font-mono)] text-[11px] font-semibold tracking-wider uppercase mb-3"
                  style={{ color: "var(--accent)" }}
                >
                  AI Chat
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                  Like ChatGPT, but yours
                </h2>
                <p className="mb-6 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  Full conversation interface with streaming responses, thinking
                  mode, and auto-generated titles. Server-side history with Redis
                  caching means instant context recall.
                </p>
                <ul className="space-y-2.5 text-sm">
                  {[
                    "SSE streaming with <think> tag support",
                    "Server-side conversation history",
                    "Redis session cache (30min TTL)",
                    "Stop generation mid-response",
                    "Code blocks with syntax highlighting",
                    "Auto-title from first message",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2" style={{ color: "var(--fg-secondary)" }}>
                      <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--success)" }}>
                        check
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/chat"
                  className="t-btn inline-flex items-center gap-2 mt-8 px-5 py-2 rounded-md text-sm font-medium"
                >
                  Try Chat
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
              <div className="flex-1 w-full max-w-md">
                <div className="t-card rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                    <span className="font-[family-name:var(--font-mono)]">Connected &middot; SSE</span>
                  </div>
                  <div className="t-code rounded-lg p-3 font-[family-name:var(--font-mono)] text-[12px] space-y-1">
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>data:</span>{" "}
                      <span style={{ color: "var(--accent)" }}>{`{"type":"token","content":"The"}`}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>data:</span>{" "}
                      <span style={{ color: "var(--accent)" }}>{`{"type":"token","content":" answer"}`}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>data:</span>{" "}
                      <span style={{ color: "var(--accent)" }}>{`{"type":"token","content":" is"}`}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>data:</span>{" "}
                      <span style={{ color: "var(--accent)" }}>{`{"type":"done","usage":{...}}`}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* API */}
          <section className="py-20 px-6 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row-reverse items-center gap-16">
              <div className="flex-1">
                <div
                  className="font-[family-name:var(--font-mono)] text-[11px] font-semibold tracking-wider uppercase mb-3"
                  style={{ color: "var(--syn-fn)" }}
                >
                  API Platform
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                  Drop-in OpenAI replacement
                </h2>
                <p className="mb-6 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  Change two lines in your code — base_url and api_key — and your
                  existing OpenAI SDK integration works instantly. Chat
                  completions, audio transcription, real-time WebSocket streaming.
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {["Python", "Node.js", "cURL", "Any OpenAI SDK"].map((sdk) => (
                    <span
                      key={sdk}
                      className="font-[family-name:var(--font-mono)] text-[11px] px-2.5 py-1 rounded"
                      style={{
                        background: "var(--bg-muted)",
                        border: "1px solid var(--border)",
                        color: "var(--fg-secondary)",
                      }}
                    >
                      {sdk}
                    </span>
                  ))}
                </div>
                <Link
                  href="/dashboard/docs"
                  className="t-btn-ghost inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium"
                >
                  View API Docs
                  <span className="material-symbols-outlined text-[16px]">description</span>
                </Link>
              </div>
              <div className="flex-1 w-full max-w-md">
                <div className="t-code rounded-xl overflow-hidden">
                  <div
                    className="flex items-center px-4 py-2 border-b"
                    style={{ borderColor: "var(--surface-border)" }}
                  >
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bg-emphasis)" }} />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bg-emphasis)" }} />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bg-emphasis)" }} />
                    </div>
                    <span
                      className="mx-auto font-[family-name:var(--font-mono)] text-[11px]"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      python
                    </span>
                  </div>
                  <pre className="p-5 font-[family-name:var(--font-mono)] text-[13px] leading-relaxed overflow-x-auto">
<span style={{ color: "var(--syn-keyword)" }}>from</span>{" "}
<span style={{ color: "var(--syn-string)" }}>openai</span>{" "}
<span style={{ color: "var(--syn-keyword)" }}>import</span> OpenAI{"\n\n"}
client = OpenAI({"\n"}
{"  "}base_url=<span style={{ color: "var(--syn-string)" }}>&quot;https://your-server/v1&quot;</span>,{"\n"}
{"  "}api_key=<span style={{ color: "var(--syn-string)" }}>&quot;sk-...&quot;</span>{"\n"}
){"\n\n"}
r = client.chat.completions.create({"\n"}
{"  "}model=<span style={{ color: "var(--syn-string)" }}>&quot;Qwen3-14B&quot;</span>,{"\n"}
{"  "}messages=[&#123;<span style={{ color: "var(--syn-string)" }}>&quot;role&quot;</span>:{" "}
<span style={{ color: "var(--syn-string)" }}>&quot;user&quot;</span>,{"\n"}
{"               "}<span style={{ color: "var(--syn-string)" }}>&quot;content&quot;</span>:{" "}
<span style={{ color: "var(--syn-string)" }}>&quot;Hello!&quot;</span>&#125;]{"\n"}
)
                  </pre>
                </div>
              </div>
            </div>
          </section>

          {/* STT */}
          <section className="py-20 px-6 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row items-center gap-16">
              <div className="flex-1">
                <div
                  className="font-[family-name:var(--font-mono)] text-[11px] font-semibold tracking-wider uppercase mb-3"
                  style={{ color: "var(--success)" }}
                >
                  Speech-to-Text
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                  Real-time transcription
                </h2>
                <p className="mb-6 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  Dual engine architecture: SenseVoice (~70ms latency) for live
                  streaming, Whisper for accurate batch transcription. Auto
                  language detection, multilingual support, emotion detection.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="t-card rounded-lg p-3">
                    <div
                      className="text-[11px] font-[family-name:var(--font-mono)] uppercase tracking-wider mb-1"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      SenseVoice
                    </div>
                    <div
                      className="text-xl font-bold font-[family-name:var(--font-mono)]"
                      style={{ color: "var(--success)" }}
                    >
                      ~70ms
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      Live streaming
                    </div>
                  </div>
                  <div className="t-card rounded-lg p-3">
                    <div
                      className="text-[11px] font-[family-name:var(--font-mono)] uppercase tracking-wider mb-1"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      Whisper
                    </div>
                    <div
                      className="text-xl font-bold font-[family-name:var(--font-mono)]"
                      style={{ color: "var(--accent)" }}
                    >
                      99 langs
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      Batch accuracy
                    </div>
                  </div>
                </div>
                <Link
                  href="/dashboard/playground"
                  className="t-btn-ghost inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium"
                >
                  Try in Playground
                  <span className="material-symbols-outlined text-[16px]">mic</span>
                </Link>
              </div>
              <div className="flex-1 w-full max-w-md">
                <div className="t-card rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="font-[family-name:var(--font-mono)] text-[10px] font-semibold tracking-wider uppercase"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      Live Transcription
                    </span>
                    <span
                      className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px]"
                      style={{ color: "var(--error)" }}
                    >
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--error)" }} />
                      LIVE 0:12
                    </span>
                  </div>
                  <div className="t-code rounded-lg p-4 font-[family-name:var(--font-mono)] text-[13px] leading-relaxed min-h-[80px]">
                    The Kubernetes scheduler assigns pods to nodes through a
                    filtering and scoring process
                    <span
                      className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm"
                      style={{ background: "var(--accent)" }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      Lang
                    </span>
                    <span
                      className="font-[family-name:var(--font-mono)] text-[10px] px-2 py-0.5 rounded"
                      style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                    >
                      en
                    </span>
                    <span
                      className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider ml-2"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      Emotion
                    </span>
                    <span
                      className="font-[family-name:var(--font-mono)] text-[10px] px-2 py-0.5 rounded"
                      style={{ background: "rgba(251, 191, 36, 0.1)", color: "var(--syn-fn)" }}
                    >
                      neutral
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Architecture ──────────────────────────────── */}
        <section id="architecture" className="py-20 px-6 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="max-w-[800px] mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Self-hosted. Single server.
            </h2>
            <p className="mb-12" style={{ color: "var(--fg-secondary)" }}>
              Everything runs on your GPU server behind one port. No cloud
              dependencies.
            </p>
            <div className="t-code rounded-xl p-6 font-[family-name:var(--font-mono)] text-[12px] text-left overflow-x-auto">
              <pre>
{`Your Server
  │
  :41237  Caddy ──┬── /chat/*     → Chat App
  (only public    ├── /dashboard/* → API Platform
   port)          ├── /v1/*       → LLM API
                  └── /ws/*       → WebSocket STT

  Internal (Docker bridge network):
    Backend ─┬── vLLM        :8000  (Qwen3-14B)
             ├── Whisper      :8004  (batch STT)
             ├── SenseVoice   :8006  (live STT)
             ├── PostgreSQL   (data)
             └── Redis        (cache)`}
              </pre>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────── */}
        <section className="py-20 px-6 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="max-w-[600px] mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              Ready to own your AI?
            </h2>
            <p className="mb-8" style={{ color: "var(--fg-secondary)" }}>
              Create an account and start chatting in seconds. Or grab an API key
              and integrate into your code.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup" className="t-btn px-8 py-3 rounded-md text-sm font-medium">
                Create free account
              </Link>
              <Link href="/dashboard/docs" className="t-btn-ghost px-8 py-3 rounded-md text-sm font-medium">
                Read the docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t py-8 px-6" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[9px]"
              style={{ background: "var(--accent)" }}
            >
              S
            </div>
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Switchboard AI Gateway
            </span>
          </div>
          <div className="flex items-center gap-6 text-[12px] font-[family-name:var(--font-mono)]">
            <Link href="/chat" className="t-link">Chat</Link>
            <Link href="/dashboard" className="t-link">Dashboard</Link>
            <Link href="/dashboard/docs" className="t-link">API Docs</Link>
            <a href="https://github.com" className="t-link">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
