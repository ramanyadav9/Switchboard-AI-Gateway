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
      router.push("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.04] pointer-events-none" />

      <main className="w-full max-w-md relative z-10">
        <div className="t-card rounded-xl p-10 flex flex-col items-center">
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center mb-6"
            style={{ background: "var(--accent)" }}
          >
            <span className="text-white font-bold text-xl">S</span>
          </div>

          <h1 className="text-2xl font-semibold text-center mb-8">
            Create your account
          </h1>

          {error && (
            <div
              className="w-full text-sm px-4 py-2.5 rounded-md mb-4"
              style={{ background: "var(--error-subtle)", color: "var(--error)" }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="signup-email"
                className="text-xs font-medium"
                style={{ color: "var(--fg-secondary)" }}
              >
                Email
              </label>
              <input
                id="signup-email"
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
                htmlFor="signup-password"
                className="text-xs font-medium"
                style={{ color: "var(--fg-secondary)" }}
              >
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="t-input w-full rounded-md px-3 py-2 text-sm font-[family-name:var(--font-mono)] tracking-widest"
                placeholder="••••••••"
                required
                minLength={6}
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
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="text-xs mt-6" style={{ color: "var(--fg-secondary)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
