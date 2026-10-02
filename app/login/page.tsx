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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">Better Batt System</p>
        <h1 className="mt-1 text-2xl font-bold">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <label className="flex flex-col gap-1 text-sm">
            Full name
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-700">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      <button
        className="text-sm text-[var(--muted)] underline"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setInfo(null);
        }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
