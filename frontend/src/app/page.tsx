import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-[#131313] text-[#e5e2e1] antialiased">
      {/* ── TopNavBar ── */}
      <header className="bg-[#131313] border-b border-[#464554] sticky top-0 z-50">
        <div className="flex justify-between items-center h-16 px-4 max-w-[1280px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-bold text-sm shrink-0">
              S
            </div>
            <span className="text-lg font-bold tracking-tight">Switchboard</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-[#c0c1ff] border-b-2 border-[#c0c1ff] pb-1 hover:text-[#c0c1ff] transition-colors">
              Features
            </a>
            <a href="#" className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors">
              Pricing
            </a>
            <a href="#" className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors">
              Docs
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-[#e5e2e1] hover:text-[#c0c1ff] transition-colors text-sm hidden sm:block"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="bg-[#6366f1] text-white px-4 py-2 rounded text-sm hover:bg-[#6366f1]/90 transition-opacity"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {/* ── Hero Section ── */}
        <section className="py-24 px-4 max-w-[1280px] mx-auto flex flex-col lg:flex-row items-center gap-16 relative overflow-hidden">
          {/* Subtle animated node background */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none w-[600px] h-[600px] -z-10">
            <svg className="w-full h-full text-[#6366f1]" viewBox="0 0 100 100">
              <circle cx="20" cy="50" r="2" fill="currentColor" />
              <circle cx="50" cy="20" r="2" fill="currentColor" />
              <circle cx="50" cy="80" r="2" fill="currentColor" />
              <circle cx="80" cy="50" r="2" fill="currentColor" />
              <path d="M 20 50 Q 35 20 50 20 T 80 50" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M 20 50 Q 35 80 50 80 T 80 50" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M 20 50 L 80 50" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" />
            </svg>
          </div>

          {/* Left: Copy */}
          <div className="max-w-2xl z-10 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#464554] bg-[#2a2a2a] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#6366f1] animate-pulse" />
              <span className="font-mono text-[10px] font-bold tracking-[0.05em] text-[#c7c4d7] uppercase">
                v1.2.0 Released
              </span>
            </div>

            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Route your AI,
              <br />
              <span className="text-[#6366f1]">your way.</span>
            </h1>

            <p className="text-base text-[#c7c4d7] mb-8 max-w-xl leading-relaxed">
              The one API for self-hosted LLM, Speech-to-Text, and Text-to-Speech
              models. OpenAI-compatible, private, and lightning fast.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/signup"
                className="bg-[#6366f1] text-white px-6 py-3 rounded text-sm hover:bg-[#6366f1]/90 transition-all flex items-center justify-center gap-2"
              >
                Get Started
                <span className="text-lg leading-none">→</span>
              </Link>
              <Link
                href="#"
                className="bg-transparent border border-[#464554] text-[#e5e2e1] px-6 py-3 rounded text-sm hover:bg-[#2a2a2a] transition-colors flex items-center justify-center"
              >
                View Documentation
              </Link>
            </div>
          </div>

          {/* Right: Terminal code block */}
          <div className="flex-1 w-full max-w-xl z-10">
            <div className="border border-[#262626] rounded-xl bg-[#050505] overflow-hidden shadow-2xl">
              {/* Terminal chrome */}
              <div className="flex items-center px-4 py-3 border-b border-[#262626] bg-[#171717]">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#464554]" />
                  <div className="w-3 h-3 rounded-full bg-[#464554]" />
                  <div className="w-3 h-3 rounded-full bg-[#464554]" />
                </div>
                <span className="mx-auto font-mono text-[11px] text-[#908fa0]">
                  index.js
                </span>
                <button className="text-[#908fa0] hover:text-[#e5e2e1] transition-colors text-xs">
                  &#x2398;
                </button>
              </div>
              {/* Code */}
              <div className="p-6 overflow-x-auto">
                <pre className="font-mono text-[13px] leading-relaxed">
                  <code>
{`​`}<span className="text-[#6366f1]">const</span>{" client = "}<span className="text-[#6366f1]">new</span>{" OpenAI({\n"}
{"  baseURL: "}<span className="text-[#ffb783]">{`"https://your-switchboard.local/v1"`}</span>{",\n"}
{"  apiKey: "}<span className="text-[#ffb783]">{`"sb_live_..."`}</span>{"\n"}
{"});\n\n"}
<span className="text-[#908fa0]">{"// Drop-in replacement for OpenAI SDK"}</span>{"\n"}
<span className="text-[#6366f1]">const</span>{" "}<span className="text-[#e5e2e1]">response</span>{" = "}<span className="text-[#6366f1]">await</span>{" client.chat.completions.create({\n"}
{"  model: "}<span className="text-[#ffb783]">{`"llama-3-70b-instruct"`}</span>{",\n"}
{"  messages: [{ role: "}<span className="text-[#ffb783]">{`"user"`}</span>{", content: "}<span className="text-[#ffb783]">{`"Hello!"`}</span>{" }],\n"}
{"});"}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features Section ── */}
        <section id="features" className="py-24 px-4 max-w-[1280px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl font-semibold tracking-tight mb-3">
              Unified AI Routing
            </h2>
            <p className="text-[#c7c4d7] text-base max-w-2xl mx-auto leading-relaxed">
              Deploy one container. Route requests to local models, managed
              services, or anywhere else with a single unified API.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: "💬",
                title: "LLM Chat",
                desc: "Route standard chat completion requests to local Llama, Mistral, or fallback to external providers automatically.",
              },
              {
                icon: "🎙️",
                title: "Speech-to-Text",
                desc: "Transcribe audio blazingly fast using local Whisper models. Drop-in compatible with standard audio transcription endpoints.",
              },
              {
                icon: "🔊",
                title: "Text-to-Speech",
                desc: "Generate high-quality speech from text locally. Unified API format means switching models requires zero code changes.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-[#171717] border border-[#262626] rounded-xl p-6 hover:border-[#464554] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[#201f1f] border border-[#262626] flex items-center justify-center mb-4 text-xl">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-[#e5e2e1] mb-2">{f.title}</h3>
                <p className="text-sm text-[#c7c4d7] leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#262626] py-8 px-4">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <span className="font-bold text-sm tracking-tight">
              Switchboard
              <br />
              <span className="font-normal text-xs text-[#908fa0]">Platform</span>
            </span>
            <span className="text-xs text-[#908fa0]">
              &copy; 2024 Switchboard AI. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-[#908fa0]">
            <a href="#" className="hover:text-[#e5e2e1] transition-colors">Status</a>
            <a href="#" className="hover:text-[#e5e2e1] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#e5e2e1] transition-colors">Terms</a>
            <a href="#" className="hover:text-[#e5e2e1] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
