"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The invite/reset link puts an access token in the URL hash — the
    // Supabase client picks it up and establishes a session automatically
    // on load. Give that a moment, then check.
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        setHasSession(true);
        setChecking(false);
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasSession(true);
        setChecking(false);
      }
    });

    check();
    const timeout = setTimeout(() => {
      if (!cancelled) setChecking(false);
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">Better Batt System</p>
        <h1 className="mt-1 text-2xl font-bold">Set your password</h1>
      </div>

      {checking && <p className="text-sm text-[var(--muted)]">Checking your invite link...</p>}

      {!checking && !hasSession && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This link has expired or was already used. Ask whoever set up your account to send a new invite, or{" "}
          <a href="/login" className="underline">
            sign in
          </a>{" "}
          if you've already got a password.
        </div>
      )}

      {!checking && hasSession && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            You&rsquo;re verified — choose a password to finish setting up your account.
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <label className="flex flex-col gap-1 text-sm">
            New password
            <input
              type="password"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Confirm password
            <input
              type="password"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Set password & continue"}
          </button>
        </form>
      )}
    </main>
  );
}
