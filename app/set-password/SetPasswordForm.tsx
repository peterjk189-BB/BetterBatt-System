"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EmailOtpType = "invite" | "recovery" | "email" | "signup" | "email_change";

export default function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const tokenHash = searchParams.get("token_hash");
  const otpType = (searchParams.get("type") as EmailOtpType) || "invite";

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Already has a session (e.g. the older hash-fragment style link, or
      // already confirmed)? Just go straight to the password form.
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        setHasSession(true);
        setChecking(false);
        return;
      }

      // Newer-style link: a token_hash in the query string. We deliberately
      // DON'T verify it automatically on page load — some email providers
      // (notably Outlook/Hotmail) pre-fetch links to scan them for safety,
      // which would silently burn this single-use token before the person
      // ever sees the page. Instead we wait for them to click a button.
      if (!cancelled && tokenHash) {
        setNeedsConfirm(true);
        setChecking(false);
        return;
      }

      if (!cancelled) setChecking(false);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasSession(true);
        setNeedsConfirm(false);
        setChecking(false);
      }
    });

    check();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenHash]);

  async function confirmInvite() {
    if (!tokenHash) return;
    setConfirming(true);
    setConfirmError(null);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    setConfirming(false);
    if (error) {
      setConfirmError(error.message);
      return;
    }
    setHasSession(true);
    setNeedsConfirm(false);
  }

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

      {!checking && needsConfirm && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            Click below to confirm it&rsquo;s really you, then you&rsquo;ll be able to set a password.
          </p>
          {confirmError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{confirmError}</p>
          )}
          <button
            onClick={confirmInvite}
            disabled={confirming}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {confirming ? "Confirming..." : "Confirm & continue"}
          </button>
        </div>
      )}

      {!checking && !needsConfirm && !hasSession && (
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
