"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { setInsuranceReminders } from "@/lib/subInsurance";
import { FILE_KIND_CATEGORY, FILE_KIND_LABEL, type InviteFile, type OnboardingData } from "@/lib/onboarding";

export type Invite = {
  id: string;
  token: string;
  invitee_name: string | null;
  invitee_email: string | null;
  invitee_phone: string | null;
  status: "Sent" | "Submitted" | "Approved" | "Declined" | "Cancelled";
  expires_at: string;
  created_at: string;
  submitted_at: string | null;
  data: OnboardingData | null;
  files: InviteFile[] | null;
  signed_name: string | null;
  signed_at: string | null;
  agreement_pdf_path: string | null;
  subcontractor_id: string | null;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const linkFor = (token: string) => `${window.location.origin}/onboard/${token}`;

export default function OnboardingInvites({
  initial,
  onApproved,
}: {
  initial: Invite[];
  onApproved: (sub: any) => void;
}) {
  const supabase = createClient();
  const [invites, setInvites] = useState(initial);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", send: true });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<{ link: string; note: string } | null>(null);
  const [reviewing, setReviewing] = useState<Invite | null>(null);

  const pending = invites.filter((i) => i.status === "Sent" || i.status === "Submitted");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: "Link copied." });
    } catch {
      window.prompt("Copy this link:", text);
    }
  }

  async function createInvite() {
    setBusy("create");
    setMsg(null);
    const res = await fetch("/api/onboarding/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, send_email: form.send && !!form.email }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: j.error || "Could not create the link" });
    setInvites((prev) => [j.invite as Invite, ...prev]);
    setCreated({
      link: j.link,
      note:
        j.emailed === "sent"
          ? `Emailed to ${form.email}.`
          : j.emailed === "skipped"
            ? "Copy the link and send it to them by text or email."
            : `Link created, but the email didn't send (${j.emailed}). Copy the link and send it yourself.`,
    });
    setForm({ name: "", email: "", phone: "", send: true });
  }

  async function resend(i: Invite) {
    setBusy(i.id);
    const res = await fetch("/api/onboarding/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: i.id, send_email: true }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: j.error || "Could not resend" });
    setInvites((prev) => prev.map((x) => (x.id === i.id ? (j.invite as Invite) : x)));
    setMsg({
      ok: j.emailed === "sent",
      text: j.emailed === "sent" ? `Re-sent to ${i.invitee_email} and extended 14 days.` : i.invitee_email ? `Extended 14 days, but the email didn't send (${j.emailed}).` : "Extended 14 days. There's no email on this invite, so copy the link and send it yourself.",
    });
  }

  async function cancel(i: Invite) {
    if (!confirm("Cancel this link? It will stop working.")) return;
    const { error } = await supabase.from("subcontractor_invites").update({ status: "Cancelled" }).eq("id", i.id);
    if (error) return setMsg({ ok: false, text: error.message });
    setInvites((prev) => prev.filter((x) => x.id !== i.id));
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            setInviteOpen(true);
            setCreated(null);
            setMsg(null);
          }}
          className="rounded-lg border border-accent bg-white px-4 py-2 text-sm font-medium text-accent"
        >
          Invite new subcontractor (onboarding link)
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>

      {pending.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <p className="border-b border-[var(--border)] px-4 py-2 text-xs font-semibold uppercase text-[var(--muted)]">Onboarding</p>
          <ul>
            {pending.map((i) => {
              const expired = i.status === "Sent" && new Date(i.expires_at).getTime() < Date.now();
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-4 py-2.5 text-sm first:border-t-0">
                  <div className="min-w-[10rem] flex-1">
                    <p className="font-medium">{i.data?.company_name || i.invitee_name || i.invitee_email || i.invitee_phone || "New subcontractor"}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {i.status === "Submitted" ? `Submitted ${fmt(i.submitted_at)}` : expired ? "Link expired" : `Link sent ${fmt(i.created_at)} · waiting for them to fill it in`}
                    </p>
                  </div>
                  {i.status === "Submitted" ? (
                    <>
                      <span className="rounded-full bg-[#fff4d6] px-2 py-0.5 text-xs font-medium text-[#7a5a0f]">Needs review</span>
                      <button onClick={() => setReviewing(i)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">
                        Review
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => copy(linkFor(i.token))} className="text-xs text-accent underline">
                        Copy link
                      </button>
                      <button onClick={() => resend(i)} disabled={busy === i.id} className="text-xs text-accent underline">
                        {expired ? "Renew & resend" : "Resend"}
                      </button>
                      <button onClick={() => cancel(i)} className="text-xs text-red-700 underline">
                        Cancel
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--surface)] p-6">
            <h2 className="text-lg font-bold">Invite a new subcontractor</h2>
            {!created ? (
              <>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  They get a private link to fill in their details, upload ID, White Card and insurance, give banking details and sign the working agreement.
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block text-sm">
                    Name (optional)
                    <input className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label className="block text-sm">
                    Email
                    <input type="email" className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </label>
                  <label className="block text-sm">
                    Mobile (optional)
                    <input className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
                    Email the link to them now
                  </label>
                </div>
                {msg && !msg.ok && <p className="mt-3 text-sm text-red-700">{msg.text}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setInviteOpen(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
                    Cancel
                  </button>
                  <button onClick={createInvite} disabled={busy === "create"} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {busy === "create" ? "Creating..." : "Create link"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-green-700">{created.note}</p>
                <input readOnly value={created.link} onFocus={(e) => e.target.select()} className="mt-3 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs" />
                <p className="mt-2 text-xs text-[var(--muted)]">The link works once, for 14 days.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => copy(created.link)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
                    Copy link
                  </button>
                  <button onClick={() => setInviteOpen(false)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewModal
          invite={reviewing}
          onClose={() => setReviewing(null)}
          onDone={(sub) => {
            setInvites((prev) => prev.filter((x) => x.id !== reviewing.id));
            setReviewing(null);
            if (sub) {
              onApproved(sub);
              setMsg({ ok: true, text: `${sub.company_name || sub.name} added as a subcontractor.` });
            } else setMsg({ ok: true, text: "Application declined." });
          }}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-36 shrink-0 text-[var(--muted)]">{k}</span>
      <span className="min-w-0 break-words">{v || "—"}</span>
    </div>
  );
}

function ReviewModal({ invite, onClose, onDone }: { invite: Invite; onClose: () => void; onDone: (sub: any | null) => void }) {
  const supabase = createClient();
  const d = invite.data!;
  const files = invite.files ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [showBank, setShowBank] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agreementUrl, setAgreementUrl] = useState("");

  useEffect(() => {
    (async () => {
      const next: Record<string, string> = {};
      for (const f of files) {
        const { data } = await supabase.storage.from("attachments").createSignedUrl(f.path, 3600);
        if (data?.signedUrl) next[f.path] = data.signedUrl;
      }
      setUrls(next);
      if (invite.agreement_pdf_path) {
        const { data } = await supabase.storage.from("attachments").createSignedUrl(invite.agreement_pdf_path, 3600);
        if (data?.signedUrl) setAgreementUrl(data.signedUrl);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve() {
    setBusy(true);
    setErr("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const today = new Date().toISOString().slice(0, 10);
    const { data: sub, error } = await supabase
      .from("subcontractors")
      .insert({
        name: d.contact_name,
        company_name: d.company_name,
        trading_name: d.trading_name || null,
        address: d.address,
        postcode: d.postcode || null,
        phone: d.phone,
        email: d.email,
        abn: d.abn,
        gst_registered: d.gst_registered,
        active: true,
        commencement_date: today,
        whitecard_number: d.whitecard_number || null,
        insurance_insurer: d.insurance_insurer || null,
        insurance_policy: d.insurance_policy || null,
        insurance_cover: d.insurance_cover ? Number(d.insurance_cover) || null : null,
        insurance_expiry: d.insurance_expiry || null,
        bank_account_name: d.bank_account_name,
        bank_bsb: d.bank_bsb,
        bank_account_number: d.bank_account_number,
        agreement_signed_at: invite.signed_at,
      })
      .select()
      .single();
    if (error || !sub) {
      setBusy(false);
      return setErr((error?.message || "Could not create the subcontractor") + " (has migration 0030 been run?)");
    }

    const rows = files.map((f) => ({
      subcontractor_id: sub.id,
      category: FILE_KIND_CATEGORY[f.kind] || "Other document",
      storage_path: f.path,
      file_name: f.name,
      uploaded_by: user?.id ?? null,
    }));
    if (invite.agreement_pdf_path) {
      rows.push({
        subcontractor_id: sub.id,
        category: "Signed Agreement",
        storage_path: invite.agreement_pdf_path,
        file_name: "Signed working agreement.pdf",
        uploaded_by: user?.id ?? null,
      });
    }
    const { error: attErr } = await supabase.from("attachments").insert(rows);
    await supabase
      .from("subcontractor_invites")
      .update({ status: "Approved", reviewed_at: new Date().toISOString(), subcontractor_id: sub.id })
      .eq("id", invite.id);
    if (user && d.insurance_expiry) await setInsuranceReminders(supabase, sub, d.insurance_expiry, user.id);
    logAudit(supabase, { eventType: "create", entityType: "subcontractor", entityId: sub.id, entityLabel: sub.name, details: "Approved from onboarding link" });
    setBusy(false);
    if (attErr) alert(`Subcontractor created, but some documents didn't attach: ${attErr.message}`);
    onDone(sub);
  }

  async function decline() {
    if (!confirm("Decline this application? The subcontractor will not be added.")) return;
    setBusy(true);
    const { error } = await supabase
      .from("subcontractor_invites")
      .update({ status: "Declined", reviewed_at: new Date().toISOString() })
      .eq("id", invite.id);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone(null);
  }

  const maskedAcct = d.bank_account_number ? "•••• " + d.bank_account_number.slice(-3) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-lg font-bold">Review: {d.company_name}</h2>
          <p className="text-xs text-[var(--muted)]">Submitted {fmt(invite.submitted_at)}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Business</p>
          <Row k="Name" v={d.contact_name} />
          <Row k="Company" v={d.company_name} />
          <Row k="Trading name" v={d.trading_name} />
          <Row k="ABN" v={d.abn} />
          <Row k="GST registered" v={d.gst_registered ? "Yes" : "No"} />
          <Row k="Address" v={`${d.address}${d.postcode ? " " + d.postcode : ""}`} />
          <Row k="Mobile" v={d.phone} />
          <Row k="Email" v={d.email} />
          <Row k="White Card no." v={d.whitecard_number} />

          <p className="mt-4 text-xs font-semibold uppercase text-[var(--muted)]">Insurance</p>
          <Row k="Insurer" v={d.insurance_insurer} />
          <Row k="Policy no." v={d.insurance_policy} />
          <Row k="Cover" v={d.insurance_cover ? "$" + Number(d.insurance_cover).toLocaleString("en-AU") : ""} />
          <Row k="Expiry" v={d.insurance_expiry ? new Date(d.insurance_expiry + "T00:00:00").toLocaleDateString("en-AU") : ""} />

          <p className="mt-4 text-xs font-semibold uppercase text-[var(--muted)]">Banking</p>
          <Row k="Account name" v={d.bank_account_name} />
          <Row k="BSB" v={showBank ? d.bank_bsb : d.bank_bsb ? "•••-•••" : ""} />
          <Row k="Account no." v={showBank ? d.bank_account_number : maskedAcct} />
          <button onClick={() => setShowBank((v) => !v)} className="text-xs text-accent underline">
            {showBank ? "Hide bank details" : "Show bank details"}
          </button>

          <p className="mt-4 text-xs font-semibold uppercase text-[var(--muted)]">Documents</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {files.map((f) => {
              const isPdf = /\.pdf$/i.test(f.path);
              return (
                <a key={f.path} href={urls[f.path]} target="_blank" rel="noreferrer" className="block rounded-lg border border-[var(--border)] bg-white p-2 text-center text-xs">
                  {urls[f.path] && !isPdf ? (
                    <img src={urls[f.path]} alt={f.kind} className="h-24 w-full rounded object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded bg-[#f2f0ec] text-[var(--muted)]">{isPdf ? "PDF" : "Loading..."}</div>
                  )}
                  <span className="mt-1 block">{FILE_KIND_LABEL[f.kind] || f.kind}</span>
                </a>
              );
            })}
          </div>

          <p className="mt-4 text-xs font-semibold uppercase text-[var(--muted)]">Working agreement</p>
          <Row k="Signed by" v={invite.signed_name} />
          <Row k="Signed at" v={fmt(invite.signed_at)} />
          {agreementUrl ? (
            <a href={agreementUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
              Open signed agreement (PDF)
            </a>
          ) : (
            <p className="text-xs text-[var(--muted)]">{invite.agreement_pdf_path ? "Loading..." : "PDF could not be generated, but the signature is recorded."}</p>
          )}
        </div>
        {err && <p className="px-6 pb-2 text-sm text-red-700">{err}</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] px-6 py-4">
          <button onClick={decline} disabled={busy} className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700">
            Decline
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
              Close
            </button>
            <button onClick={approve} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {busy ? "Working..." : "Approve & add subcontractor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
