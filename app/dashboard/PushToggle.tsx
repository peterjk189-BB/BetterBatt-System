"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

/** Header button: turn push notifications on/off for this device. */
export default function PushToggle() {
  const supabase = createClient();
  const [state, setState] = useState<State>("loading");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      // iPhones/iPads only offer push once the app has been added to the Home Screen.
      return setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
    }
    if (Notification.permission === "denied") return setState("blocked");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    if (!publicKey) return setNote("Push isn't set up on the server yet.");
    setBusy(true);
    setNote("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Could not read the subscription");
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" }
      );
      if (error) throw new Error(error.message + " (has migration 0035 been run?)");
      setState("on");
      setNote("Notifications are on for this device.");
      fetch("/api/push/test", { method: "POST" }).catch(() => {});
    } catch (e: any) {
      setNote(e?.message || "Could not turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setNote("");
    } catch (e: any) {
      setNote(e?.message || "Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  const label =
    state === "on" ? "Notifications on" : state === "blocked" ? "Notifications blocked" : state === "needs-install" ? "Get notifications" : "Turn on notifications";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (state === "on") return disable();
          if (state === "off") return enable();
          setNote(
            state === "needs-install"
              ? "On an iPhone or iPad: tap the Share button in Safari, choose Add to Home Screen, then open Better Batt from the new icon and tap this button again."
              : state === "blocked"
              ? "Notifications are blocked for this site. Allow them in the browser or device settings, then reload."
              : "This browser doesn't support push notifications."
          );
        }}
        title={label}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
          state === "on" ? "border-green-400 bg-green-50 text-green-800" : "border-[var(--border)] text-[var(--muted)] hover:bg-white"
        }`}
      >
        <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
          <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2m6-6V11c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1z" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
      </button>
      {note && (
        <div
          role="status"
          onClick={() => setNote("")}
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-snug text-[var(--text)] shadow-lg"
        >
          {note}
        </div>
      )}
    </div>
  );
}
