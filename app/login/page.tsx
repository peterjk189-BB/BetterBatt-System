"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      logAudit(supabase, { eventType: "login", entityType: "auth", entityLabel: email });
      router.push("/dashboard");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setInfo(
        "Account created. If email confirmation is on for this project, check your inbox before signing in."
      );
      setMode("signin");
    }
  }

  const [showPw, setShowPw] = useState(false);
  const field =
    "w-full rounded-lg border border-[#45433e] bg-[#2a2926] px-3.5 py-2.5 text-[15px] text-[#f4f2ec] placeholder-[#8a877f] outline-none transition focus:border-[#fdb930] focus:ring-2 focus:ring-[#fdb930]/30";

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #34302a 0%, #1b1a18 55%, #121211 100%)" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Better Batt Insulation" className="h-16 w-auto rounded-xl bg-white p-2 shadow-lg" />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#fdb930]">Better Batt Insulation</p>
          <p className="mt-1 text-sm text-[#a9a69d]">Job management system</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#3a3833] bg-[#201f1c] shadow-2xl">
          <div className="h-1 bg-[#fdb930]" />
          <div className="p-7">
            <h1 className="text-xl font-bold text-[#f4f2ec]">{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
            <p className="mt-1 text-sm text-[#a9a69d]">
              {mode === "signin" ? "Sign in to see your jobs and schedule." : "Enter your details to request access."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              {mode === "signup" && (
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
                  Full name
                  <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
                </label>
              )}

              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
                Email
                <input
                  type="email"
                  className={field}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@betterbattinsulation.com.au"
                  required
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
                Password
                <span className="relative block">
                  <input
                    type={showPw ? "text" : "password"}
                    className={`${field} pr-16`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-[#a9a69d] hover:text-[#fdb930]"
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </span>
              </label>

              {error && <p className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
              {info && <p className="rounded-lg border border-green-900/60 bg-green-950/50 px-3 py-2 text-sm text-green-300">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-lg bg-[#fdb930] px-4 py-3 text-[15px] font-bold text-[#1b1a18] transition hover:bg-[#ffc84d] disabled:opacity-60"
              >
                {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
              </button>
            </form>

            <button
              className="mt-5 w-full text-center text-sm text-[#a9a69d] hover:text-[#fdb930]"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
              }}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#7c7a72]">
          Better Batt Insulation · Melbourne, Victoria
          <br />
          betterbattinsulation.com.au
        </p>
      </div>
    </main>
  );
}
