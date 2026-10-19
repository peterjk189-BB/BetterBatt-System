// Optional extras on a quote: lines with an option_key ("A", "B", ...) are extras.
// They only count once the customer/office has accepted that option.

export const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

type OptLine = { option_key?: string | null };

export function optionTitle(titles: Record<string, string> | null | undefined, key: string) {
  const t = titles?.[key]?.trim();
  return t ? `Option ${key}: ${t}` : `Option ${key}`;
}

/** Main-quote lines plus lines from accepted options only. */
export function countedLines<T extends OptLine>(lines: T[], accepted: string[] | null | undefined): T[] {
  const acc = accepted ?? [];
  return lines.filter((l) => !l.option_key || acc.includes(l.option_key));
}

/** Option keys that have at least one line (or are in use), in A-Z order. */
export function usedOptionKeys<T extends OptLine>(lines: T[], titles?: Record<string, string> | null): string[] {
  const set = new Set<string>();
  lines.forEach((l) => l.option_key && set.add(l.option_key));
  Object.keys(titles ?? {}).forEach((k) => set.add(k));
  return OPTION_KEYS.filter((k) => set.has(k));
}

/**
 * Ids of project_lines that belong to an option which has NOT been accepted, so totals, reports,
 * invoices and work orders can leave them out. Safe before migration 0047 is run (returns an empty set).
 */
export async function unacceptedOptionLineIds(supabase: any): Promise<Set<string>> {
  try {
    const [{ data: ls, error: e1 }, { data: ps, error: e2 }] = await Promise.all([
      supabase.from("project_lines").select("id, project_id, option_key").not("option_key", "is", null),
      supabase.from("projects").select("id, option_accepted"),
    ]);
    if (e1 || e2 || !ls) return new Set();
    const acc = new Map<string, string[]>((ps ?? []).map((p: any) => [p.id, p.option_accepted ?? []]));
    return new Set(ls.filter((l: any) => !(acc.get(l.project_id) ?? []).includes(l.option_key)).map((l: any) => l.id as string));
  } catch {
    return new Set();
  }
}
