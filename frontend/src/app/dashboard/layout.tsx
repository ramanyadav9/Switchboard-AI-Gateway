"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/keys", label: "API Keys", icon: "vpn_key" },
  { href: "/dashboard/skills", label: "Skills", icon: "psychology" },
  { href: "/dashboard/research", label: "Research", icon: "science" },
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
    `${linkBase} border-transparent hover:bg-white/5`;
  const linkActive =
    `${linkBase}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--fg-muted)" }}>
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  const sidebarContent = (mobile?: boolean) => (
    <>
      <div className="px-4 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
            <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--accent)", fontVariationSettings: "'FILL' 1" }}>dataset</span>
          </div>
          <div>
            <h1 className="text-[18px] font-black leading-none tracking-tight">Switchboard</h1>
            <p className="text-[12px] leading-tight mt-0.5" style={{ color: "var(--fg-secondary)" }}>AI Gateway</p>
          </div>
        </div>

        {/* Main Navigation */}
        <ul className="flex flex-col gap-1">
          {mainNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={mobile ? () => setSidebarOpen(false) : undefined}
                className={pathname === item.href ? linkActive : linkInactive}
                style={
                  pathname === item.href
                    ? { borderColor: "var(--accent)", background: "var(--accent-subtle)", color: "var(--accent)" }
                    : { color: "var(--fg-secondary)" }
                }
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
              <a href={item.href} className={linkInactive} style={{ color: "var(--fg-secondary)" }}>
                <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <button onClick={logout} className={`${linkInactive} w-full`} style={{ color: "var(--fg-secondary)" }}>
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Logout
            </button>
          </li>
        </ul>

        {/* Theme Toggle */}
        <div className="px-2">
          <ThemeToggle />
        </div>

        {/* User Section */}
        <div className="border-t pt-2 mt-1" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-8 h-8 rounded border flex items-center justify-center shrink-0" style={{ background: "var(--bg-emphasis)", borderColor: "var(--border)" }}>
              <span className="text-[12px] font-bold">{userInitials()}</span>
            </div>
            <div className="overflow-hidden">
              <p className="text-[12px] truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — Desktop */}
      <nav
        className="h-screen w-[240px] hidden md:flex flex-col justify-between py-6 shrink-0 z-10 border-r"
        style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}
      >
        {sidebarContent()}
      </nav>

      {/* Mobile Header */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 flex items-center justify-between px-4 h-16 border-b z-20"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--accent)", fontVariationSettings: "'FILL' 1" }}>dataset</span>
          <h1 className="text-[18px] font-black">Switchboard</h1>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          <span className="material-symbols-outlined">{sidebarOpen ? "close" : "menu"}</span>
        </button>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
          <nav
            className="md:hidden fixed left-0 top-0 bottom-0 w-[240px] border-r flex flex-col justify-between py-6 z-40 animate-slide-in-left"
            style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}
          >
            {sidebarContent(true)}
          </nav>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-16">
        <div className="p-6 md:p-12 max-w-[1280px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
