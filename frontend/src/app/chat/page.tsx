"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { conversations } from "@/lib/api";

export default function ChatPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function startChat() {
    if (creating) return;
    setCreating(true);
    try {
      const conv = await conversations.create();
      router.push(`/chat/${conv.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center mx-auto mb-6">
          <span className="text-white font-bold text-2xl">S</span>
        </div>
        <h1 className="text-[24px] font-semibold text-[#e5e2e1] tracking-[-0.01em] mb-2">
          How can I help you today?
        </h1>
        <p className="text-[14px] text-[#908fa0] mb-8 leading-relaxed">
          Start a conversation with Qwen3-14B. Your chats are saved and can be continued anytime.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={startChat}
            disabled={creating}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[14px] font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {creating ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <span className="material-symbols-outlined text-[18px]">chat</span>
            )}
            {creating ? "Creating..." : "Start a conversation"}
          </button>

          <button
            onClick={() => router.push("/dashboard/playground")}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#171717] hover:bg-[#262626] text-[#c7c4d7] text-[14px] border border-[#262626] rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">science</span>
            Open Playground
          </button>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3">
          {[
            { icon: "code", text: "Write code", prompt: "Help me write a Python script that..." },
            { icon: "school", text: "Explain a concept", prompt: "Explain how..." },
            { icon: "translate", text: "Translate text", prompt: "Translate the following to..." },
            { icon: "edit_note", text: "Summarize text", prompt: "Summarize this document..." },
          ].map((s) => (
            <button
              key={s.icon}
              onClick={async () => {
                setCreating(true);
                try {
                  const conv = await conversations.create({ title: s.text });
                  router.push(`/chat/${conv.id}`);
                } catch { setCreating(false); }
              }}
              className="flex items-center gap-2 px-3 py-2.5 bg-[#171717] hover:bg-[#1c1c22] border border-[#262626] hover:border-[#464554] rounded-lg transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[16px] text-[#908fa0]">{s.icon}</span>
              <span className="text-[12px] text-[#c7c4d7]">{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
