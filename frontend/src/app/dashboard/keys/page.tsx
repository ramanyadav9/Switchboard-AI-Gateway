"use client";

import { useEffect, useState } from "react";
import { keys } from "@/lib/api";
import { useToast } from "@/components/toast";

type SnippetMode = "chat" | "stt" | "realtime";
type SnippetLang = "curl" | "python" | "node";

function CodeSnippets({ apiKey }: { apiKey: string }) {
  const [mode, setMode] = useState<SnippetMode>("chat");
  const [lang, setLang] = useState<SnippetLang>("curl");
  const [copied, setCopied] = useState(false);

  const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://your-server";
  const WS_URL = BASE_URL.replace(/^http/, "ws");

  const snippets: Record<SnippetMode, Record<SnippetLang, string>> = {
    chat: {
      curl: `curl ${BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "Qwen3-14B",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="${apiKey}"
)

response = client.chat.completions.create(
    model="Qwen3-14B",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`,
      node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${BASE_URL}/v1",
  apiKey: "${apiKey}",
});

const response = await client.chat.completions.create({
  model: "Qwen3-14B",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`,
    },
    stt: {
      curl: `# Transcribe an audio file
curl ${BASE_URL}/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F file=@audio.wav \\
  -F model=whisper-large-v3-turbo`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="${apiKey}"
)

with open("audio.wav", "rb") as f:
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=f
    )
print(transcript.text)`,
      node: `import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  baseURL: "${BASE_URL}/v1",
  apiKey: "${apiKey}",
});

const transcript = await client.audio.transcriptions.create({
  model: "whisper-large-v3-turbo",
  file: fs.createReadStream("audio.wav"),
});
console.log(transcript.text);`,
    },
    realtime: {
      curl: `# WebSocket real-time transcription
# Connect with your API key as token:
# ${WS_URL}/ws/transcribe?token=${apiKey}

# Test with websocat:
echo '{"action":"stop"}' | websocat \\
  "${WS_URL}/ws/transcribe?token=${apiKey}"`,
      python: `import asyncio
import websockets
import pyaudio

API_KEY = "${apiKey}"
WS_URL = f"${WS_URL}/ws/transcribe?token={API_KEY}"

async def live_transcribe():
    async with websockets.connect(WS_URL) as ws:
        print("Connected. Speak into your mic...")

        # Capture mic audio
        pa = pyaudio.PyAudio()
        stream = pa.open(format=pyaudio.paInt16,
                         channels=1, rate=16000,
                         input=True, frames_per_buffer=4096)

        async def send_audio():
            while True:
                data = stream.read(4096, exception_on_overflow=False)
                await ws.send(data)
                await asyncio.sleep(0.1)

        async def recv_text():
            async for msg in ws:
                import json
                result = json.loads(msg)
                if result.get("text"):
                    print(f">> {result['text']}")

        await asyncio.gather(send_audio(), recv_text())

asyncio.run(live_transcribe())`,
      node: `// Real-time transcription via WebSocket
const WebSocket = require("ws");

const API_KEY = "${apiKey}";
const ws = new WebSocket(
  \`${WS_URL}/ws/transcribe?token=\${API_KEY}\`
);

ws.on("open", () => {
  console.log("Connected. Send audio binary frames...");

  // Example: read audio file in chunks
  const fs = require("fs");
  const stream = fs.createReadStream("audio.wav", {
    highWaterMark: 4096,
  });
  stream.on("data", (chunk) => ws.send(chunk));
  stream.on("end", () => {
    ws.send(JSON.stringify({ action: "stop" }));
  });
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.text) console.log(">>", msg.text);
  if (msg.type === "done") ws.close();
});`,
    },
  };

  const code = snippets[mode][lang];

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 bg-[#050505] border border-[#262626] rounded overflow-hidden">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#262626]">
        {(["chat", "stt", "realtime"] as SnippetMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 rounded text-[10px] tracking-[0.05em] font-bold uppercase font-[family-name:var(--font-mono)] transition ${
              mode === m ? "bg-[#6366f1]/20 text-[#c0c1ff] border border-[#6366f1]/30" : "text-[#908fa0] hover:text-[#c7c4d7]"
            }`}
          >
            {m === "chat" ? "LLM Chat" : m === "stt" ? "Transcription" : "Real-time STT"}
          </button>
        ))}
      </div>
      {/* Language toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#262626]">
        <div className="flex gap-1">
          {(["curl", "python", "node"] as SnippetLang[]).map((t) => (
            <button
              key={t}
              onClick={() => setLang(t)}
              className={`px-2 py-1 rounded text-[11px] font-[family-name:var(--font-mono)] transition ${
                lang === t ? "bg-[#262626] text-[#e5e2e1]" : "text-[#908fa0] hover:text-[#c7c4d7]"
              }`}
            >
              {t === "curl" ? "cURL" : t === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>
        <button onClick={copy} className="text-[11px] text-[#908fa0] hover:text-[#e5e2e1] transition font-[family-name:var(--font-mono)]">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-[13px] leading-[20px] text-[#c7c4d7] overflow-x-auto font-[family-name:var(--font-mono)]">{code}</pre>
    </div>
  );
}

export default function KeysPage() {
  const [keyList, setKeyList] = useState<{ id: string; name: string; key_prefix: string; models_allowed: string[]; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newSttEngine, setNewSttEngine] = useState("sensevoice");
  const [newSttLang, setNewSttLang] = useState("auto");
  const [newSttTarget, setNewSttTarget] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  function loadKeys() {
    keys.list().then(setKeyList).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { loadKeys(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await keys.create(newKeyName, {
        stt_engine: newSttEngine,
        stt_language: newSttLang,
        stt_target_language: newSttTarget || null,
      });
      setCreatedKey(result.key);
      setNewKeyName("");
      setShowCreate(false);
      loadKeys();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to create key", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    try {
      await keys.revoke(id);
      toast("Key revoked", "success");
      loadKeys();
    } catch {
      toast("Failed to revoke key", "error");
    }
  }

  function copyKey() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  const filteredKeys = searchQuery
    ? keyList.filter((k) => k.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : keyList;

  return (
    <div className="max-w-[1280px] mx-auto w-full flex flex-col gap-4">
      {/* Created-key banner */}
      {createdKey && (
        <div className="bg-[#171717] border-b border-[#262626] px-4 py-4 sticky top-0 z-10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="mt-0.5 text-[#6366f1] bg-[#6366f1]/10 p-2 rounded-full shrink-0">
                <span className="material-symbols-outlined text-[20px]">info</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] leading-[20px] font-semibold text-[#e5e2e1]">Save your new API key</h3>
                <p className="text-[12px] leading-[18px] text-[#c7c4d7] mt-1">For security reasons, this key won&apos;t be shown again. Please copy it immediately.</p>
                <div className="mt-2 flex items-center bg-[#050505] border border-[#262626] rounded px-2 py-1.5">
                  <code className="font-[family-name:var(--font-mono)] text-[13px] leading-[20px] text-[#c0c1ff] truncate mr-3 flex-1">{createdKey}</code>
                  <button
                    onClick={copyKey}
                    className="text-[#c7c4d7] hover:text-[#e5e2e1] transition-colors shrink-0"
                    title="Copy to clipboard"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                </div>
                <CodeSnippets apiKey={createdKey} />
              </div>
            </div>
            <button onClick={() => setCreatedKey(null)} className="text-[#c7c4d7] hover:text-[#e5e2e1] shrink-0">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold text-[#e5e2e1]">API Keys</h2>
          <p className="text-[14px] leading-[20px] text-[#c7c4d7] mt-1">Manage authentication keys for your Switchboard environments.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedKey(null); }}
          className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[14px] leading-[20px] font-medium px-4 py-2 rounded flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Key
        </button>
      </div>

      {/* Create key form */}
      {showCreate && !createdKey && (
        <form onSubmit={handleCreate} className="bg-[#171717] border border-[#262626] rounded-lg p-4 space-y-4">
          <div>
            <label className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase block mb-1">Key name</label>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 text-[14px] text-[#e5e2e1] placeholder:text-[#464554] focus:outline-none focus:border-[#6366f1] transition-colors"
              placeholder="e.g. production-web, staging-backend"
              required
              autoFocus
            />
          </div>

          {/* STT Configuration */}
          <div className="border-t border-[#262626] pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[14px] text-[#908fa0]">graphic_eq</span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">STT Configuration</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-[#908fa0] block mb-1">Engine</label>
                <div className="flex bg-[#0a0a0a] border border-[#262626] rounded p-0.5">
                  <button type="button" onClick={() => setNewSttEngine("sensevoice")} className={`flex-1 py-1.5 rounded text-[11px] font-[family-name:var(--font-mono)] transition ${newSttEngine === "sensevoice" ? "bg-[#6366f1] text-white" : "text-[#908fa0]"}`}>SenseVoice</button>
                  <button type="button" onClick={() => setNewSttEngine("whisper")} className={`flex-1 py-1.5 rounded text-[11px] font-[family-name:var(--font-mono)] transition ${newSttEngine === "whisper" ? "bg-[#6366f1] text-white" : "text-[#908fa0]"}`}>Whisper</button>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#908fa0] block mb-1">Language</label>
                <select value={newSttLang} onChange={(e) => setNewSttLang(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-2 py-1.5 text-[12px] text-[#e5e2e1] font-[family-name:var(--font-mono)] focus:outline-none focus:border-[#6366f1]">
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                  <option value="ko">Korean</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#908fa0] block mb-1">Translate to</label>
                <select value={newSttTarget} onChange={(e) => setNewSttTarget(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-2 py-1.5 text-[12px] text-[#e5e2e1] font-[family-name:var(--font-mono)] focus:outline-none focus:border-[#6366f1]">
                  <option value="">None</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[14px] font-medium px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50">
              {creating && <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
              {creating ? "Creating..." : "Create key"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="border border-[#262626] text-[#c7c4d7] hover:bg-[#262626] text-[14px] px-4 py-2 rounded transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Keys table */}
      <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-[#262626] bg-[#1a1a1a] flex justify-between items-center">
          <h3 className="text-[12px] leading-[18px] font-semibold text-[#e5e2e1]">Active Keys</h3>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[#c7c4d7] text-[16px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0a0a0a] border border-[#262626] rounded text-[12px] text-[#e5e2e1] pl-8 pr-2 py-1 w-[200px] focus:outline-none focus:border-[#6366f1] transition-colors placeholder:text-[#464554] font-[family-name:var(--font-mono)]"
              placeholder="Search keys..."
              type="text"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#262626] bg-[#171717]">
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Name</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Key Prefix</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Allowed Models</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Status</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[14px] leading-[20px] text-[#e5e2e1] divide-y divide-[#262626]">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[#908fa0]">
                  <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-[#464554]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Loading keys...
                </td></tr>
              ) : filteredKeys.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[#908fa0]">
                  {searchQuery ? "No keys match your search." : "No API keys yet. Create one to get started."}
                </td></tr>
              ) : filteredKeys.map((k) => (
                <tr key={k.id} className={`hover:bg-[#201f1f] transition-colors group ${k.status !== "active" ? "opacity-60" : ""}`}>
                  <td className="py-3 px-4">
                    <div className={`font-medium text-[#e5e2e1] ${k.status !== "active" ? "line-through decoration-[#464554]" : ""}`}>{k.name}</div>
                    <div className="text-[12px] leading-[18px] text-[#c7c4d7] mt-0.5">
                      {k.status !== "active" ? "Revoked" : "Created"} {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <code className="font-[family-name:var(--font-mono)] text-[11px] leading-[16px] text-[#c7c4d7] bg-[#050505] px-1 py-0.5 rounded border border-[#262626]">{k.key_prefix}</code>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {k.models_allowed.map((m) => (
                        <span key={m} className="font-[family-name:var(--font-mono)] text-[11px] px-2 py-0.5 rounded-full bg-[#2a2a2a] border border-[#464554] text-[#e5e2e1]">{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold px-2 py-1 rounded ${
                      k.status === "active"
                        ? "text-[#4ade80] bg-[#4ade80]/10"
                        : "text-[#ffb4ab] bg-[#ffb4ab]/10"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${k.status === "active" ? "bg-[#4ade80]" : "bg-[#ffb4ab]"}`} />
                      {k.status === "active" ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {k.status === "active" ? (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        className="text-[#c7c4d7] hover:text-[#ffb4ab] transition-colors text-[12px] border border-transparent hover:border-[#ffb4ab]/30 px-2 py-1 rounded"
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="text-[12px] text-[#464554]">Delete</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-[#c0c1ff] mt-0.5">shield</span>
            <div>
              <h3 className="text-[14px] leading-[20px] font-semibold text-[#e5e2e1]">Security Best Practices</h3>
              <p className="text-[12px] leading-[18px] text-[#c7c4d7] mt-1">Never expose your live API keys in client-side code. Use environment variables and proxy requests through your backend. Rotate keys periodically or if you suspect a leak.</p>
              <a href="#" className="text-[#c0c1ff] hover:text-[#494bd6] transition-colors text-[12px] mt-2 inline-flex items-center gap-1">
                Read documentation <span className="text-sm">→</span>
              </a>
            </div>
          </div>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
          <h3 className="text-[14px] leading-[20px] font-semibold text-[#e5e2e1]">Need finer control?</h3>
          <p className="text-[12px] leading-[18px] text-[#c7c4d7] mt-1">Enterprise plans include IP whitelisting, usage quotas per key, and detailed audit logs.</p>
          <button className="mt-3 border border-[#262626] text-[#e5e2e1] hover:bg-[#262626] text-[12px] px-3 py-1.5 rounded transition-colors">
            Upgrade Plan
          </button>
        </div>
      </div>
    </div>
  );
}
