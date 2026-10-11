/** Keyword retrieval (BM25) over indexed source text and articles. Small enough to compute per request. */

const STOP = new Set(
  "a an and are as at be by for from has have how i in is it its of on or our that the this to was we what when where which who why will with you your do does did can should would".split(" "),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [])
    .map((t) => t.replace(/'s$/, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/** Returns the `k` best-matching items for `query`, best first, dropping items with no match. */
export function rank<T>(query: string, items: T[], text: (item: T) => string, k: number): T[] {
  const q = [...new Set(tokens(query))];
  if (!q.length || !items.length) return [];
  const docs = items.map((item) => {
    const counts = new Map<string, number>();
    const words = tokens(text(item));
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    return { item, counts, length: words.length };
  });
  const avg = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;
  const df = new Map(q.map((t) => [t, docs.filter((d) => d.counts.has(t)).length]));
  const k1 = 1.4, b = 0.75;
  return docs
    .map((d) => {
      let score = 0;
      for (const t of q) {
        const f = d.counts.get(t) ?? 0;
        if (!f) continue;
        const n = df.get(t)!;
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
      }
      return { item: d.item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.item);
}

/** Splits text into overlapping chunks on paragraph or sentence boundaries where possible. */
export function chunk(text: string, size = 1500, overlap = 200): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const window = clean.slice(start + size * 0.6, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (cut > 0) end = start + Math.floor(size * 0.6) + cut + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}
