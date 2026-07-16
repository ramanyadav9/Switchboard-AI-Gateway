"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/keys", label: "API Keys", icon: "vpn_key" },
  { href: "/dashboard/playground", label: "Playground", icon: "terminal" },
  { href: "/dashboard/docs", label: "Docs", icon: "description" },
];

const footerNav: { href: string; label: string; icon: string }[] = [];


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; tier: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    auth.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem("token"); router.push("/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  function logout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  function userInitials(): string {
    if (!user?.email) return "??";
    return user.email.substring(0, 2).toUpperCase();
  }

  const linkBase =
    "flex items-center gap-2 px-2 py-2 border-l-4 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase transition-all";
  const linkInactive =
    `${linkBase} border-transparent text-[#c7c4d7] hover:bg-[#353534]`;
  const linkActive =
    `${linkBase} border-[#c0c1ff] bg-[#334282] text-[#a2b1f9]`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — Desktop */}
      <nav className="bg-[#201f1f] border-r border-[#464554] h-screen w-[240px] hidden md:flex flex-col justify-between py-6 shrink-0 z-10">
        <div className="px-4 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-6 h-6 rounded bg-[#c0c1ff] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[14px] text-[#1000a9]" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
            </div>
            <div>
              <h1 className="text-[18px] font-black text-[#e5e2e1] leading-none tracking-tight">Switchboard</h1>
              <p className="text-[12px] text-[#c7c4d7] leading-tight mt-0.5">AI Gateway</p>
            </div>
          </div>

          {/* Main Navigation */}
          <ul className="flex flex-col gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={pathname === item.href ? linkActive : linkInactive}
                >
                  <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-4 flex flex-col gap-4">
          <ul className="flex flex-col gap-1">
            {footerNav.map((item) => (
              <li key={item.label}>
                <a href={item.href} className={linkInactive}>
                  <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <button onClick={logout} className={`${linkInactive} w-full`}>
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Logout
              </button>
            </li>
          </ul>

          {/* User Section */}
          <div className="border-t border-[#262626] pt-2 mt-1">
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="w-8 h-8 rounded bg-[#353534] border border-[#262626] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-bold text-[#e5e2e1]">{userInitials()}</span>
              </div>
              <div className="overflow-hidden">
                <p className="text-[12px] text-[#e5e2e1] truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 flex items-center justify-between px-4 h-16 border-b border-[#262626] bg-[#0a0a0a] z-20">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#c0c1ff] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
          <h1 className="text-[18px] font-black text-[#e5e2e1]">Switchboard</h1>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-[#e5e2e1]">
          <span className="material-symbols-outlined">{sidebarOpen ? "close" : "menu"}</span>
        </button>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
          <nav className="md:hidden fixed left-0 top-0 bottom-0 w-[240px] bg-[#201f1f] border-r border-[#464554] flex flex-col justify-between py-6 z-40 animate-slide-in-left">
            <div className="px-4 flex flex-col gap-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 rounded bg-[#c0c1ff] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[14px] text-[#1000a9]" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
                </div>
                <div>
                  <h1 className="text-[18px] font-black text-[#e5e2e1] leading-none tracking-tight">Switchboard</h1>
                  <p className="text-[12px] text-[#c7c4d7] leading-tight mt-0.5">AI Gateway</p>
                </div>
              </div>
              <ul className="flex flex-col gap-1">
                {mainNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={() => setSidebarOpen(false)} className={pathname === item.href ? linkActive : linkInactive}>
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-4 flex flex-col gap-4">
              <ul className="flex flex-col gap-1">
                {footerNav.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className={linkInactive}>
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <button onClick={logout} className={`${linkInactive} w-full`}>
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    Logout
                  </button>
                </li>
              </ul>
              <div className="border-t border-[#262626] pt-2 mt-1">
                <div className="flex items-center gap-2 px-2 py-1">
                  <div className="w-8 h-8 rounded bg-[#353534] border border-[#262626] flex items-center justify-center shrink-0">
                    <span className="text-[12px] font-bold text-[#e5e2e1]">{userInitials()}</span>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[12px] text-[#e5e2e1] truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            </div>
          </nav>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] md:pt-0 pt-16">
        <div className="p-6 md:p-12 max-w-[1280px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
