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
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Grid pattern background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none" />

      <main className="w-full max-w-[400px] px-4 relative z-10">
        {/* Login card */}
        <div className="bg-[#131313] border border-[#353534] rounded-xl p-6 flex flex-col gap-6 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-[#201f1f] border border-[#353534] flex items-center justify-center overflow-hidden p-1">
              <div className="w-full h-full rounded bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center">
                <span className="text-white font-bold text-xl">S</span>
              </div>
            </div>
            <h1 className="text-[24px] leading-[32px] tracking-[-0.01em] font-semibold text-[#e5e2e1] text-center">
              Log in to Switchboard
            </h1>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[#93000a]/20 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[14px] leading-[20px] px-4 py-2.5 rounded-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            {/* Email */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="login-email"
                className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase"
              >
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#131313] border border-[#353534] rounded-sm px-4 py-2.5 text-[14px] leading-[20px] text-[#e5e2e1] placeholder:text-[#353534] focus:outline-none focus:border-[#494bd6] focus:ring-1 focus:ring-[#494bd6] transition-all duration-200"
                placeholder="developer@company.com"
                required
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="login-password"
                  className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase"
                >
                  Password
                </label>
                <span className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c0c1ff] hover:text-[#494bd6] transition-colors cursor-pointer">
                  Reset
                </span>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#131313] border border-[#353534] rounded-sm px-4 py-2.5 text-[14px] leading-[20px] text-[#e5e2e1] placeholder:text-[#353534] focus:outline-none focus:border-[#494bd6] focus:ring-1 focus:ring-[#494bd6] transition-all duration-200 font-[family-name:var(--font-mono)] tracking-widest"
                placeholder="••••••••••••"
                required
              />
            </div>

            {/* Submit */}
            <div className="mt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#494bd6] hover:bg-[#494bd6]/90 text-[#131313] text-[14px] leading-[20px] font-semibold py-2 rounded-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
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
            </div>
          </form>

          {/* Footer */}
          <div className="pt-4 border-t border-[#353534] text-center mt-1">
            <p className="text-[12px] leading-[18px] text-[#c7c4d7]">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-[#c0c1ff] hover:text-[#494bd6] transition-colors font-medium ml-1"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>

        {/* Gateway status indicator */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#494bd6] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#494bd6]" />
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] leading-[16px] text-[#464554]">
            Gateway Status: Optimal
          </span>
        </div>
      </main>
    </div>
  );
}
