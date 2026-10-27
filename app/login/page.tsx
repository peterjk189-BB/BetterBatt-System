"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
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

    if (mode === "forgot") {
      try {
        const r = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const j = await r.json().catch(() => ({}));
        setLoading(false);
        if (!r.ok) return setError(j.error || "Couldn't send the email. Please try again.");
        setInfo("If that email has an account, we've sent a link to choose a new password. It can take a minute to arrive, so check your junk folder too.");
      } catch {
        setLoading(false);
        setError("Couldn't send the email. Please try again.");
      }
      return;
    }

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
          <img src="/logo.png" alt="Better Batt Insulation" className="h-16 w-auto rounded-xl p-2 shadow-lg" style={{ backgroundColor: "#ffffff" }} />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#fdb930]">Better Batt Insulation</p>
          <p className="mt-1 text-sm text-[#a9a69d]">Job management system</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#3a3833] shadow-2xl" style={{ backgroundColor: "#21201d" }}>
          <div className="h-1 bg-[#fdb930]" />
          <div className="p-7">
            <h1 className="text-xl font-bold text-[#f4f2ec]">{mode === "signin" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Create an account"}</h1>
            <p className="mt-1 text-sm text-[#a9a69d]">
              {mode === "signin" ? "Sign in to see your jobs and schedule." : mode === "forgot" ? "Enter your email and we'll send you a link to choose a new password." : "Enter your details to request access."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              {mode === "signup" && (
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
                  Full name
                  <input className={field} style={{ backgroundColor: "#2a2926", color: "#f4f2ec" }} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
                </label>
              )}

              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
                Email
                <input
                  type="email"
                  className={field} style={{ backgroundColor: "#2a2926", color: "#f4f2ec" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@betterbattinsulation.com.au"
                  required
                />
              </label>

              {mode !== "forgot" && (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
                Password
                <span className="relative block">
                  <input
                    type={showPw ? "text" : "password"}
                    className={`${field} pr-16`}
                    style={{ backgroundColor: "#2a2926", color: "#f4f2ec" }}
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
              )}

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setInfo(null);
                  }}
                  className="-mt-2 self-end text-xs font-medium text-[#a9a69d] hover:text-[#fdb930]"
                >
                  Forgot password?
                </button>
              )}

              {error && <p className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
              {info && <p className="rounded-lg border border-green-900/60 bg-green-950/50 px-3 py-2 text-sm text-green-300">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-lg bg-[#fdb930] px-4 py-3 text-[15px] font-bold text-[#1b1a18] transition hover:bg-[#ffc84d] disabled:opacity-60"
              >
                {loading ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Sign up"}
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
              {mode === "signin" ? "Need an account? Sign up" : mode === "forgot" ? "Back to sign in" : "Already have an account? Sign in"}
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
