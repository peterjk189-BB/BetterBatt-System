// Each office/admin user can arrange their home page tiles and pin favourite tabs.
// Stored on profiles.home_layout as { tiles: string[], hidden: string[], pins: string[] } (tab keys).

export type HomeLayout = { tiles: string[]; hidden: string[]; pins: string[] };

export function parseLayout(raw: unknown): HomeLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { tiles: arr(r.tiles), hidden: arr(r.hidden), pins: arr(r.pins) };
}

/** Put items in the saved order; anything not mentioned (e.g. a newly granted tab) goes at the end in its default order. */
export function applyOrder<T extends { key: string }>(items: T[], order: string[]): T[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const out: T[] = [];
  for (const k of order) {
    const it = byKey.get(k);
    if (it) {
      out.push(it);
      byKey.delete(k);
    }
  }
  return [...out, ...Array.from(byKey.values())];
}
