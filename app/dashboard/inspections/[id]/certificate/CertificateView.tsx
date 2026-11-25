"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { certificateNumber, type CertRow, type SavedCertificate } from "@/lib/certificate";
import { elementToPdfBase64, pdfFileName } from "@/lib/elementToPdf";
import { certDeliveryBadge, certDeliveryProblem, certSentLine, setCertSentByHand, type CertSent } from "@/lib/certificateSent";

// Certificate of Insulation Installation — design A from the certificate
// examples: framed A4 page, logo, certifying statement, customer / address /
// date installed, product table (area, product, R-value), signature.
// On screen the office can adjust the product rows and the issue date and
// save them; printing hides all the editing controls.

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtLong(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

const label = "text-[11px] font-semibold uppercase tracking-[1.5px] text-[#5f6062]";
const value = "border-b border-[#c9c5bb] pb-1 text-[16px] font-semibold";

export default function CertificateView({
  inspection,
  woNumber,
  installedOn,
  derivedRows,
  saved,
  company,
  customer,
  recipients,
}: {
  inspection: {
    id: string;
    inspection_number: number;
    inspection_date: string;
    result: string | null;
    builder_name: string | null;
    site_address: string | null;
    suburb: string | null;
    inspector_name: string | null;
    inspector_signature: string | null;
    signed_at: string | null;
    certificate_sent_at?: string | null;
    certificate_sent_to?: string | null;
    certificate_sent_by?: string | null;
    certificate_delivery?: string | null;
    certificate_delivery_at?: string | null;
  };
  woNumber: string | null;
  installedOn: string;
  derivedRows: CertRow[];
  saved: SavedCertificate | null;
  company: { abn: string | null; phone: string | null };
  customer: { id: string; name: string; contact_email: string | null } | null;
  recipients: { label: string; email: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<CertRow[]>(saved?.rows ?? derivedRows);
  const [issuedOn, setIssuedOn] = useState<string>(saved?.issued_on || todayLocal());
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<CertSent>({
    certificate_sent_at: inspection.certificate_sent_at ?? null,
    certificate_sent_to: inspection.certificate_sent_to ?? null,
    certificate_sent_by: inspection.certificate_sent_by ?? null,
    certificate_delivery: inspection.certificate_delivery ?? null,
    certificate_delivery_at: inspection.certificate_delivery_at ?? null,
  });
  const sentAt = sent.certificate_sent_at ?? null;
  const deliveryBadge = certDeliveryBadge(sent);
  const certRef = useRef<HTMLDivElement>(null);

  // Email the certificate: a pop-up opens first so the address can be checked, changed or added.
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [saveToCustomer, setSaveToCustomer] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailDone, setEmailDone] = useState<string | null>(null);
  const known = recipients.map((r) => r.email.trim().toLowerCase());
  const typed = emailTo.split(/[;,\s]+/).filter(Boolean);
  const isNewAddress = typed.length === 1 && /^\S+@\S+\.\S+$/.test(typed[0]) && !known.includes(typed[0].toLowerCase());

  function openEmail() {
    setEmailTo(recipients[0]?.email || "");
    setEmailNote("");
    setSaveToCustomer(!!customer && !customer.contact_email);
    setEmailErr(null);
    setEmailDone(null);
    setEmailOpen(true);
  }

  async function sendEmail() {
    if (!emailTo.trim()) return setEmailErr("Enter an email address.");
    if (status === "dirty" && !confirm("You have unsaved changes to the certificate. Email it as it shows now?")) return;
    setEmailBusy(true);
    setEmailErr(null);
    // Capture the certificate without the on-screen editing controls.
    const wasEditing = editing;
    if (wasEditing) setEditing(false);
    await new Promise((r) => setTimeout(r, 150));
    try {
      if (!certRef.current) throw new Error("Certificate not ready");
      const pdf = await elementToPdfBase64(certRef.current, "portrait");
      const res = await fetch("/api/certificates/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_id: inspection.id,
          to: emailTo,
          note: emailNote,
          pdf,
          filename: pdfFileName(`Insulation Certificate ${certNo}`, address),
          save_to_customer: saveToCustomer && isNewAddress && !!customer,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      setSent(
        j.detailsSaved
          ? { certificate_sent_at: j.sent_at, certificate_sent_to: j.to, certificate_sent_by: j.sent_by || null, certificate_delivery: "sent", certificate_delivery_at: null }
          : { certificate_sent_at: j.sent_at || new Date().toISOString() }
      );
      setEmailDone(`Sent to ${j.to}.${j.saved ? " The address was saved to the customer." : ""}`);
      setEmailOpen(false);
    } catch (e: any) {
      setEmailErr(`Not sent: ${e?.message || e}`);
    }
    if (wasEditing) setEditing(true);
    setEmailBusy(false);
  }

  async function markSent(sent: boolean) {
    setError(null);
    const { error: upErr, value: v } = await setCertSentByHand(supabase, inspection.id, sent);
    if (upErr) {
      setError(/certificate_sent_at/.test(upErr.message) ? "Run migration 0092 in Supabase first (certificate sent date), then try again." : upErr.message);
      return;
    }
    setSent({ certificate_sent_at: v, certificate_sent_to: null, certificate_sent_by: null, certificate_delivery: null, certificate_delivery_at: null });
    logAudit(supabase, { eventType: "update", entityType: "Inspection", entityId: inspection.id, entityLabel: certificateNumber(inspection.inspection_number), details: sent ? "Certificate marked as sent" : "Certificate sent mark removed" });
  }

  const certNo = certificateNumber(inspection.inspection_number);
  const address = [inspection.site_address, inspection.suburb].filter(Boolean).join(", ");
  const passed = inspection.result === "PASS";

  function changeRow(i: number, patch: Partial<CertRow>) {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
    setStatus("dirty");
  }

  async function save() {
    setStatus("saving");
    setError(null);
    const certificate: SavedCertificate = {
      rows: rows.filter((r) => r.area.trim() || r.product.trim() || r.r_value.trim()),
      issued_on: issuedOn,
      saved_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase.from("inspections").update({ certificate }).eq("id", inspection.id);
    if (upErr) {
      setStatus("error");
      setError(
        /certificate/.test(upErr.message)
          ? "The database needs the certificate update first — run migration 0024 in Supabase, then save again."
          : upErr.message
      );
      return;
    }
    setStatus("saved");
    logAudit(supabase, { eventType: "update", entityType: "Inspection", entityId: inspection.id, entityLabel: certNo, details: "Insulation certificate saved" });
  }

  return (
    <div>
      <style>{`@page { size: A4; margin: 0; } @media print { body { background: #fff !important; } main { padding: 0 !important; } }`}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/dashboard/inspections/${inspection.id}`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
        >
          &larr; Back to inspection
        </Link>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            editing ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)] hover:border-[var(--brand-gold-dark)]"
          }`}
        >
          {editing ? "Done editing" : "Edit products & date"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)] disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save certificate"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRows(derivedRows);
            setStatus("dirty");
          }}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
          title="Rebuild the product rows from the work order (then press Save certificate)"
        >
          Refresh from work order
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[var(--brand-gold)] px-5 py-2 text-sm font-semibold text-[#201f1c]"
        >
          Print / Save as PDF
        </button>
        <button
          type="button"
          onClick={openEmail}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
        >
          Email certificate
        </button>
        {sentAt ? (
          <button type="button" onClick={() => markSent(false)} className="rounded-lg border border-green-600 bg-green-50 px-4 py-2 text-sm font-medium text-green-800" title="Click to undo">
            ✓ Sent {new Date(sentAt).toLocaleDateString("en-AU")}
          </button>
        ) : (
          <button type="button" onClick={() => markSent(true)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]">
            Mark certificate sent
          </button>
        )}
        <span className={`text-sm ${status === "error" ? "text-red-700" : status === "dirty" ? "text-[var(--brand-gold-dark)]" : "text-[var(--muted)]"}`}>
          {status === "saved"
            ? "Saved."
            : status === "dirty"
            ? "Unsaved changes"
            : saved
            ? `Saved ${new Date(saved.saved_at).toLocaleDateString("en-AU")}`
            : "Filled in from the work order — check the products, then save"}
        </span>
      </div>

      {!passed && (
        <div className="mb-4 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-4 py-2.5 text-sm text-[#5c440b] print:hidden">
          This inspection hasn&apos;t been marked PASS{inspection.result ? ` (result: ${inspection.result})` : ""}. Certificates are normally issued once the job has passed.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 print:hidden">{error}</div>}
      {emailDone && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900 print:hidden">{emailDone}</div>}
      {sentAt && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-sm print:hidden ${
            certDeliveryProblem(sent.certificate_delivery) ? "border-red-300 bg-red-50 text-red-900" : "border-[var(--border)] bg-[var(--surface)]"
          }`}
        >
          <span>{certSentLine(sent)}</span>
          {deliveryBadge && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${deliveryBadge.cls}`}>
              {deliveryBadge.text}
              {sent.certificate_delivery_at && sent.certificate_delivery !== "sent" ? ` ${new Date(sent.certificate_delivery_at).toLocaleDateString("en-AU")}` : ""}
            </span>
          )}
          {certDeliveryProblem(sent.certificate_delivery) && <span className="font-medium">The customer didn&apos;t get it. Check the address and press Email certificate again.</span>}
        </div>
      )}

      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Email certificate {certNo}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {customer ? customer.name : inspection.builder_name || "Customer"}
              {address ? ` · ${address}` : ""}
            </p>

            {recipients.length > 0 ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Emails on file</div>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {recipients.map((r) => {
                    const on = typed.some((t) => t.toLowerCase() === r.email.toLowerCase());
                    return (
                      <label key={r.email} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-[var(--brand-gold-dark)] bg-[#fff8e6]" : "border-[var(--border)]"}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const rest = typed.filter((t) => t.toLowerCase() !== r.email.toLowerCase());
                            setEmailTo((on ? rest : [...typed, r.email]).join(", "));
                          }}
                        />
                        <span className="font-medium">{r.email}</span>
                        <span className="text-xs text-[var(--muted)]">{r.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-3 py-2 text-sm text-[#5c440b]">
                {customer ? "There's no email on file for this customer yet. Type one below." : "This inspection isn't linked to a customer, so there's no email on file. Type one below."}
              </div>
            )}

            <label className="mt-4 block text-sm font-medium">
              Send to
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="name@example.com"
                autoFocus
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">Change or add an address here. Separate more than one with a comma.</span>
            </label>
            {customer && isNewAddress && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={saveToCustomer} onChange={(e) => setSaveToCustomer(e.target.checked)} />
                Save {typed[0]} as {customer.name}&apos;s email{customer.contact_email ? ` (replaces ${customer.contact_email})` : ""}
              </label>
            )}

            <label className="mt-4 block text-sm font-medium">
              Message (optional)
              <textarea
                value={emailNote}
                onChange={(e) => setEmailNote(e.target.value)}
                rows={3}
                placeholder="Added to the email above the standard wording"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>

            {emailErr && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{emailErr}</div>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEmailOpen(false)} disabled={emailBusy} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">
                Cancel
              </button>
              <button type="button" onClick={sendEmail} disabled={emailBusy || !emailTo.trim()} className="rounded-lg bg-[var(--brand-gold)] px-5 py-2 text-sm font-semibold text-[#201f1c] disabled:opacity-60">
                {emailBusy ? "Sending…" : "Send certificate"}
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">The certificate is attached as a PDF and marked as sent.</p>
          </div>
        </div>
      )}
      {(!company.abn || !company.phone) && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--muted)] print:hidden">
          Your ABN and phone number print in the header. Add them once on the{" "}
          <Link href="/dashboard/settings" className="font-medium text-accent hover:underline">
            Settings
          </Link>{" "}
          page.
        </div>
      )}

      {/* The certificate — one A4 page (a long product list runs onto a second) */}
      <div
        ref={certRef}
        className="mx-auto bg-white shadow-sm print:shadow-none"
        style={{ width: "210mm", minHeight: "296mm", boxSizing: "border-box", padding: 36, fontFamily: "'Barlow', system-ui, sans-serif", color: "#201f1c" }}
      >
        <div style={{ minHeight: "calc(296mm - 72px)", boxSizing: "border-box", border: "3px solid #201f1c", padding: 8, display: "flex" }}>
          <div
            style={{ flex: 1, boxSizing: "border-box", border: "1.5px solid #fdb930", padding: "40px 52px", display: "flex", flexDirection: "column" }}
          >
            <div className="flex flex-col items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Better Batt Insulation" style={{ height: 92, width: "auto" }} />
              <div style={{ fontSize: 13, color: "#5f6062", letterSpacing: 0.5, textAlign: "center" }}>
                {[company.abn ? `ABN ${company.abn}` : null, "Melbourne VIC", "betterbattinsulation.com.au", company.phone].filter(Boolean).join(" · ")}
              </div>
            </div>

            <div className="mt-7 text-center">
              <div
                style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 16, letterSpacing: 6, color: "#7a5a0f", textTransform: "uppercase" }}
              >
                Certificate of
              </div>
              <h1
                style={{
                  margin: "4px 0 0",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: 46,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  lineHeight: 1.05,
                }}
              >
                Insulation Installation
              </h1>
              <div style={{ margin: "16px auto 0", width: 120, height: 3, background: "#fdb930" }} />
            </div>

            <p style={{ margin: "26px 0 0", textAlign: "center", fontSize: 15, lineHeight: 1.6 }}>
              This is to certify that the thermal insulation listed below has been installed at the property shown, in accordance with
              the manufacturer&apos;s installation instructions, AS 3999:2015 <em>Bulk thermal insulation — Installation</em>, and the
              energy efficiency provisions of the National Construction Code.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3.5">
              <div className="flex flex-col gap-1">
                <span className={label}>Customer / Builder</span>
                <span className={value}>{inspection.builder_name || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Certificate No.</span>
                <span className={value}>{certNo}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Site address</span>
                <span className={value}>{address || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Date installed</span>
                <span className={value}>{fmtLong(installedOn)}</span>
              </div>
            </div>

            <table className="mt-7 w-full border-collapse" style={{ fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#201f1c", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "9px 12px", fontWeight: 600 }}>Area</th>
                  <th style={{ padding: "9px 12px", fontWeight: 600 }}>Product installed</th>
                  <th style={{ padding: "9px 12px", fontWeight: 600, textAlign: "right" }}>R-value</th>
                  {editing && <th className="print:hidden" style={{ width: 36 }} />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #d9d5cc", background: i % 2 ? "#faf8f3" : "#ffffff" }}>
                    {editing ? (
                      <>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            value={r.area}
                            onChange={(e) => changeRow(i, { area: e.target.value })}
                            placeholder="e.g. Ceiling"
                            aria-label="Area"
                            className="w-full rounded border border-[#c9c5bb] px-2 py-1.5 font-semibold"
                          />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            value={r.product}
                            onChange={(e) => changeRow(i, { product: e.target.value })}
                            aria-label="Product installed"
                            className="w-full rounded border border-[#c9c5bb] px-2 py-1.5"
                          />
                        </td>
                        <td style={{ padding: "6px 8px", width: 96 }}>
                          <input
                            value={r.r_value}
                            onChange={(e) => changeRow(i, { r_value: e.target.value })}
                            placeholder="R2.5"
                            aria-label="R-value"
                            className="w-full rounded border border-[#c9c5bb] px-2 py-1.5 text-right font-bold"
                          />
                        </td>
                        <td className="print:hidden" style={{ padding: "6px 4px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setRows((all) => all.filter((_, idx) => idx !== i));
                              setStatus("dirty");
                            }}
                            aria-label="Remove row"
                            className="px-1 text-lg leading-none text-[#8a877f] hover:text-red-700"
                          >
                            ×
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.area}</td>
                        <td style={{ padding: "10px 12px" }}>{r.product}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>{r.r_value}</td>
                      </>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && !editing && (
                  <tr>
                    <td colSpan={3} style={{ padding: "14px 12px", color: "#8a877f", textAlign: "center" }} className="print:hidden">
                      No products on the work order — use &ldquo;Edit products &amp; date&rdquo; to add them.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setRows((all) => [...all, { area: "", product: "", r_value: "" }]);
                  setStatus("dirty");
                }}
                className="mt-2 self-start text-sm font-medium text-accent hover:underline print:hidden"
              >
                + Add product
              </button>
            )}

            <div style={{ marginTop: 14, fontSize: 13, color: "#3a3834" }}>
              {[woNumber ? `Work order ${woNumber}` : null, `Inspected and passed ${fmtLong(inspection.inspection_date)} (INS${inspection.inspection_number})`]
                .filter(Boolean)
                .join(" · ")}
            </div>

            <div className="grid grid-cols-2 gap-10" style={{ marginTop: "auto", paddingTop: 32, fontSize: 13 }}>
              <div>
                <div style={{ height: 54, borderBottom: "1.5px solid #201f1c", display: "flex", alignItems: "flex-end" }}>
                  {inspection.inspector_signature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={inspection.inspector_signature} alt="Signature" style={{ maxHeight: 52, width: "auto" }} />
                  )}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600 }}>{inspection.inspector_name || " "}</div>
                <div style={{ color: "#5f6062" }}>For Better Batt Insulation</div>
              </div>
              <div>
                <div style={{ height: 54, borderBottom: "1.5px solid #201f1c", display: "flex", alignItems: "flex-end", paddingBottom: 6, fontSize: 15 }}>
                  {editing ? (
                    <input
                      type="date"
                      value={issuedOn}
                      onChange={(e) => {
                        setIssuedOn(e.target.value);
                        setStatus("dirty");
                      }}
                      aria-label="Date issued"
                      className="rounded border border-[#c9c5bb] px-2 py-1 print:hidden"
                    />
                  ) : (
                    fmtLong(issuedOn)
                  )}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600 }}>Date issued</div>
                <div style={{ color: "#5f6062" }}>Keep this certificate with the building&apos;s records</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
