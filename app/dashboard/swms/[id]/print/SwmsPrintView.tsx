"use client";

import Link from "next/link";
import {
  PHOTO_ITEMS,
  SCOPE_ITEMS,
  SITE_REPORT_COLUMNS,
  normaliseHazards,
  normaliseInstallers,
  normalisePhotosChecklist,
  normaliseScope,
  normaliseSiteReport,
  type SwmsPhoto,
  type SwmsRecord,
} from "@/lib/swms";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
}

function Box({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-start gap-1.5 ${on ? "font-semibold text-[#201f1c]" : "text-[#8a877f]"}`}>
      <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-[#201f1c] text-[10px] leading-none">
        {on ? "✓" : ""}
      </span>
      {children}
    </span>
  );
}

function Value({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-[#6b6862]">{label}</span>
      <span className="min-w-0 flex-1 border-b border-[#c9c5bb] pb-0.5 font-medium">{value || " "}</span>
    </div>
  );
}

export default function SwmsPrintView({
  record,
  photos,
  urls,
}: {
  record: SwmsRecord & { work_orders?: { wo_number: string } | null; projects?: { quote_number: number } | null };
  photos: SwmsPhoto[];
  urls: Record<string, string>;
}) {
  const scope = normaliseScope(record.scope, record.job_type);
  const hazards = normaliseHazards(record.hazards);
  const siteReport = normaliseSiteReport(record.site_report);
  const photosChecklist = normalisePhotosChecklist(record.photos_checklist);
  const installers = normaliseInstallers(record.installers);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link href={`/dashboard/swms/${record.id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Back to SWMS
        </Link>
        <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-8 text-[13px] leading-relaxed text-[#201f1c] shadow-sm print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-6 border-b-2 border-[#201f1c] pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Better Batt Insulation" className="h-12 w-auto" />
          <div className="text-right">
            <div className="text-lg font-bold">Safe Work Method Statement / JSA</div>
            <div className="font-mono text-xs text-[#6b6862]">
              SWMS{record.swms_number}
              {record.work_orders?.wo_number ? ` · WO ${record.work_orders.wo_number}` : ""}
              {record.projects?.quote_number ? ` · Quote Q${record.projects.quote_number}` : ""}
            </div>
            <div className="mt-1">
              Job date: <strong>{fmtDate(record.job_date)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
          <div className="col-span-2">
            <Value label="Job type" value={record.job_type} />
          </div>
          <div className="col-span-2">
            <Value label="Builder / customer" value={record.builder_name} />
          </div>
          <div className="col-span-2">
            <Value label="Site address" value={record.site_address} />
          </div>
          <Value label="Suburb" value={record.suburb} />
          <Value label="Time in / out" value={record.time_in && record.time_out ? `${record.time_in.slice(0, 5)} – ${record.time_out.slice(0, 5)}` : ""} />
        </div>

        <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Scope of work</h3>
        <div className="mt-3 flex flex-col gap-1.5">
          {SCOPE_ITEMS[record.job_type].map((item) => (
            <Box key={item} on={!!scope[item]}>
              {item}
            </Box>
          ))}
        </div>

        <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Site report</h3>
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
          {SITE_REPORT_COLUMNS.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1.5">
              {col.map((item) => (
                <Box key={item} on={!!siteReport.items[item]}>
                  {item}
                </Box>
              ))}
            </div>
          ))}
        </div>
        {siteReport.other_note && <p className="mt-2 text-[12px]">Other: {siteReport.other_note}</p>}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
          <Box on={siteReport.power_isolated_tagged}>Power isolated and tagged (photo)</Box>
          <Box on={siteReport.power_restored}>Power restored</Box>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2 text-[12px]">
          <Value label="GF walls" value={siteReport.stud_width.gf_walls} />
          <Value label="FF walls" value={siteReport.stud_width.ff_walls} />
          <Value label="Sub floor" value={siteReport.stud_width.sub_floor} />
          <Value label="Mid floor" value={siteReport.stud_width.mid_floor} />
          <Value label="Ceiling" value={siteReport.stud_width.ceiling_spacing} />
        </div>

        <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Hazard & control measures</h3>
        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[#201f1c] text-left">
              <th className="py-1 pr-2 font-semibold">Task</th>
              <th className="py-1 pr-2 font-semibold">Hazards</th>
              <th className="py-1 font-semibold">Control measures</th>
            </tr>
          </thead>
          <tbody>
            {hazards.map((h) => (
              <tr key={h.id} className="border-b border-[#e4e1da] align-top">
                <td className="py-1.5 pr-2 font-medium">{h.task}</td>
                <td className="py-1.5 pr-2 text-[#3a3834]">{h.hazards}</td>
                <td className="py-1.5 text-[#3a3834]">{h.controls}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Photos taken</h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {PHOTO_ITEMS.map((item) => (
            <Box key={item} on={!!photosChecklist[item]}>
              {item}
            </Box>
          ))}
        </div>

        {record.comments && (
          <>
            <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Comments</h3>
            <p className="mt-2 whitespace-pre-wrap">{record.comments}</p>
          </>
        )}

        <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Installer sign-off</h3>
        <p className="mt-2 text-[12px] text-[#6b6862]">
          By signing below, each installer confirms they have read and understood this SWMS/JSA and the hazards and
          control measures above before starting work.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {installers.length === 0 && <p className="text-[#8a877f]">No installer has signed yet.</p>}
          {installers.map((inst, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 border-b border-[#c9c5bb] pb-1">
              <span className="font-medium">{inst.name}</span>
              <span className="italic">{inst.signed_name || "Not signed"}</span>
              <span className="shrink-0 text-[#6b6862]">{inst.signed_at ? new Date(inst.signed_at).toLocaleString("en-AU") : ""}</span>
            </div>
          ))}
        </div>

        {photos.length > 0 && (
          <>
            <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Site photos</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={urls[p.storage_path]} alt="Site photo" className="aspect-square w-full rounded border border-[#e4e1da] object-cover" />
              ))}
            </div>
          </>
        )}

        <p className="mt-8 text-center text-[11px] text-[#8a877f]">Better Batt Insulation — SWMS{record.swms_number}</p>
      </div>
    </div>
  );
}
