"use client";

import Link from "next/link";
import {
  SECTIONS,
  normaliseSection,
  type InspectionPhoto,
  type InspectionRecord,
  type SectionDef,
} from "@/lib/inspections";

// Printed layout follows the Bradford Inspection Report it replaces: a
// cover page with the job details, result and sign-off, then one page per
// ticked inspection (Foil / Wall batt / Ceiling), then the captioned
// photos two to a row. Sections that weren't ticked are left out entirely.

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

const page = "mx-auto mb-6 max-w-[800px] bg-white p-10 text-[13px] leading-relaxed text-[#201f1c] shadow-sm print:mb-0 print:max-w-none print:p-0 print:shadow-none";

function Header({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b-2 border-[#201f1c] pb-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Better Batt Insulation" className="h-16 w-auto" />
      <div className="text-right text-2xl font-light uppercase tracking-wide">{title}</div>
    </div>
  );
}

function Box({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-[#201f1c] text-[10px] leading-none">
        {on ? "✓" : ""}
      </span>
      {children}
    </span>
  );
}

function FieldRow({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${wide ? "col-span-2" : ""}`}>
      <span className="w-28 shrink-0 text-right text-[#3a3834]">{label}:</span>
      <span className="min-h-[28px] flex-1 border border-[#201f1c] px-2 py-1">{value || "-"}</span>
    </div>
  );
}

function SectionPage({ def, raw }: { def: SectionDef; raw: unknown }) {
  const data = normaliseSection(raw);
  return (
    <div className={page} style={{ breakBefore: "page" }}>
      <Header title={def.title} />

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {def.options.map((opt) => (
          <span key={opt} className="inline-flex items-center gap-2">
            <Box on={!!data.options[opt]}>{opt}</Box>
            {def.optionNotes.includes(opt) && (
              <span className="inline-block min-h-[24px] min-w-[9rem] border border-[#201f1c] px-2 py-0.5">{data.notes[opt] || ""}</span>
            )}
          </span>
        ))}
      </div>

      <table className="mt-5 w-full border-collapse">
        <tbody>
          {def.checks.map((item) => (
            <tr key={item}>
              <td className="py-[3px] pr-3">{item}</td>
              <td className="w-24 py-[3px]">
                <span
                  className={`block border border-[#201f1c] px-2 py-0.5 ${
                    data.checks[item] === "No" ? "font-semibold text-[#9b1c1c]" : ""
                  }`}
                >
                  {data.checks[item] || "-"}
                </span>
              </td>
              {def.checkNotes.length > 0 && (
                <td className="w-24 py-[3px] pl-2">
                  {def.checkNotes.includes(item) && <span className="block min-h-[24px] border border-[#201f1c] px-2 py-0.5">{data.notes[item] || ""}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {def.extras.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-y-2">
          {def.extras.map((x, i) => (
            <span key={x} className={i === 0 ? "col-span-2" : ""}>
              <Box on={!!data.extras[x]}>{x}</Box>
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <span className="w-24 shrink-0">Comments:</span>
        <div className="min-h-[90px] flex-1 whitespace-pre-wrap border border-[#201f1c] px-2 py-1">{data.comments}</div>
      </div>
    </div>
  );
}

export default function InspectionPrintView({
  record,
  photos,
  urls,
}: {
  record: InspectionRecord & { work_orders?: { wo_number: string } | null; projects?: { quote_number: number } | null };
  photos: InspectionPhoto[];
  urls: Record<string, string>;
}) {
  const included = SECTIONS.filter((s) => record[s.includeField]);
  const photoPages: InspectionPhoto[][] = [];
  for (let i = 0; i < photos.length; i += 6) photoPages.push(photos.slice(i, i + 6));

  return (
    <div>
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link href={`/dashboard/inspections/${record.id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Back to inspection
        </Link>
        <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Print / Save as PDF
        </button>
      </div>

      {/* Cover page */}
      <div className={page}>
        <Header title="Inspection Report" />
        <div className="mt-1 text-right font-mono text-xs text-[#6b6862]">
          INS{record.inspection_number}
          {record.work_orders?.wo_number ? ` · WO ${record.work_orders.wo_number}` : ""}
          {record.projects?.quote_number ? ` · Quote Q${record.projects.quote_number}` : ""}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
          <FieldRow label="Builder" value={record.builder_name} />
          <FieldRow label="Date" value={fmtDate(record.inspection_date)} />
          <FieldRow label="Site address" value={record.site_address} />
          <FieldRow label="Time" value={fmtTime(record.inspection_time)} />
          <FieldRow label="Suburb" value={record.suburb} />
          <FieldRow label="Sales order" value={record.sales_order} />
          <FieldRow label="Contractor" value={record.contractor} />
          <FieldRow label="Audit region" value={record.audit_region} />
        </div>

        <div className="mt-6 flex gap-3">
          <span className="w-28 shrink-0 text-right text-[#3a3834]">Inspections:</span>
          <div className="flex flex-col gap-2">
            {included.length === 0 ? (
              <span className="text-[#8a877f]">None selected</span>
            ) : (
              included.map((s) => (
                <Box key={s.key} on>
                  {s.label}
                </Box>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5">
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-right text-[#3a3834]">Result:</span>
            <span
              className={`min-h-[28px] w-36 border border-[#201f1c] px-2 py-1 font-bold ${
                record.result === "FAIL" ? "text-[#9b1c1c]" : record.result === "PASS" ? "text-[#1f6b35]" : ""
              }`}
            >
              {record.result || "-"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-right text-[#3a3834]">Maintenance:</span>
            <span className="min-h-[28px] w-24 border border-[#201f1c] px-2 py-1">{record.maintenance || "-"}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <span className="w-28 shrink-0 text-right text-[#3a3834]">Rectifications:</span>
          <div className="min-h-[130px] flex-1 whitespace-pre-wrap border border-[#201f1c] px-2 py-1">{record.rectifications}</div>
        </div>

        <div className="mt-6 flex gap-3">
          <span className="w-28 shrink-0 text-right text-[#3a3834]">Inspector:</span>
          <div className="flex-1">
            <div className="flex h-20 w-72 items-end border-b border-[#201f1c]">
              {record.inspector_signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.inspector_signature} alt="Inspector signature" className="max-h-20 w-auto" />
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="min-h-[28px] border border-[#201f1c] px-2 py-1">{record.inspector_name || "-"}</div>
                <div className="mt-0.5 text-[11px] text-[#6b6862]">Inspector</div>
              </div>
              <div>
                <div className="min-h-[28px] border border-[#201f1c] px-2 py-1">{record.installer_name || "-"}</div>
                <div className="mt-0.5 text-[11px] text-[#6b6862]">Installer / rectified by</div>
              </div>
            </div>
            {record.signed_at && <div className="mt-2 text-[11px] text-[#6b6862]">Signed {new Date(record.signed_at).toLocaleString("en-AU")}</div>}
          </div>
        </div>
      </div>

      {included.map((def) => (
        <SectionPage key={def.key} def={def} raw={record[def.key]} />
      ))}

      {photoPages.map((group, gi) => (
        <div key={gi} className={page} style={{ breakBefore: "page" }}>
          {gi === 0 && <Header title="Photos" />}
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
            {group.map((p) => (
              <div key={p.id} className="flex flex-col items-center" style={{ breakInside: "avoid" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[p.storage_path]} alt={p.caption || "Site photo"} className="h-56 w-full object-contain" />
                <div className="mt-1 min-h-[44px] w-full border border-[#201f1c] px-2 py-1">{p.caption || ""}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="mt-2 text-center text-[11px] text-[#8a877f] print:hidden">Better Batt Insulation — INS{record.inspection_number}</p>
    </div>
  );
}
