"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { elementToPdf, pdfFileName } from "@/lib/elementToPdf";
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
  VISIT_TYPES,
  normaliseChecklist,
  roomArea,
  type SiteVisit,
  type VisitPhoto,
} from "@/lib/siteVisit";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
}

const INK = "#201f1c";

/** A selectable option, drawn like the app's chips: filled when chosen, faint when not. */
function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] ${
        on ? "border-[#201f1c] bg-[#201f1c] font-semibold text-white" : "border-[#e4e1da] text-[#9a968d]"
      }`}
    >
      {children}
    </span>
  );
}

function Tag() {
  return (
    <span className="ml-1.5 rounded bg-[#f5b324] px-1.5 py-px align-middle text-[8px] font-bold uppercase tracking-wide text-[#201f1c]">Builder</span>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid rounded-xl border border-[#e4e1da] p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4a4843]">{title}</h3>
      {hint && <p className="mt-0.5 text-[11px] text-[#7a776f]">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Grid({ cols = 6, children }: { cols?: 2 | 3 | 4 | 6; children: React.ReactNode }) {
  const c = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 6: "grid-cols-6" }[cols];
  return <div className={`grid ${c} gap-x-3 gap-y-3`}>{children}</div>;
}

const SPAN: Record<number, string> = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 6: "col-span-6" };

/** A labelled box like the app's input fields. */
function Field({ label, value, span = 2, builder }: { label: string; value: string | null | undefined; span?: 1 | 2 | 3 | 4 | 6; builder?: boolean }) {
  return (
    <div className={`min-w-0 ${SPAN[span]}`}>
      <div className="text-[11px] text-[#6b6862]">
        {label}
        {builder && <Tag />}
      </div>
      <div className="mt-1 min-h-[34px] whitespace-pre-wrap break-words rounded-lg border border-[#e4e1da] px-3 py-1.5 text-[13px] font-medium">{value || " "}</div>
    </div>
  );
}

function Group({ label, tag, children }: { label: string; tag?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#4a4843]">
        {label}
        {tag && <Tag />}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function fmtTime(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour >= 12 ? "pm" : "am"}`;
}

function fmtLongDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function SiteVisitPrintView({
  visit,
  photos,
  urls,
  assignedName,
  customerAccount,
}: {
  visit: SiteVisit & { projects?: { quote_number: number } | null };
  photos: VisitPhoto[];
  urls: Record<string, string>;
  assignedName?: string | null;
  customerAccount?: string | null;
}) {
  const c = normaliseChecklist(visit.checklist);
  const plans = photos.filter((p) => p.category === "Site plan");
  const sitePhotos = photos.filter((p) => p.category !== "Site plan" && p.category !== "Other document");
  const documents = photos.filter((p) => p.category === "Other document");
  const rooms = c.rooms.filter((r) => r.length || r.width);
  const builder = isBuilderVisit(visit.visit_type);

  const printableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const fileBase = pdfFileName(`Site visit SV${visit.visit_number}`, [visit.address, visit.suburb].filter(Boolean).join(", "));

  // The browser's Print / Save as PDF uses the page title as the file name.
  useEffect(() => {
    const prev = document.title;
    document.title = fileBase.replace(/\.pdf$/, "");
    return () => {
      document.title = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Works on phones, where the browser's Print / Save as PDF is not available.
  async function downloadPdf() {
    if (!printableRef.current) return;
    setDownloading(true);
    try {
      await elementToPdf(printableRef.current, fileBase, "portrait");
    } catch {
      alert("Couldn't make the PDF. Try again, or use Print.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link
          href={`/dashboard/site-visits/${visit.id}`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          &larr; Back to site visit
        </Link>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {downloading ? "Making PDF…" : "Download PDF"}
        </button>
        <button onClick={() => window.print()} className="hidden rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent md:block">
          Print
        </button>
      </div>

      <div
        ref={printableRef}
        className="mx-auto max-w-[800px] bg-white p-8 text-[13px] leading-snug text-[#201f1c] shadow-sm print:p-0 print:shadow-none"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Better Batt Insulation" className="h-10 w-auto" />
            <h1 className="mt-3 text-2xl font-bold" style={{ color: INK }}>
              Site visit SV{visit.visit_number}
            </h1>
            {visit.projects?.quote_number ? <div className="text-xs text-[#6b6862]">Quote Q{visit.projects.quote_number}</div> : null}
          </div>
          {builder && (
            <div className="pt-1 text-[11px] text-[#6b6862]">
              <Tag /> = field only shown for Building site visits
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[12px] text-[#4a4843]">Visit type</span>
          {VISIT_TYPES.map((t) => (
            <Pill key={t} on={visit.visit_type === t}>
              {t}
            </Pill>
          ))}
        </div>

        <Card title={builder ? "Builder & booking" : "Customer & booking"}>
          <Grid>
            <Field span={2} label="Visit date" value={fmtLongDate(visit.visit_date)} />
            <Field span={1} label="Time" value={fmtTime(visit.visit_time)} />
            <Field span={3} label="Assigned to" value={assignedName} />
            <Field span={3} label={builder ? "Builder / company" : "Customer name"} value={visit.customer_name} builder={builder} />
            <Field span={3} label="Existing customer (builders etc.)" value={customerAccount} />
            {builder && <Field span={2} label="Main contact (office / estimator)" value={c.main_contact} />}
            {!builder && (
              <>
                <Field span={4} label="Address" value={visit.address} />
                <Field span={2} label="Suburb" value={visit.suburb} />
              </>
            )}
            <Field span={builder ? 2 : 3} label={builder ? "Main contact phone" : "Phone"} value={visit.phone} />
            <Field span={builder ? 2 : 3} label={builder ? "Main contact email" : "Email"} value={visit.email} />
          </Grid>
        </Card>

        {builder && (
          <Card title="Site details & people on site" hint="The supervisor on the day is often not the person who booked the visit, so they get their own contact.">
            <Grid>
              <Field span={3} label="Site address" value={visit.address} />
              <Field span={2} label="Suburb" value={visit.suburb} />
              <Field span={1} label="Lot / job number" value={c.lot_number} builder />
              <Field span={3} label="Site supervisor name" value={c.supervisor_name} builder />
              <Field span={2} label="Site supervisor phone" value={c.supervisor_phone} builder />
              <Field span={1} label="Best time to reach" value={c.supervisor_time} builder />
              <Field span={6} label="Site access / notes (gate codes, parking)" value={c.access_notes} builder />
            </Grid>
          </Card>
        )}

        {builder ? (
          <>
            <Card title="Job specifics · Building site">
              <Group label="Quoting">
                <Pill on={c.quote_ceiling}>Ceiling batts</Pill>
                <Pill on={c.quote_underfloor}>Underfloor batts</Pill>
                <Pill on={c.quote_walls}>Wall batts</Pill>
              </Group>
              <Group label="Stage of build" tag>
                {BUILD_STAGES.map((o) => <Pill key={o} on={c.stage === o}>{o}</Pill>)}
              </Group>
              <Group label="Storeys">
                {STOREYS.map((o) => <Pill key={o} on={c.storeys === o}>{o}</Pill>)}
              </Group>
              <Group label="Roof">
                {ROOF_TYPES.map((o) => <Pill key={o} on={c.roof.includes(o)}>{o}</Pill>)}
              </Group>
              <Group label="Truss spacing (mm)">
                {TRUSS_SIZES.map((o) => <Pill key={o} on={c.truss === o}>{o}</Pill>)}
              </Group>
              <Group label="Ceiling battened?">
                {BATTEN_OPTIONS.map((o) => <Pill key={o} on={c.batten === o}>{o}</Pill>)}
              </Group>
              <Grid cols={3}>
                <Field span={1} label="Batten spacing (mm)" value={c.batten_spacing} />
                <Field span={1} label="Batten depth (mm)" value={c.batten_depth} />
                <Field span={1} label="Ceiling height (m)" value={c.ceiling_height} />
              </Grid>
            </Card>

            <Card title="Skylights & shaft liners">
              <Group label="Skylights">
                <Pill on={c.skylights === "None"}>None</Pill>
                <Pill on={c.skylights === "Yes"}>Yes</Pill>
                {SKYLIGHT_STATUS.map((o) => <Pill key={o} on={c.skylight_status === o}>{o}</Pill>)}
              </Group>
              <Grid cols={2}>
                <Field span={1} label="How many" value={c.skylight_count} />
                <Field span={1} label="Boxed out by" value={c.skylight_boxed_by} />
              </Grid>
            </Card>

            <Card title="High ceilings & access">
              <Group label="Ceiling height">
                <Pill on={c.high_ceilings === "No"}>Under 3.0 m</Pill>
                <Pill on={c.high_ceilings === "Yes"}>Over 3.0 m</Pill>
              </Group>
              <Group label="Access">
                {SCAFFOLD_OPTIONS.map((o) => <Pill key={o} on={c.high_access.includes(o)}>{o}</Pill>)}
              </Group>
              <Group label="Void">
                {VOID_OPTIONS.map((o) => <Pill key={o} on={c.high_void.includes(o)}>{o}</Pill>)}
              </Group>
              <Grid cols={3}>
                <Field span={1} label="Highest ceiling (m)" value={c.highest_ceiling} />
                <Field span={1} label="Area over 3.0 m (m²)" value={c.area_over_3m} />
                <Field span={1} label="Scaffold / protection by" value={c.access_arranged_by} />
              </Grid>
            </Card>
          </>
        ) : (
          <Card title="Job specifics">
            <Group label="Quoting">
              <Pill on={c.quote_ceiling}>Ceiling batts</Pill>
              <Pill on={c.quote_underfloor}>Underfloor batts</Pill>
              <Pill on={c.quote_walls}>Wall batts</Pill>
            </Group>
            <Group label="Roof">
              {ROOF_TYPES.map((o) => <Pill key={o} on={c.roof.includes(o)}>{o}</Pill>)}
            </Group>
            <Group label="Storeys">
              {STOREYS.map((o) => <Pill key={o} on={c.storeys === o}>{o}</Pill>)}
            </Group>
            <Group label="Truss size">
              {TRUSS_SIZES.map((o) => <Pill key={o} on={c.truss === o}>{o}</Pill>)}
            </Group>
            <Group label="Existing ceiling insulation">
              {CEILING_EXISTING.map((o) => <Pill key={o} on={c.existing.includes(o)}>{o}</Pill>)}
              <Pill on={c.remove_batts}>Insulation removal</Pill>
            </Group>
            <Group label="Tile lift">
              <Pill on={c.tile_lift}>Tile lift{c.tile_lift && c.tile_lift_qty ? ` · ${c.tile_lift_qty}` : ""}</Pill>
            </Group>
            <Grid cols={6}>
              <Field span={6} label="Notes" value={c.job_notes} />
            </Grid>
          </Card>
        )}

        <Card title="Ceiling batts">
          <Grid cols={4}>
            <Field span={1} label="430 m²" value={c.ceiling_430_m2} />
            <Field span={1} label="580 m²" value={c.ceiling_580_m2} />
            <Field span={1} label="R rating" value={c.ceiling_r_rating} />
            <Field span={1} label="Method" value={c.ceiling_method} />
          </Grid>
          <Group label="Suitability">
            <Pill on={c.ceiling_suitability.includes("Mixed")}>Mixed</Pill>
          </Group>
          <Group label="Ceiling access">
            {ACCESS_LEVELS.map((o) => <Pill key={o} on={c.ceiling_access.includes(o)}>{o}</Pill>)}
          </Group>
          <div className="rounded-lg bg-[#fff8e6] px-3 py-2 text-[12px]">
            {c.power_isolation_explained ? "✓ " : "☐ "}
            <strong>Explained to the customer</strong> that the power is isolated while we install in the ceiling space.
          </div>
        </Card>

        <Card title="Wall batts">
          <Grid cols={4}>
            <Field span={1} label="External GF m²" value={c.wall_ext_gf_m2} />
            <Field span={1} label="GF batt size" value={c.wall_ext_gf_size} />
            <Field span={1} label="External FF m²" value={c.wall_ext_ff_m2} />
            <Field span={1} label="FF batt size" value={c.wall_ext_ff_size} />
            <Field span={1} label="External R rating" value={c.wall_r_rating} />
            <Field span={1} label="Internal / acoustic m²" value={c.wall_int_m2} />
            <Field span={1} label="Internal R rating" value={c.wall_int_r_rating} />
          </Grid>
          <Group label="Suitability">
            <Pill on={c.wall_suitability.includes("Mixed")}>Mixed</Pill>
          </Group>
          <Group label="Wall access">
            {ACCESS_LEVELS.map((o) => <Pill key={o} on={c.wall_access.includes(o)}>{o}</Pill>)}
          </Group>
          <Grid cols={4}>
            <Field span={4} label="Notes" value={c.wall_notes} />
          </Grid>
        </Card>

        <Card title="Underfloor batts">
          <Grid cols={4}>
            <Field span={1} label="415 m²" value={c.underfloor_415_m2} />
            <Field span={1} label="565 m²" value={c.underfloor_565_m2} />
          </Grid>
          <Group label="Product">
            {UNDERFLOOR_PRODUCTS.map((o) => <Pill key={o} on={c.underfloor_products.includes(o)}>{o}</Pill>)}
          </Group>
          <Group label="Suitability">
            {UNDERFLOOR_SUITABILITY.map((o) => <Pill key={o} on={c.underfloor_suitability.includes(o)}>{o}</Pill>)}
          </Group>
          <Group label="Underfloor access">
            {ACCESS_LEVELS.map((o) => <Pill key={o} on={c.underfloor_access.includes(o)}>{o}</Pill>)}
          </Group>
        </Card>

        {rooms.length > 0 && (
          <Card title="Room measurements">
            <table className="w-full font-mono text-xs tabular-nums">
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
          </Card>
        )}

        <Card title="Notes">
          <div className="min-h-[56px] whitespace-pre-wrap rounded-lg border border-[#e4e1da] px-3 py-2">{visit.notes || " "}</div>
        </Card>

        {plans.map((p) => (
          <section key={p.id} className="mt-4 break-inside-avoid rounded-xl border border-[#e4e1da] p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4a4843]">Site plan</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[p.storage_path]} alt="Site plan" className="mx-auto mt-3 max-h-[520px] w-auto" />
          </section>
        ))}

        {documents.length > 0 && (
          <p style={{ marginTop: 8, fontSize: 12 }}>
            <strong>Attached documents (open in the app):</strong> {documents.map((d) => d.file_name || d.caption || "Document").join(", ")}
          </p>
        )}
        {sitePhotos.length > 0 && (
          <section className="mt-4 rounded-xl border border-[#e4e1da] p-4" style={{ breakBefore: plans.length ? "page" : undefined }}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4a4843]">Photos</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              {sitePhotos.map((p) => (
                <figure key={p.id} className="break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.storage_path]} alt={p.caption || "Site photo"} className="aspect-[3/4] w-full rounded-lg border border-[#e4e1da] object-cover" />
                  <figcaption className="mt-1 rounded-lg border border-[#e4e1da] px-2 py-1">{p.caption || " "}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
