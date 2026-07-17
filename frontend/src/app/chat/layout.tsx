"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth, conversations } from "@/lib/api";

type Conv = {
  id: string;
  title: string | null;
  model: string;
  message_count: number;
  updated_at: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function groupConversations(convs: Conv[]): { label: string; items: Conv[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;

  const groups: Record<string, Conv[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };

  for (const c of convs) {
    const t = new Date(c.updated_at).getTime();
    if (t >= todayStart) groups["Today"].push(c);
    else if (t >= yesterdayStart) groups["Yesterday"].push(c);
    else if (t >= weekStart) groups["Previous 7 days"].push(c);
    else groups["Older"].push(c);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; tier: string } | null>(null);
  const [convList, setConvList] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadConversations = useCallback(() => {
    conversations.list().then(setConvList).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    auth.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem("token"); router.push("/login"); })
      .finally(() => setLoading(false));
    loadConversations();
  }, [router, loadConversations]);

  // Refresh conversation list when pathname changes (new chat created)
  useEffect(() => {
    loadConversations();
  }, [pathname, loadConversations]);

  function logout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  async function handleNewChat() {
    try {
      const conv = await conversations.create();
      router.push(`/chat/${conv.id}`);
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    await conversations.delete(id);
    loadConversations();
    if (pathname === `/chat/${id}`) router.push("/chat");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#131313]">
        <div className="flex items-center gap-3 text-[#908fa0]">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  const groups = groupConversations(convList);

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="px-3 py-4 border-b border-[#262626]">
        <div className="flex items-center justify-between mb-3">
          <Link href="/chat" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-bold text-[10px]">S</div>
            <span className="text-[14px] font-bold text-[#e5e2e1] tracking-tight">Switchboard</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-[#908fa0]">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[13px] font-medium rounded transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {convList.length === 0 && (
          <div className="text-center text-[#464554] text-[12px] py-8">No conversations yet</div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="px-2 py-1 text-[10px] font-bold text-[#464554] uppercase tracking-[0.05em] font-[family-name:var(--font-mono)]">
              {group.label}
            </div>
            {group.items.map((conv) => {
              const isActive = pathname === `/chat/${conv.id}`;
              return (
                <Link
                  key={conv.id}
                  href={`/chat/${conv.id}`}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-2 px-2 py-2 rounded text-[13px] transition-colors mb-0.5 ${
                    isActive
                      ? "bg-[#262626] text-[#e5e2e1]"
                      : "text-[#c7c4d7] hover:bg-[#1c1c22]"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px] text-[#908fa0] shrink-0">chat_bubble</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{conv.title || "New conversation"}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[#464554] font-[family-name:var(--font-mono)]">{conv.model?.split("-")[0]}</span>
                      <span className="text-[10px] text-[#464554]">{relativeTime(conv.updated_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-[#908fa0] hover:text-[#ffb4ab] transition-all shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-[#262626]">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-[#908fa0] hover:text-[#c7c4d7] transition-colors rounded hover:bg-[#1c1c22]">
          <span className="material-symbols-outlined text-[14px]">dashboard</span>
          API Dashboard
        </Link>
        <div className="flex items-center justify-between px-2 mt-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded bg-[#262626] flex items-center justify-center text-[10px] font-bold text-[#e5e2e1] shrink-0">
              {user?.email?.substring(0, 2).toUpperCase() || "??"}
            </div>
            <span className="text-[12px] text-[#908fa0] truncate">{user?.email}</span>
          </div>
          <button onClick={logout} className="text-[#908fa0] hover:text-[#c7c4d7] transition-colors">
            <span className="material-symbols-outlined text-[16px]">logout</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#131313]">
      {/* Desktop sidebar */}
      <aside className="w-[280px] bg-[#171717] border-r border-[#262626] hidden md:flex flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] bg-[#171717] border-r border-[#262626] flex flex-col z-40 animate-slide-in-left">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-[#171717] border-b border-[#262626] flex items-center justify-between px-3 z-20">
        <button onClick={() => setSidebarOpen(true)} className="text-[#e5e2e1]">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="text-[14px] font-bold text-[#e5e2e1]">Switchboard</span>
        <button onClick={handleNewChat} className="text-[#6366f1]">
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 md:pt-0 pt-12">
        {children}
      </main>
    </div>
  );
}
