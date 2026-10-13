"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Tables whose changes should show up on the Calendar straight away, whoever made them.
const TABLES = ["site_visits", "inspections", "work_orders", "work_order_lines", "purchase_orders"];

/**
 * Keeps the Calendar up to date without a manual refresh:
 *  - live: refreshes within a second when anyone adds/changes a site visit, inspection, job or PO
 *    (needs the tables switched on for Realtime - migration 0036);
 *  - backup: also refreshes when you come back to the tab and every 60 seconds while it's open,
 *    so it still stays current if the live feed isn't available.
 * Scroll position and the week you're looking at are kept.
 */
export default function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function refreshSoon() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    }

    let channel = supabase.channel("calendar-live");
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshSoon);
    }
    channel.subscribe();

    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60000);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
