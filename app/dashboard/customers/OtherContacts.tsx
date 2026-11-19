"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CallLink from "../CallLink";

type Contact = { id: string; name: string; role: string | null; phone: string | null; email: string | null };

const ROLES = ["Supervisor", "Site Manager", "Project Manager", "Estimator", "Foreman", "Owner"];

export default function OtherContacts({ customerId }: { customerId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Contact[]>([]);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState({ name: "", role: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("customer_contacts")
      .select("id, name, role, phone, email")
      .eq("customer_id", customerId)
      .order("created_at")
      .then(({ data, error }: any) => {
        if (error) setMissing(true);
        else setRows(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function add() {
    if (!draft.name.trim() && !draft.phone.trim() && !draft.email.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("customer_contacts")
      .insert({ customer_id: customerId, name: draft.name.trim(), role: draft.role.trim() || null, phone: draft.phone.trim() || null, email: draft.email.trim() || null })
      .select("id, name, role, phone, email")
      .single();
    setBusy(false);
    if (error) return alert(error.message);
    setRows((r) => [...r, data as Contact]);
    setDraft({ name: "", role: "", phone: "", email: "" });
  }

  async function saveField(id: string, patch: Partial<Contact>) {
    const { error } = await supabase.from("customer_contacts").update(patch).eq("id", id);
    if (error) alert(error.message);
  }

  async function remove(id: string) {
    if (!confirm("Remove this contact?")) return;
    const { error } = await supabase.from("customer_contacts").delete().eq("id", id);
    if (error) return alert(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  const inp = "rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm w-full";

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Other contacts</h3>
      <p className="mb-3 mt-1 text-xs text-[var(--muted)]">Supervisors, site managers and anyone else we deal with at this customer.</p>
      {missing ? (
        <p className="text-sm text-[var(--muted)]">Run migration 0101 in Supabase to turn this on.</p>
      ) : (
        <>
          <datalist id="contact-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          <div className="space-y-2">
            {rows.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-center gap-2">
                {(["name", "role", "phone", "email"] as const).map((f) => (
                  <input
                    key={f}
                    list={f === "role" ? "contact-roles" : undefined}
                    placeholder={f[0].toUpperCase() + f.slice(1)}
                    className={inp}
                    value={c[f] ?? ""}
                    onChange={(e) => setRows((r) => r.map((x) => (x.id === c.id ? { ...x, [f]: e.target.value } : x)))}
                    onBlur={(e) => saveField(c.id, { [f]: f === "name" ? e.target.value.trim() : e.target.value.trim() || null })}
                  />
                ))}
                <span className="flex items-center gap-2">
                  <CallLink phone={c.phone} />
                  <button type="button" onClick={() => remove(c.id)} className="text-sm text-red-600" title="Remove">✕</button>
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-center gap-2">
              <input placeholder="Name" className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input placeholder="Role e.g. Supervisor" list="contact-roles" className={inp} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
              <input placeholder="Phone" className={inp} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              <input placeholder="Email" type="email" className={inp} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              <button type="button" onClick={add} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">Add</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
