"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth, conversations, usage } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast";

type Conv = {
  id: string;
  title: string | null;
  model: string;
  mode: string;
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
  const { toast } = useToast();
  const [user, setUser] = useState<{ email: string; tier: string } | null>(null);
  const [convList, setConvList] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [usageData, setUsageData] = useState<{ requests_today: number; tokens_today: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const RPM_LIMIT = 50;

  const loadConversations = useCallback(() => {
    conversations.list().then(setConvList).catch(() => {
      toast("Failed to load conversations", "error");
    });
  }, [toast]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    auth.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem("token"); router.push("/login"); })
      .finally(() => setLoading(false));
    loadConversations();
    usage.stats(1).then(setUsageData).catch(() => {});
  }, [router, loadConversations]);

  useEffect(() => {
    loadConversations();
  }, [pathname, loadConversations]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          handleNewChat();
        }
        if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function logout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  async function handleNewChat() {
    try {
      const conv = await conversations.create();
      router.push(`/chat/${conv.id}`);
    } catch {
      toast("Failed to create conversation", "error");
    }
  }

  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !deleting) setDeleteTarget(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, deleting]);

  function requestDelete(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({ id, title });
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    const { id } = deleteTarget;
    setDeleting(true);
    try {
      await conversations.delete(id);
      loadConversations();
      if (pathname === `/chat/${id}` || pathname === `/chat/agent/${id}`) router.push("/chat");
      setDeleteTarget(null);
    } catch {
      toast("Failed to delete conversation", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-3" style={{ color: "var(--fg-muted)" }}>
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  const filteredConvs = searchQuery
    ? convList.filter((c) => (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : convList;
  const groups = groupConversations(filteredConvs);

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="px-3 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <Link href="/chat" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-white font-bold text-[10px]" style={{ background: "var(--accent)" }}>S</div>
            <span className="text-[14px] font-bold tracking-tight">Switchboard</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden" style={{ color: "var(--fg-muted)" }}>
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 t-btn text-[13px] font-medium rounded transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Chat
          </button>
          <button
            onClick={async () => {
              // If viewing an existing plain chat, switch THAT conversation to
              // agent mode (keeps its history). Otherwise start a fresh agent session.
              const m = pathname.match(/^\/chat\/([^/]+)$/);
              const reserved = ["agents", "settings", "skills", "research"];
              const currentId = m && !reserved.includes(m[1]) ? m[1] : null;
              try {
                if (currentId) {
                  await conversations.update(currentId, { mode: "agent" });
                  loadConversations();
                  router.push(`/chat/agent/${currentId}`);
                } else {
                  const conv = await conversations.create({ mode: "agent" });
                  router.push(`/chat/agent/${conv.id}`);
                }
              } catch { toast("Failed to switch to agent mode", "error"); }
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[13px] font-medium transition-colors hover:bg-white/5"
            style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}
            title="Switch the current chat to agent mode (or start a new agent session)"
          >
            <span className="material-symbols-outlined text-[16px]">terminal</span>
            Agent
          </button>
        </div>
        {/* Search */}
        <div className="relative mt-2">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: "var(--fg-muted)" }}>search</span>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats... (Ctrl+K)"
            className="t-input w-full rounded pl-7 pr-2 py-1.5 text-[12px]"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {convList.length === 0 && (
          <div className="text-center text-[12px] py-8" style={{ color: "var(--fg-muted)" }}>No conversations yet</div>
        )}
        {searchQuery && filteredConvs.length === 0 && convList.length > 0 && (
          <div className="text-center text-[12px] py-8" style={{ color: "var(--fg-muted)" }}>No matches for &ldquo;{searchQuery}&rdquo;</div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>
              {group.label}
            </div>
            {group.items.map((conv) => {
              const isAgent = conv.mode === "agent";
              const convPath = isAgent ? `/chat/agent/${conv.id}` : `/chat/${conv.id}`;
              const isActive = pathname === convPath || pathname === `/chat/${conv.id}` || pathname === `/chat/agent/${conv.id}`;
              return (
                <Link
                  key={conv.id}
                  href={convPath}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-2 px-2 py-2 rounded text-[13px] transition-colors mb-0.5 ${
                    isActive ? "" : "hover:bg-white/5"
                  }`}
                  style={{
                    background: isActive ? "var(--bg-emphasis)" : undefined,
                    color: isActive ? "var(--fg)" : "var(--fg-secondary)",
                  }}
                >
                  <span className="material-symbols-outlined text-[14px] shrink-0" style={{ color: isAgent ? "var(--accent)" : "var(--fg-muted)" }}>{isAgent ? "terminal" : "chat_bubble"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{conv.title || "New conversation"}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-muted)" }}>{conv.model?.split("-")[0]}</span>
                      <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>{relativeTime(conv.updated_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => requestDelete(conv.id, conv.title || "New conversation", e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-[#ffb4ab] transition-all shrink-0"
                    style={{ color: "var(--fg-muted)" }}
                    title="Delete chat"
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
      <div className="px-3 py-3 relative" style={{ borderTop: "1px solid var(--border)" }}>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border shadow-lg z-50 overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {[
                { href: "/chat/settings", icon: "settings", label: "Settings" },
                { href: "/chat/skills", icon: "psychology", label: "Skills" },
                { href: "/chat/research", icon: "science", label: "Research" },
                { href: "/chat/agents", icon: "terminal", label: "Agents" },
                { href: "/dashboard", icon: "dashboard", label: "API Dashboard" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => { setMenuOpen(false); setSidebarOpen(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-white/5"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  <span className="material-symbols-outlined text-[14px]">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-white/5 w-full"
                  style={{ color: "var(--error)" }}
                >
                  <span className="material-symbols-outlined text-[14px]">logout</span>
                  Log out
                </button>
              </div>
            </div>
          </>
        )}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 min-w-0 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5 cursor-pointer"
          >
            <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--bg-emphasis)" }}>
              {user?.email?.substring(0, 2).toUpperCase() || "??"}
            </div>
            <span className="text-[12px] truncate" style={{ color: "var(--fg-secondary)" }}>{user?.email}</span>
            <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--fg-muted)" }}>
              {menuOpen ? "expand_more" : "expand_less"}
            </span>
          </button>
          <div className="flex items-center gap-1">
            {usageData && (() => {
              const pct = Math.min((usageData.requests_today / RPM_LIMIT) * 100, 100);
              const r = 10; const circ = 2 * Math.PI * r;
              const color = pct > 80 ? "var(--error)" : pct > 50 ? "var(--syn-fn)" : "var(--success)";
              return (
                <div className="relative w-7 h-7 flex items-center justify-center" title={`${usageData.requests_today}/${RPM_LIMIT} requests today`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" className="transform -rotate-90">
                    <circle cx="12" cy="12" r={r} fill="none" stroke="var(--bg-emphasis)" strokeWidth="2.5" />
                    <circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="2.5"
                      strokeDasharray={circ} strokeDashoffset={circ - (circ * pct) / 100}
                      strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s" }}
                    />
                  </svg>
                  <span className="absolute text-[7px] font-bold font-[family-name:var(--font-mono)]" style={{ color }}>{Math.round(pct)}</span>
                </div>
              );
            })()}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Desktop sidebar */}
      <aside className="w-[280px] hidden md:flex flex-col shrink-0" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] flex flex-col z-40 animate-slide-in-left" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-3 z-20" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => setSidebarOpen(true)}>
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="text-[14px] font-bold">Switchboard</span>
        <button onClick={handleNewChat} style={{ color: "var(--accent)" }}>
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 md:pt-0 pt-12">
        {pathname.startsWith("/chat/settings") || pathname.startsWith("/chat/skills") || pathname.startsWith("/chat/research") || (pathname === "/chat/agents") ? (
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="max-w-[900px] mx-auto">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !deleting && setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-[380px] rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[22px] shrink-0" style={{ color: "var(--error)" }}>delete</span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Delete chat?</h2>
                <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  <span className="font-medium" style={{ color: "var(--fg)" }}>&ldquo;{deleteTarget.title}&rdquo;</span> and its messages will be permanently removed. This can&rsquo;t be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
                style={{ border: "1px solid var(--border)", color: "var(--fg-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                autoFocus
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity disabled:opacity-60 inline-flex items-center gap-2"
                style={{ background: "var(--error)" }}
              >
                {deleting && (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                )}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
