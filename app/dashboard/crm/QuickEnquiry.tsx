"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SOURCES, digits, staffName, todayISO, type Staff } from "@/lib/crm";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

type Match = { kind: "lead" | "customer"; id: string; name: string; detail: string };

// Floating "+ Enquiry" button available on every dashboard page: log a call
// or email in about ten seconds. Creates the lead, a call-back task, and
// warns if the phone number already belongs to a customer or open lead.
export default function QuickEnquiry({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [suburb, setSuburb] = useState("");
  const [source, setSource] = useState<string>("Call");
  const [note, setNote] = useState("");
  const [owner, setOwner] = useState(userId);
  const [callBack, setCallBack] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || staff.length > 0) return;
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["admin", "office"])
      .order("full_name")
      .then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, [open, staff.length, supabase]);

  // Duplicate check on the phone number once there are enough digits.
  useEffect(() => {
    const d = digits(phone);
    if (d.length < 8) {
      setMatches([]);
      return;
    }
    const tail = d.slice(-8);
    let cancelled = false;
    (async () => {
      const [{ data: leads }, { data: customers }] = await Promise.all([
        supabase.from("crm_leads").select("id, name, stage, phone").eq("archived", false).ilike("phone", `%${tail.slice(-4)}%`).limit(20),
        supabase.from("customers").select("id, name, contact_phone").eq("archived", false).ilike("contact_phone", `%${tail.slice(-4)}%`).limit(20),
      ]);
      if (cancelled) return;
      const out: Match[] = [];
      for (const l of (leads ?? []) as any[]) if (digits(l.phone).endsWith(tail)) out.push({ kind: "lead", id: l.id, name: l.name, detail: `Enquiry · ${l.stage}` });
      for (const c of (customers ?? []) as any[]) if (digits(c.contact_phone).endsWith(tail)) out.push({ kind: "customer", id: c.id, name: c.name, detail: "Existing customer" });
      setMatches(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [phone, supabase]);

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setSuburb("");
    setSource("Call");
    setNote("");
    setOwner(userId);
    setCallBack(true);
    setMatches([]);
    setError(null);
    setSavedId(null);
  }

  async function save() {
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const existingCustomer = matches.find((m) => m.kind === "customer");
    const { data, error: err } = await supabase
      .from("crm_leads")
      .insert({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        suburb: suburb.trim() || null,
        source: existingCustomer && source === "Call" ? "Repeat customer" : source,
        enquiry_note: note.trim() || null,
        owner_id: owner,
        customer_id: existingCustomer?.id ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (err || !data) {
      setSaving(false);
      setError(err?.message || "Could not save the enquiry.");
      return;
    }
    if (callBack) {
      await supabase.from("crm_tasks").insert({
        title: `Call back — ${name.trim()}`,
        kind: "Call",
        due_date: todayISO(),
        assigned_to: owner,
        lead_id: data.id,
        customer_id: existingCustomer?.id ?? null,
        auto: true,
        created_by: userId,
      });
    }
    if (existingCustomer) {
      await supabase.from("customers").update({ last_contact_at: new Date().toISOString() }).eq("id", existingCustomer.id);
    }
    setSaving(false);
    setSavedId(data.id);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-[var(--brand-gold)] px-5 py-3 text-sm font-bold text-[#201f1c] shadow-lg hover:brightness-95 print:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        + Enquiry
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 print:hidden" onClick={() => setOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {savedId ? (
              <div className="text-center">
                <h2 className="text-lg font-bold">Enquiry logged</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {name} is on the pipeline{callBack ? ` and a call-back task is set for ${staffName(staff, owner) === "Unassigned" ? "you" : staffName(staff, owner)}` : ""}.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Link href={`/dashboard/crm/leads/${savedId}`} onClick={() => setOpen(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">
                    Open enquiry
                  </Link>
                  <button
                    onClick={reset}
                    className="rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-[#201f1c]"
                  >
                    Log another
                  </button>
                  <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-[var(--muted)]">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">New enquiry</h2>
                  <button onClick={() => setOpen(false)} className="text-sm text-[var(--muted)]">
                    Cancel
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSource(s)}
                      className={`rounded-full border px-3 py-1 text-sm ${source === s ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)] text-[var(--muted)]"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <input className={`${inputCls} col-span-2`} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <input className={inputCls} placeholder="Phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <input className={inputCls} placeholder="Suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
                  <input className={`${inputCls} col-span-2`} placeholder="Email (optional)" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <textarea className={`${inputCls} col-span-2`} rows={3} placeholder="What do they need? e.g. Ceiling batts, double storey, wants a quote" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>

                {matches.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-3 py-2 text-sm text-[#5c440b]">
                    <strong>This number is already in the system:</strong>
                    {matches.map((m) => (
                      <div key={m.kind + m.id}>
                        <Link
                          href={m.kind === "lead" ? `/dashboard/crm/leads/${m.id}` : `/dashboard/crm/accounts/${m.id}`}
                          onClick={() => setOpen(false)}
                          className="font-medium underline"
                        >
                          {m.name}
                        </Link>{" "}
                        <span className="opacity-80">— {m.detail}</span>
                      </div>
                    ))}
                    {matches.some((m) => m.kind === "customer") && <div className="mt-1 text-xs">Saving will link this enquiry to the existing customer.</div>}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    Owner
                    <select className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
                      {(staff.length ? staff : [{ id: userId, full_name: "Me" }]).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id === userId ? "Me" : s.full_name || "Unnamed user"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[#b1841f]" checked={callBack} onChange={(e) => setCallBack(e.target.checked)} />
                    Create a call-back task for today
                  </label>
                </div>

                {error && <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

                <button
                  onClick={save}
                  disabled={saving}
                  className="mt-4 w-full rounded-lg bg-[var(--brand-gold)] px-4 py-3 text-sm font-bold text-[#201f1c] disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save enquiry"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
