// Insulation certificate: what it shows and how its product rows are
// worked out from the work order's materials. Issued from an inspection
// that has PASSed; printed from /dashboard/inspections/<id>/certificate.

export type CertRow = { area: string; product: string; r_value: string };

/** What's saved in inspections.certificate once the office edits it. */
export type SavedCertificate = { rows: CertRow[]; issued_on: string | null; saved_at: string };

export function certificateNumber(inspectionNumber: number) {
  return `BBI-CERT-${String(inspectionNumber).padStart(4, "0")}`;
}

/** "R2.5", "R 6.0", "r3" in a product name → "R2.5", "R6.0", "R3". */
export function parseRValue(text: string | null | undefined): string {
  const m = (text || "").match(/\bR\s?(\d+(?:\.\d+)?)/i);
  return m ? `R${m[1]}` : "";
}

/** Best guess at where a product went, from its name/type and the labour task. */
export function guessArea(...texts: (string | null | undefined)[]): string {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (/acoustic|sound|soundscreen|internal wall/.test(t)) return "Internal walls";
  if (/under ?floor|sub ?floor/.test(t)) return "Underfloor";
  if (/mid ?floor/.test(t)) return "Mid floor";
  if (/ceiling|roof/.test(t)) return "Ceiling";
  if (/garage/.test(t)) return "Garage wall";
  if (/foil|wrap|sarking|membrane|damp/.test(t)) return "Wall wrap";
  if (/wall|stud/.test(t)) return "External walls";
  return "";
}

type Line = {
  part_id: string | null;
  note: string | null;
  parts: { name: string | null; type: string | null; code: string | null; is_stock_item?: boolean | null } | null;
  labour_items: { code: string | null; description: string | null } | null;
};

/** One row per product and area on the work order (repeat lines in the same area merged; non-stock items left out). */
export function rowsFromWorkOrderLines(lines: Line[]): CertRow[] {
  const seen = new Set<string>();
  const rows: CertRow[] = [];
  for (const l of lines) {
    const name = l.parts?.name?.trim();
    if (!name) continue;
    if (l.parts?.is_stock_item === false) continue; // non-stock items (poly, fees etc.) aren't certified
    const area = guessArea(name, l.parts?.type, l.labour_items?.description, l.note);
    // Same product in two areas (e.g. external and internal walls) gets a row for each area.
    const key = `${l.part_id || name}|${area}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      area,
      product: name,
      r_value: parseRValue(name),
    });
  }
  return rows;
}

export function normaliseSaved(raw: unknown): SavedCertificate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SavedCertificate>;
  if (!Array.isArray(r.rows)) return null;
  return {
    rows: r.rows
      .filter((x) => x && typeof x === "object")
      .map((x: any) => ({ area: String(x.area ?? ""), product: String(x.product ?? ""), r_value: String(x.r_value ?? "") })),
    issued_on: typeof r.issued_on === "string" ? r.issued_on : null,
    saved_at: typeof r.saved_at === "string" ? r.saved_at : "",
  };
}
