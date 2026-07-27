"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { conversations, models as modelsApi } from "@/lib/api";
import { useToast } from "@/components/toast";

const PRESETS = [
  { icon: "code", label: "Write code", jack: "DEV", prompt: "Help me write a Python script that " },
  { icon: "school", label: "Explain a concept", jack: "EDU", prompt: "Explain how " },
  { icon: "translate", label: "Translate text", jack: "LNG", prompt: "Translate the following to English:\n\n" },
  { icon: "edit_note", label: "Summarize text", jack: "SUM", prompt: "Summarize this:\n\n" },
];

export default function ChatPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [hot, setHot] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    modelsApi.list()
      .then((res: { data?: { id: string }[] }) => setModels((res.data || []).map((m) => m.id)))
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);

  const modelCount = models.length;
  const modelLabel = modelCount === 1 ? models[0] : "Local models";
  const modelTag = modelCount > 0 ? `${modelCount} LIVE` : "LIVE";

  async function openLine(prompt?: string) {
    if (creating) return;
    setCreating(true);
    try {
      const conv = await conversations.create();
      router.push(prompt ? `/chat/${conv.id}?prompt=${encodeURIComponent(prompt)}` : `/chat/${conv.id}`);
    } catch {
      toast("Couldn't open a line. Try again.", "error");
      setCreating(false);
    }
  }

  return (
    <div className="sb-root flex-1 flex items-center justify-center p-4 sm:p-6">
      <style>{sbStyles}</style>

      <div className={`sb-console w-full max-w-[760px] ${mounted ? "sb-in" : ""}`}>
        {/* ── Faceplate ── */}
        <div className="sb-faceplate">
          <div className="flex items-center gap-2.5">
            <span className="sb-plate">SWITCHBOARD</span>
            <span className="sb-screw" /><span className="sb-screw" />
          </div>
          <div className="flex items-center gap-2">
            <span className="sb-tag">LOCAL</span>
            <span className="sb-tag">GPU</span>
            <span className="sb-tag sb-tag-live"><span className="sb-lamp sb-lamp-green" />ONLINE</span>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-6 sm:p-10">
          <div className="sb-eyebrow">OPERATOR CONSOLE · POSITION 01</div>
          <h1 className="sb-title">Open a line.</h1>
          <p className="sb-sub">
            Patch yourself through to <b>your own models</b> running on your hardware.
            Every message stays on your wires — nothing leaves the box.
          </p>

          {/* ── Patch bay (the signature) ── */}
          <div className={`sb-bay ${hot ? "sb-bay-hot" : ""}`}>
            <div className="sb-jack">
              <span className="sb-jack-icon"><span className="material-symbols-outlined">support_agent</span></span>
              <div className="sb-jack-meta">
                <span className="sb-jack-name">YOU</span>
                <span className="sb-jack-tag">OPERATOR</span>
              </div>
              <span className="sb-port" />
            </div>

            {/* cable — horizontal on desktop, vertical on mobile */}
            <div className="sb-cable">
              <svg className="sb-cable-svg" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
                <path className="sb-cable-path" d="M4 30 C 90 58, 210 58, 296 30" fill="none" />
              </svg>
              <span className="sb-cable-vert" aria-hidden="true" />
            </div>

            <div className="sb-jack sb-jack-model">
              <span className="sb-port" />
              <div className="sb-jack-meta sb-jack-meta-r">
                <span className="sb-jack-name">{modelLabel}</span>
                <span className="sb-jack-tag"><span className="sb-lamp sb-lamp-amber" />{modelTag}</span>
              </div>
              <span className="sb-jack-icon"><span className="material-symbols-outlined">memory</span></span>
            </div>
          </div>

          {/* ── Available lines (models) ── */}
          {modelCount > 0 && (
            <div className="sb-models" title={`${modelCount} model${modelCount > 1 ? "s" : ""} available`}>
              <span className="sb-models-label">LINES</span>
              {models.slice(0, 6).map((m) => (
                <span key={m} className="sb-model-chip">{m}</span>
              ))}
              {modelCount > 6 && <span className="sb-model-chip sb-model-more">+{modelCount - 6}</span>}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="sb-actions">
            <button
              onClick={() => openLine()}
              onMouseEnter={() => setHot(true)}
              onMouseLeave={() => setHot(false)}
              onFocus={() => setHot(true)}
              onBlur={() => setHot(false)}
              disabled={creating}
              className="sb-connect"
            >
              {creating ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <span className="material-symbols-outlined text-[19px]">electrical_services</span>
              )}
              {creating ? "Connecting…" : "Open a line"}
            </button>

            <button onClick={() => router.push("/dashboard/playground")} className="sb-ghost">
              <span className="material-symbols-outlined text-[16px]">science</span>Playground
            </button>
            <button onClick={() => router.push("/chat/agents")} className="sb-ghost">
              <span className="material-symbols-outlined text-[16px]">terminal</span>Agent console
            </button>
          </div>

          {/* ── Preset patch panel ── */}
          <div className="sb-presets-label">PATCH PRESETS</div>
          <div className="sb-presets">
            {PRESETS.map((p) => (
              <button key={p.jack} onClick={() => openLine(p.prompt)} disabled={creating} className="sb-preset">
                <span className="sb-preset-jack">{p.jack}</span>
                <span className="material-symbols-outlined text-[17px] sb-preset-icon">{p.icon}</span>
                <span className="sb-preset-label">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Status rail ── */}
        <div className="sb-rail">
          <span className="sb-rail-item"><span className="sb-lamp sb-lamp-amber" />LINE 01 · READY</span>
          <span className="sb-rail-item sb-rail-muted">Self-hosted · press Enter to connect</span>
        </div>
      </div>
    </div>
  );
}

const sbStyles = `
.sb-root { --signal: #f59e0b; --signal-soft: rgba(245,158,11,0.14); }

.sb-console {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 60px -30px rgba(0,0,0,0.7);
  opacity: 0;
  transform: translateY(10px);
}
.sb-console.sb-in { opacity: 1; transform: none; transition: opacity .5s ease, transform .5s ease; }

/* faceplate */
.sb-faceplate {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(var(--bg-muted), var(--surface));
}
.sb-plate {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .28em; font-weight: 600;
  color: var(--fg-secondary);
}
.sb-screw { width: 5px; height: 5px; border-radius: 50%; background: var(--border-hover); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25); }
.sb-tag {
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .14em; font-weight: 600;
  color: var(--fg-muted); padding: 3px 7px; border: 1px solid var(--border); border-radius: 5px;
}
.sb-tag-live { display: inline-flex; align-items: center; gap: 5px; color: var(--fg-secondary); }

.sb-lamp { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sb-lamp-green { background: var(--success); box-shadow: 0 0 6px var(--success); animation: sb-blink 2.4s ease-in-out infinite; }
.sb-lamp-amber { background: var(--signal); box-shadow: 0 0 6px var(--signal); animation: sb-blink 2.4s ease-in-out infinite .6s; }
@keyframes sb-blink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

/* headline */
.sb-eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: .2em; color: var(--signal); margin-bottom: 14px; }
.sb-title { font-size: 40px; line-height: 1.02; font-weight: 700; letter-spacing: -0.03em; color: var(--fg); }
.sb-sub { margin-top: 12px; max-width: 46ch; font-size: 14px; line-height: 1.6; color: var(--fg-secondary); }
.sb-sub b { color: var(--fg); font-weight: 600; }

/* patch bay */
.sb-bay {
  margin-top: 28px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: stretch; gap: 0;
  border: 1px solid var(--border); border-radius: 12px; padding: 14px; background: var(--bg);
}
.sb-jack { display: flex; align-items: center; gap: 12px; min-width: 0; }
.sb-jack-model { justify-content: flex-end; }
.sb-jack-icon {
  width: 40px; height: 40px; flex: none; border-radius: 9px; display: grid; place-items: center;
  background: var(--bg-muted); border: 1px solid var(--border); color: var(--fg-secondary);
}
.sb-jack-icon .material-symbols-outlined { font-size: 21px; }
.sb-jack-meta { display: flex; flex-direction: column; min-width: 0; }
.sb-jack-meta-r { align-items: flex-end; text-align: right; }
.sb-jack-name { font-size: 13px; font-weight: 600; color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-jack-tag { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .12em; color: var(--fg-muted); display: inline-flex; align-items: center; gap: 5px; }
.sb-port {
  width: 13px; height: 13px; flex: none; border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, var(--bg-emphasis), var(--bg));
  border: 1px solid var(--border-hover); box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
}

/* cable */
.sb-cable { position: relative; width: 96px; display: flex; align-items: center; justify-content: center; }
.sb-cable-svg { width: 100%; height: 100%; overflow: visible; }
.sb-cable-path {
  stroke: var(--border-hover); stroke-width: 3; stroke-linecap: round;
  stroke-dasharray: 320; stroke-dashoffset: 320; transition: stroke .3s ease, filter .3s ease;
}
.sb-console.sb-in .sb-cable-path { animation: sb-draw .9s ease-out .3s forwards; }
@keyframes sb-draw { to { stroke-dashoffset: 0; } }
.sb-bay-hot .sb-cable-path { stroke: var(--signal); filter: drop-shadow(0 0 5px var(--signal-soft)); }
.sb-bay-hot .sb-port { border-color: var(--signal); box-shadow: inset 0 1px 2px rgba(0,0,0,0.5), 0 0 8px var(--signal-soft); }
.sb-cable-vert { display: none; }

/* available lines (models) */
.sb-models { margin-top: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.sb-models-label { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .18em; color: var(--fg-muted); margin-right: 2px; }
.sb-model-chip {
  font-family: var(--font-mono); font-size: 11px; color: var(--fg-secondary);
  padding: 3px 9px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg);
}
.sb-model-more { color: var(--fg-muted); }

/* actions */
.sb-actions { margin-top: 22px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sb-connect {
  display: inline-flex; align-items: center; gap: 9px; padding: 0 20px; height: 46px;
  border-radius: 11px; font-size: 14px; font-weight: 600; color: #fff;
  background: var(--accent); border: 1px solid transparent;
  box-shadow: 0 8px 22px -12px var(--accent);
  transition: background .15s ease, transform .1s ease, box-shadow .2s ease;
}
.sb-connect:hover:not(:disabled) { background: var(--accent-hover); box-shadow: 0 10px 26px -10px var(--accent); }
.sb-connect:active:not(:disabled) { transform: translateY(1px); }
.sb-connect:disabled { opacity: .6; cursor: not-allowed; }
.sb-ghost {
  display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; height: 46px;
  border-radius: 11px; font-size: 13px; color: var(--fg-secondary);
  background: transparent; border: 1px solid var(--border); transition: all .15s ease;
}
.sb-ghost:hover { color: var(--fg); border-color: var(--border-hover); background: var(--bg-muted); }

/* presets */
.sb-presets-label { margin-top: 30px; margin-bottom: 12px; font-family: var(--font-mono); font-size: 10px; letter-spacing: .2em; color: var(--fg-muted); }
.sb-presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.sb-preset {
  display: flex; align-items: center; gap: 11px; padding: 12px 13px; text-align: left;
  border: 1px solid var(--border); border-radius: 11px; background: var(--bg);
  transition: border-color .15s ease, background .15s ease, transform .1s ease;
}
.sb-preset:hover:not(:disabled) { border-color: var(--signal); background: var(--signal-soft); }
.sb-preset:active:not(:disabled) { transform: translateY(1px); }
.sb-preset:disabled { opacity: .6; cursor: not-allowed; }
.sb-preset-jack {
  font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .06em;
  color: var(--fg-muted); width: 30px; height: 24px; flex: none; display: grid; place-items: center;
  border: 1px dashed var(--border-hover); border-radius: 6px;
}
.sb-preset:hover:not(:disabled) .sb-preset-jack { color: var(--signal); border-color: var(--signal); border-style: solid; }
.sb-preset-icon { color: var(--fg-secondary); }
.sb-preset-label { font-size: 13px; color: var(--fg); font-weight: 500; }

/* status rail */
.sb-rail {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 16px; border-top: 1px solid var(--border); background: var(--bg-muted);
}
.sb-rail-item { font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; color: var(--fg-secondary); display: inline-flex; align-items: center; gap: 7px; }
.sb-rail-muted { color: var(--fg-muted); }

/* focus */
.sb-connect:focus-visible, .sb-ghost:focus-visible, .sb-preset:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* responsive */
@media (max-width: 560px) {
  .sb-title { font-size: 32px; }
  .sb-bay { grid-template-columns: 1fr; gap: 14px; }
  .sb-jack-model { justify-content: flex-start; flex-direction: row-reverse; }
  .sb-jack-meta-r { align-items: flex-start; text-align: left; }
  .sb-cable { width: 100%; height: 22px; }
  .sb-cable-svg { display: none; }
  .sb-cable-vert {
    display: block; width: 2px; height: 22px; margin-left: 19px;
    background: repeating-linear-gradient(var(--border-hover) 0 3px, transparent 3px 7px);
  }
  .sb-bay-hot .sb-cable-vert { background: repeating-linear-gradient(var(--signal) 0 3px, transparent 3px 7px); }
  .sb-presets { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .sb-console, .sb-console.sb-in { transition: none; }
  .sb-console.sb-in .sb-cable-path { animation: none; stroke-dashoffset: 0; }
  .sb-lamp-green, .sb-lamp-amber { animation: none; }
}
`;
