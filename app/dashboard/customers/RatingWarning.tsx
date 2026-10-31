"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GRADE_COLOR, GRADE_RULE, loadRating, type Grade } from "@/lib/builderRating";

/** Red/amber banner shown on a quote for a C or D builder. Quiet (renders nothing) for everyone else or if notes/invoices can't be read. */
export default function RatingWarning({ customerId, override, enabled }: { customerId: string; override?: string | null; enabled: boolean }) {
  const [g, setG] = useState<Grade | null>(null);
  const [overdue, setOverdue] = useState(0);
  useEffect(() => {
    setG(null);
    if (!enabled || !customerId) return;
    let live = true;
    (async () => {
      try {
        const res = await loadRating(createClient(), customerId, override ?? null);
        if (!live) return;
        setG(res.result.grade);
        setOverdue(res.result.overdueBalance);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      live = false;
    };
  }, [customerId, override, enabled]);
  if (g !== "C" && g !== "D") return null;
  return (
    <div className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: GRADE_COLOR[g] }}>
      <p className="font-semibold" style={{ color: GRADE_COLOR[g] }}>
        ⚠ Grade {g} builder: {g === "D" ? "do not book without approval." : "payments are running late."}
      </p>
      <p>
        {GRADE_RULE[g]}
        {overdue > 0 ? ` Overdue now: ${overdue.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })}.` : ""} See the customer's Rating tab for the notes.
      </p>
    </div>
  );
}
