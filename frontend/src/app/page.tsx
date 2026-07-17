import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-[#131313] text-[#e5e2e1] antialiased">
      {/* Nav */}
      <header className="bg-[#131313]/80 backdrop-blur-sm border-b border-[#262626] sticky top-0 z-50">
        <div className="flex justify-between items-center h-16 px-6 max-w-[1280px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-bold text-sm">S</div>
            <span className="text-lg font-bold tracking-tight">Switchboard</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors">Features</a>
            <a href="#chat" className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors">Chat</a>
            <a href="#api" className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors">API</a>
            <a href="#stt" className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors">Speech</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-[#e5e2e1] hover:text-[#c0c1ff] transition-colors text-sm hidden sm:block">Log In</Link>
            <Link href="/signup" className="bg-[#6366f1] text-white px-4 py-2 rounded text-sm hover:bg-[#4f46e5] transition-colors">Get Started</Link>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {/* Hero */}
        <section className="py-28 px-6 max-w-[1280px] mx-auto relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,0.08), transparent)"}}>
          </div>
          <div className="text-center relative z-10 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#464554] bg-[#1c1c22] mb-8">
              <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.05em] text-[#c7c4d7] uppercase">Live &middot; Self-hosted &middot; Open Source</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              Your AI.{" "}
              <span className="bg-gradient-to-r from-[#6366f1] via-[#a855f7] to-[#6366f1] bg-clip-text text-transparent">Your rules.</span>
            </h1>
            <p className="text-lg text-[#908fa0] mb-10 max-w-2xl mx-auto leading-relaxed">
              Chat with AI, transcribe speech in real-time, and build with a production API — all self-hosted on your own GPU. No data leaves your infrastructure.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/chat" className="bg-[#6366f1] text-white px-8 py-3.5 rounded text-sm font-medium hover:bg-[#4f46e5] transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">chat</span>
                Start chatting
              </Link>
              <Link href="/dashboard" className="bg-transparent border border-[#464554] text-[#e5e2e1] px-8 py-3.5 rounded text-sm font-medium hover:bg-[#1c1c22] transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                API Dashboard
              </Link>
            </div>
          </div>

          {/* Chat preview */}
          <div className="mt-16 max-w-2xl mx-auto relative z-10">
            <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-2xl shadow-[#6366f1]/5">
              <div className="flex items-center px-4 py-2.5 border-b border-[#262626] bg-[#1c1c22]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#353534]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#353534]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#353534]" />
                </div>
                <span className="mx-auto font-[family-name:var(--font-mono)] text-[11px] text-[#908fa0]">Switchboard Chat</span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-end">
                  <div className="bg-[#6366f1] text-white px-4 py-2.5 rounded-xl rounded-br-sm text-[14px] max-w-[80%]">
                    Explain how Kubernetes handles pod scheduling
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded bg-[#c0c1ff] flex items-center justify-center"><span className="material-symbols-outlined text-[12px] text-[#1000a9]">smart_toy</span></div>
                      <span className="text-[11px] text-[#908fa0]">Qwen3-14B</span>
                    </div>
                    <div className="bg-[#1c1c22] border border-[#262626] px-4 py-3 rounded-xl text-[14px] text-[#c7c4d7] leading-relaxed">
                      The Kubernetes scheduler assigns pods to nodes through a <span className="text-[#c0c1ff]">filtering</span> and <span className="text-[#c0c1ff]">scoring</span> process. First, it filters out nodes that don&apos;t meet requirements (CPU, memory, taints). Then it scores remaining nodes based on resource balance, affinity rules, and spreading constraints...
                      <span className="inline-block w-1.5 h-4 bg-[#6366f1] ml-0.5 animate-pulse rounded-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-12 border-y border-[#262626]">
          <div className="max-w-[1280px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { val: "14B", label: "Parameter LLM" },
              { val: "<70ms", label: "STT Latency" },
              { val: "300+", label: "Concurrent Users" },
              { val: "0", label: "Data Sent to Cloud" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-[#c0c1ff] font-[family-name:var(--font-mono)]">{s.val}</div>
                <div className="text-[12px] text-[#908fa0] mt-1 font-[family-name:var(--font-mono)] uppercase tracking-[0.05em]">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features grid */}
        <section id="features" className="py-24 px-6 max-w-[1280px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need</h2>
            <p className="text-[#908fa0] max-w-xl mx-auto">Chat, transcribe, and build — all from one self-hosted platform.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: "chat", title: "AI Chat", desc: "ChatGPT-like conversations with your own LLM. Streaming, thinking mode, conversation history. All data stays on your server.", tag: "chat" },
              { icon: "graphic_eq", title: "Real-time STT", desc: "Live speech-to-text with auto language detection. Dual engine: SenseVoice for speed, Whisper for accuracy.", tag: "stt" },
              { icon: "code", title: "OpenAI-compatible API", desc: "Drop-in replacement. Change base_url and api_key — your existing code just works. SSE streaming included.", tag: "api" },
              { icon: "vpn_key", title: "API Key Management", desc: "Create keys with per-key model access, rate limits, and STT configuration. Usage tracking built in.", tag: null },
              { icon: "speed", title: "Built for Scale", desc: "300 concurrent users on a single GPU. Redis caching, connection pooling, 4-worker backend, prefix caching on vLLM.", tag: null },
              { icon: "lock", title: "Privacy First", desc: "Zero data leaves your infrastructure. No telemetry, no cloud routing. Your models, your data, your control.", tag: null },
            ].map((f) => (
              <div key={f.title} className="bg-[#171717] border border-[#262626] rounded-xl p-6 hover:border-[#464554] transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-[#6366f1]/10 flex items-center justify-center mb-4 group-hover:bg-[#6366f1]/20 transition-colors">
                  <span className="material-symbols-outlined text-[20px] text-[#c0c1ff]">{f.icon}</span>
                </div>
                <h3 className="font-semibold text-[#e5e2e1] mb-2">{f.title}</h3>
                <p className="text-[13px] text-[#908fa0] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Chat section */}
        <section id="chat" className="py-24 px-6 border-t border-[#262626]">
          <div className="max-w-[1280px] mx-auto flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <div className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.05em] text-[#6366f1] uppercase mb-3">AI Chat</div>
              <h2 className="text-3xl font-bold tracking-tight mb-4">Like ChatGPT, but yours</h2>
              <p className="text-[#908fa0] mb-6 leading-relaxed">Full conversation interface with streaming responses, thinking mode, and auto-generated titles. Server-side history with Redis caching means instant context recall.</p>
              <ul className="space-y-3 text-[14px]">
                {["SSE streaming with <think> tag support", "Server-side conversation history", "Redis session cache (30min TTL)", "Stop generation mid-response", "Code blocks with syntax copy", "Auto-title from first message"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[#c7c4d7]">
                    <span className="material-symbols-outlined text-[16px] text-[#22c55e]">check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/chat" className="inline-flex items-center gap-2 mt-8 bg-[#6366f1] text-white px-6 py-2.5 rounded text-sm hover:bg-[#4f46e5] transition-colors">
                Try Chat
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
            <div className="flex-1 w-full max-w-md">
              <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-[#908fa0]">
                  <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                  <span className="font-[family-name:var(--font-mono)]">Connected &middot; SSE</span>
                </div>
                <div className="bg-[#050505] border border-[#262626] rounded-lg p-3 font-[family-name:var(--font-mono)] text-[12px] text-[#c7c4d7] space-y-1">
                  <div><span className="text-[#908fa0]">data:</span> <span className="text-[#c0c1ff]">{`{"type":"token","content":"The"}`}</span></div>
                  <div><span className="text-[#908fa0]">data:</span> <span className="text-[#c0c1ff]">{`{"type":"token","content":" answer"}`}</span></div>
                  <div><span className="text-[#908fa0]">data:</span> <span className="text-[#c0c1ff]">{`{"type":"token","content":" is"}`}</span></div>
                  <div><span className="text-[#908fa0]">data:</span> <span className="text-[#c0c1ff]">{`{"type":"done","usage":{...}}`}</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* API section */}
        <section id="api" className="py-24 px-6 border-t border-[#262626]">
          <div className="max-w-[1280px] mx-auto flex flex-col lg:flex-row-reverse items-center gap-16">
            <div className="flex-1">
              <div className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.05em] text-[#a855f7] uppercase mb-3">API Platform</div>
              <h2 className="text-3xl font-bold tracking-tight mb-4">Drop-in OpenAI replacement</h2>
              <p className="text-[#908fa0] mb-6 leading-relaxed">Change two lines in your code — base_url and api_key — and your existing OpenAI SDK integration works instantly. Chat completions, audio transcription, real-time WebSocket streaming.</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {["Python", "Node.js", "cURL", "Any OpenAI SDK"].map((sdk) => (
                  <span key={sdk} className="font-[family-name:var(--font-mono)] text-[11px] bg-[#1c1c22] border border-[#262626] text-[#c7c4d7] px-2.5 py-1 rounded">{sdk}</span>
                ))}
              </div>
              <Link href="/dashboard/docs" className="inline-flex items-center gap-2 bg-transparent border border-[#464554] text-[#e5e2e1] px-6 py-2.5 rounded text-sm hover:bg-[#1c1c22] transition-colors">
                View API Docs
                <span className="material-symbols-outlined text-[16px]">description</span>
              </Link>
            </div>
            <div className="flex-1 w-full max-w-md">
              <div className="bg-[#050505] border border-[#262626] rounded-xl overflow-hidden">
                <div className="flex items-center px-4 py-2.5 border-b border-[#262626] bg-[#171717]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#353534]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#353534]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#353534]" />
                  </div>
                  <span className="mx-auto font-[family-name:var(--font-mono)] text-[11px] text-[#908fa0]">python</span>
                </div>
                <pre className="p-5 font-[family-name:var(--font-mono)] text-[13px] leading-relaxed overflow-x-auto">
<span className="text-[#6366f1]">from</span> <span className="text-[#22c55e]">openai</span> <span className="text-[#6366f1]">import</span> <span className="text-[#e5e2e1]">OpenAI</span>{"\n\n"}
<span className="text-[#e5e2e1]">client</span> = <span className="text-[#e5e2e1]">OpenAI</span>({"\n"}
{"  "}<span className="text-[#e5e2e1]">base_url</span>=<span className="text-[#ffb783]">&quot;https://your-server/v1&quot;</span>,{"\n"}
{"  "}<span className="text-[#e5e2e1]">api_key</span>=<span className="text-[#ffb783]">&quot;sk-...&quot;</span>{"\n"}
){"\n\n"}
<span className="text-[#e5e2e1]">r</span> = <span className="text-[#e5e2e1]">client.chat.completions.create</span>({"\n"}
{"  "}<span className="text-[#e5e2e1]">model</span>=<span className="text-[#ffb783]">&quot;Qwen3-14B&quot;</span>,{"\n"}
{"  "}<span className="text-[#e5e2e1]">messages</span>=[&#123;<span className="text-[#ffb783]">&quot;role&quot;</span>: <span className="text-[#ffb783]">&quot;user&quot;</span>,{"\n"}
{"               "}<span className="text-[#ffb783]">&quot;content&quot;</span>: <span className="text-[#ffb783]">&quot;Hello!&quot;</span>&#125;]{"\n"}
)
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* STT section */}
        <section id="stt" className="py-24 px-6 border-t border-[#262626]">
          <div className="max-w-[1280px] mx-auto flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <div className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.05em] text-[#22c55e] uppercase mb-3">Speech-to-Text</div>
              <h2 className="text-3xl font-bold tracking-tight mb-4">Real-time transcription</h2>
              <p className="text-[#908fa0] mb-6 leading-relaxed">Dual engine architecture: SenseVoice (~70ms latency) for live streaming, Whisper for accurate batch transcription. Auto language detection, multilingual support, emotion detection.</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-[#171717] border border-[#262626] rounded-lg p-3">
                  <div className="text-[11px] text-[#908fa0] font-[family-name:var(--font-mono)] uppercase tracking-[0.05em] mb-1">SenseVoice</div>
                  <div className="text-[20px] font-bold text-[#22c55e] font-[family-name:var(--font-mono)]">~70ms</div>
                  <div className="text-[11px] text-[#908fa0]">Live streaming</div>
                </div>
                <div className="bg-[#171717] border border-[#262626] rounded-lg p-3">
                  <div className="text-[11px] text-[#908fa0] font-[family-name:var(--font-mono)] uppercase tracking-[0.05em] mb-1">Whisper</div>
                  <div className="text-[20px] font-bold text-[#c0c1ff] font-[family-name:var(--font-mono)]">99 langs</div>
                  <div className="text-[11px] text-[#908fa0]">Batch accuracy</div>
                </div>
              </div>
              <Link href="/dashboard/playground" className="inline-flex items-center gap-2 bg-transparent border border-[#464554] text-[#e5e2e1] px-6 py-2.5 rounded text-sm hover:bg-[#1c1c22] transition-colors">
                Try in Playground
                <span className="material-symbols-outlined text-[16px]">mic</span>
              </Link>
            </div>
            <div className="flex-1 w-full max-w-md">
              <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.05em] text-[#908fa0] uppercase">Live Transcription</span>
                  <span className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px] text-[#ff4444]">
                    <span className="w-2 h-2 rounded-full bg-[#ff4444] animate-pulse" />
                    LIVE 0:12
                  </span>
                </div>
                <div className="bg-[#050505] border border-[#262626] rounded-lg p-4 font-[family-name:var(--font-mono)] text-[13px] text-[#e5e2e1] leading-relaxed min-h-[80px]">
                  The Kubernetes scheduler assigns pods to nodes through a filtering and scoring process
                  <span className="inline-block w-1.5 h-4 bg-[#6366f1] ml-0.5 animate-pulse rounded-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#908fa0] uppercase tracking-[0.05em]">Lang</span>
                  <span className="font-[family-name:var(--font-mono)] text-[10px] bg-[#6366f1]/15 text-[#c0c1ff] px-2 py-0.5 rounded border border-[#6366f1]/20">en</span>
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#908fa0] uppercase tracking-[0.05em] ml-2">Emotion</span>
                  <span className="font-[family-name:var(--font-mono)] text-[10px] bg-[#ffb783]/15 text-[#ffb783] px-2 py-0.5 rounded border border-[#ffb783]/20">neutral</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section className="py-24 px-6 border-t border-[#262626]">
          <div className="max-w-[800px] mx-auto text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Self-hosted. Single server.</h2>
            <p className="text-[#908fa0] mb-12">Everything runs on your GPU server behind one port. No cloud dependencies.</p>
            <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 font-[family-name:var(--font-mono)] text-[12px] text-left overflow-x-auto">
              <pre className="text-[#c7c4d7]">
{`Your Server
  │
  :2341  Caddy ──┬── /chat/*     → Chat App
  (public)       ├── /dashboard/* → API Platform
                 ├── /v1/*       → LLM API
                 └── /ws/*       → WebSocket STT

  Backend ─┬── vLLM        :8000  (Qwen3-14B)
           ├── Whisper      :8004  (batch STT)
           ├── SenseVoice   :8006  (live STT)
           ├── PostgreSQL   :5433  (data)
           └── Redis        :6380  (cache)`}
              </pre>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 border-t border-[#262626]">
          <div className="max-w-[600px] mx-auto text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Ready to own your AI?</h2>
            <p className="text-[#908fa0] mb-8">Create an account and start chatting in seconds. Or grab an API key and integrate into your code.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup" className="bg-[#6366f1] text-white px-8 py-3.5 rounded text-sm font-medium hover:bg-[#4f46e5] transition-colors">
                Create free account
              </Link>
              <Link href="/dashboard/docs" className="bg-transparent border border-[#464554] text-[#e5e2e1] px-8 py-3.5 rounded text-sm font-medium hover:bg-[#1c1c22] transition-colors">
                Read the docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#262626] py-8 px-6">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-bold text-[10px]">S</div>
            <span className="text-[13px] text-[#908fa0]">Switchboard AI Gateway</span>
          </div>
          <div className="flex items-center gap-6 text-[12px] text-[#908fa0] font-[family-name:var(--font-mono)]">
            <Link href="/chat" className="hover:text-[#c0c1ff] transition-colors">Chat</Link>
            <Link href="/dashboard" className="hover:text-[#c0c1ff] transition-colors">Dashboard</Link>
            <Link href="/dashboard/docs" className="hover:text-[#c0c1ff] transition-colors">API Docs</Link>
            <a href="https://github.com/ramanyadav9/Switchboard-AI-Gateway" className="hover:text-[#c0c1ff] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
