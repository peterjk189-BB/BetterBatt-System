/** "Lot 12, 5 Smith St, Brunswick" — the lot number goes first, without doubling up a "Lot" already typed. */
export function siteAddress(p: { lot_no?: string | null; address?: string | null; suburb?: string | null } | null | undefined) {
  if (!p) return "";
  const lot = p.lot_no?.trim();
  return [lot ? (/^lot\b/i.test(lot) ? lot : `Lot ${lot}`) : null, p.address, p.suburb].filter(Boolean).join(", ");
}

const SUFFIX: Record<string, string> = {
  street: "st", road: "rd", avenue: "ave", drive: "dr", court: "ct", crescent: "cres", place: "pl", boulevard: "blvd",
  highway: "hwy", parade: "pde", terrace: "tce", lane: "ln", close: "cl", circuit: "cct", grove: "gr",
};

/** A forgiving key for matching the same street address typed two ways ("7 Baker Street" = "7 baker st."). */
export function addressKey(address: string | null | undefined) {
  const first = (address || "").split(",")[0].toLowerCase().replace(/^\s*lot\s*\d+[a-z]?\s*[,/-]?\s*/, "");
  return first
    .replace(/[^a-z0-9\s/]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIX[w] || w)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

const sub = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

/** True when a visit's address and a quote's address are the same place (suburb only has to agree when both are filled in). */
export function sameSite(
  a: { address?: string | null; suburb?: string | null },
  b: { address?: string | null; suburb?: string | null }
) {
  const ka = addressKey(a.address);
  if (ka.length < 4 || ka !== addressKey(b.address)) return false;
  const sa = sub(a.suburb);
  const sb = sub(b.suburb);
  return !sa || !sb || sa === sb;
}
