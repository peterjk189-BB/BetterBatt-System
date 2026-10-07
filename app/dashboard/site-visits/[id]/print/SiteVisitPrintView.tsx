"use client";

import Link from "next/link";
import {
  ACCESS_LEVELS,
  BATTEN_OPTIONS,
  BUILD_STAGES,
  CEILING_EXISTING,
  SCAFFOLD_OPTIONS,
  SKYLIGHT_STATUS,
  VOID_OPTIONS,
  isBuilderVisit,
  ROOF_TYPES,
  STOREYS,
  TRUSS_SIZES,
  UNDERFLOOR_PRODUCTS,
  UNDERFLOOR_SUITABILITY,
  normaliseChecklist,
  roomArea,
  type SiteVisit,
  type VisitPhoto,
} from "@/lib/siteVisit";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
}

function Box({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${on ? "font-semibold text-[#201f1c]" : "text-[#8a877f]"}`}>
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-[#201f1c] text-[10px] leading-none">{on ? "✓" : ""}</span>
      {children}
    </span>
  );
}

function Value({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-[#6b6862]">{label}</span>
      <span className="min-w-0 flex-1 border-b border-[#c9c5bb] pb-0.5 font-medium">{value || " "}</span>
    </div>
  );
}

export default function SiteVisitPrintView({
  visit,
  photos,
  urls,
}: {
  visit: SiteVisit & { projects?: { quote_number: number } | null };
  photos: VisitPhoto[];
  urls: Record<string, string>;
}) {
  const c = normaliseChecklist(visit.checklist);
  const plans = photos.filter((p) => p.category === "Site plan");
  const sitePhotos = photos.filter((p) => p.category !== "Site plan");
  const rooms = c.rooms.filter((r) => r.length || r.width);
  const builder = isBuilderVisit(visit.visit_type);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link
          href={`/dashboard/site-visits/${visit.id}`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          &larr; Back to site visit
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
            <div className="text-lg font-bold">Site Visit Checklist</div>
            <div className="font-mono text-xs text-[#6b6862]">
              SV{visit.visit_number}
              {visit.projects?.quote_number ? ` · Quote Q${visit.projects.quote_number}` : ""}
            </div>
            <div className="mt-1">Site visit date: <strong>{fmtDate(visit.visit_date)}</strong></div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
          <div className="col-span-2"><Value label={builder ? "Builder / company" : "Customer name"} value={visit.customer_name} /></div>
          {builder && <div className="col-span-2"><Value label="Main contact" value={c.main_contact} /></div>}
          <div className="col-span-2"><Value label="Address" value={visit.address} /></div>
          <Value label="Suburb" value={visit.suburb} />
          <Value label={builder ? "Main contact phone" : "Phone"} value={visit.phone} />
          <div className="col-span-2"><Value label={builder ? "Main contact email" : "Email"} value={visit.email} /></div>
          {builder && (
            <>
              <Value label="Lot / job no." value={c.lot_number} />
              <Value label="Best time on site" value={c.supervisor_time} />
              <Value label="Site supervisor" value={c.supervisor_name} />
              <Value label="Supervisor phone" value={c.supervisor_phone} />
              <div className="col-span-2"><Value label="Site access / notes" value={c.access_notes} /></div>
            </>
          )}
        </div>

        {builder ? (
          <>
            <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Job specific · {visit.visit_type}</h3>
            <div className="mt-3 grid grid-cols-3 gap-y-2">
              <Box on={c.quote_ceiling}>Quote ceiling batts</Box>
              <Box on={c.quote_underfloor}>Quote underfloor batts</Box>
              <Box on={c.quote_walls}>Quote wall batts</Box>
              {BUILD_STAGES.map((o) => <Box key={o} on={c.stage === o}>{o}</Box>)}
              {STOREYS.map((o) => <Box key={o} on={c.storeys === o}>{o}</Box>)}
              {ROOF_TYPES.map((o) => <Box key={o} on={c.roof.includes(o)}>{o}</Box>)}
              {TRUSS_SIZES.map((o) => <Box key={o} on={c.truss === o}>Truss {o}{o === "Mixed" ? "" : " mm"}</Box>)}
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="text-[#6b6862]">Ceiling battened?</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{BATTEN_OPTIONS.map((o) => <Box key={o} on={c.batten === o}>{o}</Box>)}</div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                <Value label="Batten spacing (mm)" value={c.batten_spacing} />
                <Value label="Batten depth (mm)" value={c.batten_depth} />
                <Value label="Ceiling height (m)" value={c.ceiling_height} />
              </div>
            </div>

            <h3 className="mt-6 border-b border-[#201f1c] pb-1 font-bold">Skylights &amp; shaft liners</h3>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Box on={c.skylights === "None"}>None</Box>
                <Box on={c.skylights === "Yes"}>Yes</Box>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{SKYLIGHT_STATUS.map((o) => <Box key={o} on={c.skylight_status === o}>{o}</Box>)}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Value label="How many" value={c.skylight_count} />
                <Value label="Boxed out by" value={c.skylight_boxed_by} />
              </div>
            </div>

            <h3 className="mt-6 border-b border-[#201f1c] pb-1 font-bold">High ceilings &amp; access</h3>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Box on={c.high_ceilings === "No"}>Under 3.0 m</Box>
                <Box on={c.high_ceilings === "Yes"}>Over 3.0 m</Box>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{SCAFFOLD_OPTIONS.map((o) => <Box key={o} on={c.high_access.includes(o)}>{o}</Box>)}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{VOID_OPTIONS.map((o) => <Box key={o} on={c.high_void.includes(o)}>{o}</Box>)}</div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                <Value label="Highest ceiling (m)" value={c.highest_ceiling} />
                <Value label="Area over 3.0 m (m²)" value={c.area_over_3m} />
                <Value label="Scaffold / protection by" value={c.access_arranged_by} />
              </div>
            </div>
          </>
        ) : (
          <>
        <h3 className="mt-6 border-b border-[#201f1c] pb-1 text-center font-bold">Job specific · {visit.visit_type}</h3>
        <div className="mt-3 grid grid-cols-3 gap-y-2">
          {ROOF_TYPES.map((o) => <Box key={o} on={c.roof.includes(o)}>{o}</Box>)}
          {STOREYS.map((o) => <Box key={o} on={c.storeys === o}>{o}</Box>)}
          {TRUSS_SIZES.map((o) => <Box key={o} on={c.truss === o}>Truss size {o}</Box>)}
          {CEILING_EXISTING.map((o) => <Box key={o} on={c.existing.includes(o)}>{o}</Box>)}
          <Box on={c.remove_batts}>Remove batts</Box>
          <Box on={c.quote_ceiling}>Quote ceiling batts</Box>
          <Box on={c.quote_underfloor}>Quote underfloor batts</Box>
          <span>
            <Box on={c.tile_lift}>Tile lift</Box>
            {c.tile_lift && c.tile_lift_qty ? <span className="ml-2">How many: <strong>{c.tile_lift_qty}</strong></span> : null}
          </span>
        </div>

          </>
        )}

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <h3 className="border-b border-[#201f1c] pb-1 font-bold">Ceiling batts</h3>
            <div className="mt-2 flex flex-col gap-1.5">
              <Value label="430 m²" value={c.ceiling_430_m2} />
              <Value label="580 m²" value={c.ceiling_580_m2} />
              <Value label="R rating" value={c.ceiling_r_rating} />
              <Value label="Method" value={c.ceiling_method} />
              <div className="mt-1"><Box on={c.ceiling_suitability.includes("Mixed")}>Mixed</Box></div>
              <div className="mt-1 text-[#6b6862]">Ceiling access</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {ACCESS_LEVELS.map((o) => <Box key={o} on={c.ceiling_access.includes(o)}>{o}</Box>)}
              </div>
              <div className="mt-1"><Box on={c.power_isolation_explained}>Power isolation explained to customer</Box></div>
            </div>
          </div>
          <div>
            <h3 className="border-b border-[#201f1c] pb-1 font-bold">Underfloor batts</h3>
            <div className="mt-2 flex flex-col gap-1.5">
              <Value label="415 m²" value={c.underfloor_415_m2} />
              <Value label="565 m²" value={c.underfloor_565_m2} />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {UNDERFLOOR_SUITABILITY.map((o) => <Box key={o} on={c.underfloor_suitability.includes(o)}>{o}</Box>)}
              </div>
              <div className="mt-1 text-[#6b6862]">Underfloor access</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {ACCESS_LEVELS.map((o) => <Box key={o} on={c.underfloor_access.includes(o)}>{o}</Box>)}
              </div>
              <div className="mt-1 text-[#6b6862]">Product</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {UNDERFLOOR_PRODUCTS.map((o) => <Box key={o} on={c.underfloor_products.includes(o)}>{o}</Box>)}
              </div>
            </div>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="mt-6">
            <h3 className="border-b border-[#201f1c] pb-1 font-bold">Room measurements</h3>
            <table className="mt-2 w-full font-mono text-xs tabular-nums">
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-[#e4e1da]">
                    <td className="py-1 font-sans">{r.area}</td>
                    <td className="py-1 font-sans">{r.name || "Room"}</td>
                    <td className="py-1 text-right">{r.length} × {r.width}</td>
                    <td className="py-1 text-right font-semibold">{roomArea(r)} m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6">
          <h3 className="border-b border-[#201f1c] pb-1 font-bold">Notes</h3>
          <p className="mt-2 min-h-[3rem] whitespace-pre-wrap">{visit.notes || ""}</p>
        </div>

        {plans.map((p) => (
          <div key={p.id} className="mt-6 break-inside-avoid">
            <h3 className="border-b border-[#201f1c] pb-1 font-bold">Site plan</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[p.storage_path]} alt="Site plan" className="mx-auto mt-3 max-h-[520px] w-auto border border-[#e4e1da]" />
          </div>
        ))}

        {sitePhotos.length > 0 && (
          <div className="mt-6" style={{ breakBefore: plans.length ? "page" : undefined }}>
            <h3 className="border-b border-[#201f1c] pb-1 font-bold">Photos</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              {sitePhotos.map((p) => (
                <figure key={p.id} className="break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.storage_path]} alt={p.caption || "Site photo"} className="aspect-[3/4] w-full border border-[#e4e1da] object-cover" />
                  <figcaption className="mt-1 border border-[#201f1c] px-2 py-1">{p.caption || " "}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
