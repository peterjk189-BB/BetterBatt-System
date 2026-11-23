/**
 * Supabase's API returns at most 1000 rows per request, silently cutting off the rest. This fetch wrapper makes every
 * list query return ALL matching rows: when a plain read comes back with a full page it keeps reading the next pages
 * (ordered by id so no row is skipped or repeated) and joins them. Reads that already set a limit/range, single-row
 * reads, counts and writes are passed through untouched.
 */
const PAGE = 1000;

export function withAllRows(base: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (method !== "GET" || !urlStr.includes("/rest/v1/") || urlStr.includes("/rpc/")) return base(input, init);
    const url = new URL(urlStr);
    if (url.searchParams.has("limit") || url.searchParams.has("offset")) return base(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (headers.has("Range") || (headers.get("Accept") || "").includes("vnd.pgrst.object")) return base(input, init);

    const get = (u: URL, from: number) => {
      const h = new Headers(headers);
      h.set("Range-Unit", "items");
      h.set("Range", `${from}-${from + PAGE - 1}`);
      return base(u.toString(), { ...init, method: "GET", headers: h });
    };

    const first = await get(url, 0);
    if (!first.ok) return base(input, init);
    const firstRows = await first.clone().json().catch(() => null);
    if (!Array.isArray(firstRows) || firstRows.length < PAGE) return first; // everything fit in one page

    // More rows exist: read them all in a stable order.
    const ordered = new URL(url.toString());
    if (!ordered.searchParams.has("order")) ordered.searchParams.set("order", "id.asc");
    let src = ordered;
    let res = await get(src, 0);
    if (!res.ok) {
      src = url; // no id column to order by: page the plain query
      res = await get(src, 0);
    }
    const all: any[] = [];
    let rows: any = await res.clone().json();
    all.push(...rows);
    for (let from = PAGE; Array.isArray(rows) && rows.length === PAGE; from += PAGE) {
      const r = await get(src, from);
      if (!r.ok) break;
      rows = await r.json();
      if (!Array.isArray(rows)) break;
      all.push(...rows);
    }
    return new Response(JSON.stringify(all), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}
