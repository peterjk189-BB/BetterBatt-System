"use client";

import Link from "next/link";
import {
  ANSWERS,
  INSPECTION_STATUSES,
  RESULTS,
  SECTIONS,
  STATUS_STYLES,
  normaliseSection,
  type InspectionPhoto,
  type InspectionRecord,
  type SectionDef,
} from "@/lib/inspections";

// The printed report mirrors the on-screen inspection form: the same
// cards in the same order (job details, what's inspected, one card per
// ticked checklist, result, photos, sign-off), with ticked options filled
// in and the rest shown as plain outlines. Sections that weren't ticked
// are left out.

const ANSWER_ON: Record<string, string> = {
  Yes: "border-[#1f6b35] bg-[#1f6b35] text-white",
  No: "border-[#9b1c1c] bg-[#9b1c1c] text-white",
  NA: "border-[#5f6062] bg-[#5f6062] text-white",
};

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-[#e4e1da] bg-white p-4">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#5f6062]">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Field({ label, value, className = "" }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[#6b6862]">{label}</span>
      <span className="min-h-[34px] whitespace-pre-wrap rounded-lg border border-[#e4e1da] px-3 py-1.5 font-medium">{value || " "}</span>
    </div>
  );
}

// A ticked option is filled dark, an unticked one is a plain outline — the on-screen Toggle.
function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium ${
        on ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[#e4e1da] bg-white text-[#8a877f]"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[10px] leading-none ${
          on ? "border-white/70 bg-white/20" : "border-[#b9b5ac]"
        }`}
      >
        {on ? "✓" : ""}
      </span>
      {children}
    </span>
  );
}

function ChecklistCard({ def, raw }: { def: SectionDef; raw: unknown }) {
  const data = normaliseSection(raw);
  return (
    <Section title={def.title}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {def.options.map((opt) => (
          <span key={opt} className="inline-flex items-center gap-2">
            <Chip on={!!data.options[opt]}>{opt}</Chip>
            {def.optionNotes.includes(opt) && (
              <span className="inline-block min-h-[26px] min-w-[8rem] rounded-lg border border-[#e4e1da] px-2 py-0.5">{data.notes[opt] || ""}</span>
            )}
          </span>
        ))}
      </div>

      <div className="mt-3 divide-y divide-[#e4e1da]">
        {def.checks.map((item) => {
          const flagged = data.flagged.includes(item);
          const answer = data.checks[item];
          return (
            <div
              key={item}
              className={`flex items-center justify-between gap-2 py-1.5 ${flagged ? "-mx-2 rounded-lg bg-[#fdf1f1] px-2" : ""}`}
              style={{ breakInside: "avoid" }}
            >
              <span className="min-w-0 flex-1">
                {item}
                {flagged && <span className="ml-2 rounded-full bg-[#9b1c1c] px-2 py-0.5 text-[10px] font-semibold text-white">Failed last time</span>}
              </span>
              <div className="flex items-center gap-1.5">
                {def.checkNotes.includes(item) && (
                  <span className="inline-block min-h-[26px] w-24 rounded-lg border border-[#e4e1da] px-2 py-0.5">{data.notes[item] || ""}</span>
                )}
                {ANSWERS.map((a) => (
                  <span
                    key={a}
                    className={`inline-flex min-w-[2.6rem] items-center justify-center rounded-lg border px-2 py-0.5 text-[12px] font-medium ${
                      answer === a ? ANSWER_ON[a] : "border-[#e4e1da] bg-white text-[#8a877f]"
                    }`}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {def.extras.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {def.extras.map((x) => (
            <Chip key={x} on={!!data.extras[x]}>
              {x}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Field label="Comments" value={data.comments} />
      </div>
    </Section>
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
  const status = INSPECTION_STATUSES.find((s) => s === record.status) || "Draft";

  return (
    <div>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link href={`/dashboard/inspections/${record.id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Back to inspection
        </Link>
        <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-8 text-[13px] leading-relaxed text-[#201f1c] shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-6 border-b-2 border-[#201f1c] pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Better Batt Insulation" className="h-14 w-auto" />
          <div className="text-right">
            <div className="text-lg font-bold">Inspection Report</div>
            <div className="font-mono text-xs text-[#6b6862]">
              INS{record.inspection_number}
              {record.work_orders?.wo_number ? ` · WO ${record.work_orders.wo_number}` : ""}
              {record.projects?.quote_number ? ` · Quote Q${record.projects.quote_number}` : ""}
              {record.parent_inspection_id ? " · Re-inspection" : ""}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <span
            className={`inline-block rounded-full border px-3.5 py-1 text-[12px] font-medium ring-2 ring-[#201f1c]/20 ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
        </div>

        <Section title="Job details">
          <div className="grid grid-cols-4 gap-3">
            <Field label={status === "Scheduled" ? "Booked for" : "Date"} value={fmtDate(record.inspection_date)} />
            <Field label="Time" value={fmtTime(record.inspection_time)} />
            <Field label="Builder" value={record.builder_name} className="col-span-2" />
            <Field label="Site address" value={record.site_address} className="col-span-2" />
            <Field label="Suburb" value={record.suburb} className="col-span-2" />
            <Field label="Contractor" value={record.contractor} className="col-span-2" />
            <Field label="Sales order" value={record.sales_order} />
            <Field label="Audit region" value={record.audit_region} />
          </div>
        </Section>

        <Section title="What's being inspected">
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <Chip key={s.key} on={!!record[s.includeField]}>
                {s.label}
              </Chip>
            ))}
          </div>
        </Section>

        {included.map((def) => (
          <ChecklistCard key={def.key} def={def} raw={record[def.key]} />
        ))}

        <Section title="Result">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <span className="text-[#6b6862]">Result</span>
              <div className="mt-1 flex gap-2">
                {RESULTS.map((r) => (
                  <span
                    key={r}
                    className={`rounded-lg border px-5 py-2 text-[13px] font-bold ${
                      record.result === r
                        ? r === "PASS"
                          ? "border-[#1f6b35] bg-[#1f6b35] text-white"
                          : "border-[#9b1c1c] bg-[#9b1c1c] text-white"
                        : "border-[#e4e1da] bg-white text-[#8a877f]"
                    }`}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[#6b6862]">Maintenance</span>
              <div className="mt-1 flex gap-2">
                {(["Yes", "No"] as const).map((m) => (
                  <span
                    key={m}
                    className={`rounded-lg border px-5 py-2 text-[13px] font-semibold ${
                      record.maintenance === m ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[#e4e1da] bg-white text-[#8a877f]"
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Field label="Rectifications" value={record.rectifications} />
          </div>
        </Section>

        {photos.length > 0 && (
          <Section title="Photos">
            <div className="grid grid-cols-3 gap-3">
              {photos.map((p) => (
                <figure key={p.id} className="overflow-hidden rounded-xl border border-[#e4e1da]" style={{ breakInside: "avoid" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.storage_path]} alt={p.caption || "Site photo"} className="aspect-[3/4] w-full bg-[#f1f0ed] object-cover" />
                  <figcaption className="min-h-[34px] border-t border-[#e4e1da] px-2.5 py-1.5 text-[12px]">{p.caption || " "}</figcaption>
                </figure>
              ))}
            </div>
          </Section>
        )}

        <div style={{ breakInside: "avoid" }}>
          <Section title="Sign-off">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inspector name" value={record.inspector_name} />
              <Field label="Installer / rectified by" value={record.installer_name} />
            </div>
            <div className="mt-3">
              <span className="text-[#6b6862]">Inspector signature</span>
              <div className="mt-1 flex h-24 items-center rounded-lg border border-[#e4e1da] px-3">
                {record.inspector_signature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={record.inspector_signature} alt="Inspector signature" className="max-h-20 w-auto" />
                )}
              </div>
              {record.signed_at && <p className="mt-1 text-[11px] text-[#6b6862]">Signed {new Date(record.signed_at).toLocaleString("en-AU")}</p>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
