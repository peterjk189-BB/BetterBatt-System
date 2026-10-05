"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { certificateNumber, type CertRow, type SavedCertificate } from "@/lib/certificate";

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
  };
  woNumber: string | null;
  installedOn: string;
  derivedRows: CertRow[];
  saved: SavedCertificate | null;
  company: { abn: string | null; phone: string | null };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<CertRow[]>(saved?.rows ?? derivedRows);
  const [issuedOn, setIssuedOn] = useState<string>(saved?.issued_on || todayLocal());
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

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
          onClick={() => window.print()}
          className="rounded-lg bg-[var(--brand-gold)] px-5 py-2 text-sm font-semibold text-[#201f1c]"
        >
          Print / Save as PDF
        </button>
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
