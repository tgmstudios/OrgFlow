/**
 * Verbatim-quote verification for model citations. The model must quote its sources; the server
 * checks each quote against the text that was actually supplied and records `verified`. This
 * proves a quote exists in a source, not that the model's claim follows from it.
 */
type Item = Record<string, any>;

export type Evidence = {
  sourceId: string;
  title: string;
  quote: string;
  supports: string;
  verified: boolean;
};
export type Conflict = { topic: string; sourceIds: string[]; note: string };

export const EVIDENCE_RULES =
  `Also return "evidence":[{"sourceId":"known source ID","quote":"exact verbatim excerpt of at most 240 characters copied from that source's text","supports":"the claim or step this excerpt supports"}] and "conflicts":[{"topic":"short topic","sourceIds":["known source ID"],"note":"how the sources disagree"}]. Evidence quotes must be copied verbatim from a supplied source's text; never paraphrase or invent a quote, and omit evidence rather than guess. Give at most 12 evidence items covering the most important factual claims. If sources disagree, list the disagreement under conflicts and add a review question instead of silently choosing one.`;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** True when every fragment of the quote (split on ellipses) appears verbatim in the source. */
export function quoteAppears(quote: string, sourceText: string): boolean {
  const haystack = normalize(sourceText);
  const fragments = quote
    .split(/…|\.{3}/)
    .map(normalize)
    .filter((fragment) => fragment.length >= 8);
  return fragments.length > 0 && fragments.every((fragment) => haystack.includes(fragment));
}

export function parseEvidence(raw: unknown, sources: Item[]): Evidence[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(sources.map((source) => [String(source.id), source]));
  const out: Evidence[] = [];
  for (const item of raw.slice(0, 12)) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.sourceId !== "string" ||
      typeof item.quote !== "string" ||
      !item.quote.trim()
    )
      continue;
    const source = byId.get(item.sourceId);
    const quote = item.quote.trim().slice(0, 400);
    out.push({
      sourceId: item.sourceId.slice(0, 200),
      title: source ? String(source.title ?? item.sourceId).slice(0, 240) : "Unknown source",
      quote,
      supports: typeof item.supports === "string" ? item.supports.slice(0, 400) : "",
      verified: !!source && typeof source.text === "string" && quoteAppears(quote, source.text),
    });
  }
  return out;
}

export function parseConflicts(raw: unknown, allowed: Set<string>): Conflict[] {
  if (!Array.isArray(raw)) return [];
  const out: Conflict[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object" || typeof item.note !== "string" || !item.note.trim())
      continue;
    out.push({
      topic: typeof item.topic === "string" ? item.topic.slice(0, 200) : "Conflict",
      sourceIds: Array.isArray(item.sourceIds)
        ? item.sourceIds.filter((id: unknown): id is string => typeof id === "string" && allowed.has(id))
        : [],
      note: item.note.slice(0, 600),
    });
  }
  return out;
}

export const grounding = (evidence: Evidence[]) => ({
  verified: evidence.filter((e) => e.verified).length,
  total: evidence.length,
});
