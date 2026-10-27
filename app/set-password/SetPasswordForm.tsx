"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import AuthShell, { authButton, authField } from "../AuthShell";

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
    logAudit(supabase, { eventType: "login", entityType: "auth", entityLabel: "Password set (invite or reset link)" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell title="Choose your password" subtitle="Pick a password you'll use to sign in to the Better Batt System.">
      {checking && <p className="mt-5 text-sm text-[#a9a69d]">Checking your link...</p>}

      {!checking && needsConfirm && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="text-sm text-[#a9a69d]">Click below to confirm it&rsquo;s really you, then you&rsquo;ll be able to set a password.</p>
          {confirmError && <p className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-300">{confirmError}</p>}
          <button onClick={confirmInvite} disabled={confirming} className={authButton}>
            {confirming ? "Confirming..." : "Confirm & continue"}
          </button>
        </div>
      )}

      {!checking && !needsConfirm && !hasSession && (
        <div className="mt-5 rounded-lg border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          This link has expired or was already used. Go back to{" "}
          <a href="/login" className="font-semibold underline">
            sign in
          </a>{" "}
          and use &ldquo;Forgot password?&rdquo; to get a new one.
        </div>
      )}

      {!checking && hasSession && (
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {error && <p className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
            New password
            <input type="password" className={authField} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
            <span className="text-xs font-normal text-[#8a877f]">At least 8 characters.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[#d8d5cc]">
            Confirm password
            <input type="password" className={authField} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} />
          </label>
          <button type="submit" disabled={saving} className={authButton}>
            {saving ? "Saving..." : "Save password & continue"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
