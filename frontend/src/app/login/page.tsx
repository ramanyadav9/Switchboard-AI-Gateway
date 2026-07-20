"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { access_token } = await auth.login(email, password);
      localStorage.setItem("token", access_token);
      router.push("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.04] pointer-events-none" />

      <main className="w-full max-w-[400px] px-4 relative z-10">
        <div className="t-card rounded-xl p-6 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center"
              style={{ background: "var(--accent)" }}
            >
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <h1 className="text-2xl font-semibold text-center">
              Log in to Switchboard
            </h1>
          </div>

          {error && (
            <div
              className="text-sm px-4 py-2.5 rounded-md"
              style={{ background: "var(--error-subtle)", color: "var(--error)" }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-email"
                className="text-xs font-medium"
                style={{ color: "var(--fg-secondary)" }}
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="t-input w-full rounded-md px-3 py-2 text-sm"
                placeholder="you@company.com"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="text-xs font-medium"
                style={{ color: "var(--fg-secondary)" }}
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="t-input w-full rounded-md px-3 py-2 text-sm font-[family-name:var(--font-mono)] tracking-widest"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="t-btn w-full py-2.5 rounded-md text-sm font-medium flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Logging in...
                </>
              ) : (
                <>
                  Log In
                  <span className="material-symbols-outlined text-[18px]">login</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4 text-center mt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--fg-secondary)" }}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium ml-1" style={{ color: "var(--accent)" }}>
                Sign up
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
          <span
            className="font-[family-name:var(--font-mono)] text-[11px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Gateway Status: Optimal
          </span>
        </div>
      </main>
    </div>
  );
}
