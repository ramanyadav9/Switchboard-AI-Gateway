"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";

export default function SignupPage() {
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
      await auth.signup(email, password);
      const { access_token } = await auth.login(email, password);
      localStorage.setItem("token", access_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Subtle radial gradient background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(circle at top right, rgba(99, 102, 241, 0.05), transparent 40%)",
        }}
      />

      <main className="w-full max-w-md bg-[#131313] border border-[#262626] rounded-lg p-12 flex flex-col items-center relative z-10">
        {/* Logo */}
        <div className="w-16 h-16 rounded-lg bg-[#201f1f] border border-[#353534] flex items-center justify-center overflow-hidden p-1 mb-6">
          <div className="w-full h-full rounded bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center">
            <span className="text-white font-bold text-xl">S</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[24px] leading-[32px] tracking-[-0.01em] font-semibold text-[#e5e2e1] text-center mb-8">
          Create your Switchboard account
        </h1>

        {/* Error */}
        {error && (
          <div className="w-full bg-[#93000a]/20 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[14px] leading-[20px] px-4 py-2.5 rounded-sm mb-4">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="signup-email"
              className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase"
            >
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#131313] border border-[#353534] rounded-sm px-4 py-2.5 text-[14px] leading-[20px] text-[#e5e2e1] placeholder:text-[#353534] focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-all duration-200"
              placeholder="developer@example.com"
              required
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="signup-password"
              className="font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase"
            >
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#131313] border border-[#353534] rounded-sm px-4 py-2.5 text-[14px] leading-[20px] text-[#e5e2e1] placeholder:text-[#353534] focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-all duration-200 font-[family-name:var(--font-mono)] tracking-widest"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8083ff] hover:bg-[#8083ff]/90 text-[#0d0096] text-[14px] leading-[20px] font-semibold py-2.5 rounded-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-[12px] leading-[18px] text-[#c7c4d7] mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[#c0c1ff] hover:text-[#494bd6] transition-colors font-medium"
          >
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
