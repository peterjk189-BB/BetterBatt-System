/** "Q1125" for an original quote, "Q1125-A" for its first revision. */
export function quoteLabel(p: { quote_number?: number | string | null; revision_letter?: string | null }) {
  return `Q${p.quote_number ?? ""}${p.revision_letter ? `-${p.revision_letter}` : ""}`;
}
