/**
 * Knowledge health: where the organization's memory is thin, stale, or concentrated in a person
 * who is leaving. Also builds the gap-driven interview plan and the factual handoff outline.
 * Pure functions over plain records, so they are testable without a store.
 */
type Item = Record<string, any>;

export const REVIEW_DAYS = () => Number(process.env.REVIEW_INTERVAL_DAYS || 90);
const DAY = 86400000;
const LEAVING_WINDOW_DAYS = 60;

export const isPublished = (a: Item) => a.publishedContent !== undefined || a.status === "published";

export function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Item;
  if (typeof n.text === "string") return n.text;
  const inner = (Array.isArray(n.content) ? n.content : []).map(plainText);
  return ["paragraph", "heading", "listItem", "taskItem"].includes(n.type)
    ? inner.join("") + "\n"
    : inner.join("");
}
const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Lines under a heading matching `heading`, up to the next heading. */
export function sectionLines(doc: unknown, heading: RegExp): string[] {
  const blocks: Item[] = Array.isArray((doc as Item)?.content) ? (doc as Item).content : [];
  const out: string[] = [];
  let inside = false;
  for (const block of blocks) {
    if (block.type === "heading") {
      inside = heading.test(plainText(block));
      continue;
    }
    if (inside)
      out.push(
        ...(["orderedList", "bulletList", "taskList"].includes(block.type)
          ? (block.content ?? []).map((item: Item) => plainText(item).trim())
          : [plainText(block).trim()]
        ).filter(Boolean),
      );
  }
  return out;
}

/** The date an article is next due for human review. */
export function reviewDue(article: Item): Date | null {
  if (!isPublished(article)) return null;
  const explicit = article.reviewDueAt ? new Date(article.reviewDueAt) : null;
  if (explicit && !Number.isNaN(+explicit)) return explicit;
  const base = article.reviewedAt ?? article.publishedAt;
  const date = base ? new Date(base) : null;
  return date && !Number.isNaN(+date) ? new Date(+date + REVIEW_DAYS() * DAY) : null;
}

export function leavingSoon(person: Item | undefined, at = new Date()) {
  if (!person) return false;
  if (person.status === "leaving" || person.status === "left") return true;
  const when = person.leaveDate ? new Date(person.leaveDate) : null;
  return !!when && !Number.isNaN(+when) && +when - +at <= LEAVING_WINDOW_DAYS * DAY;
}

/** Cited sources whose indexed text changed after the draft captured them. */
export function changedSources(article: Item, index: Map<string, Item>) {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const source of [...(article.sources ?? []), ...(article.publishedSources ?? [])]) {
    if (!source?.id || seen.has(source.id) || !source.modifiedTime) continue;
    seen.add(source.id);
    const live = index.get(source.id);
    if (live?.updatedAt && +new Date(live.updatedAt) > +new Date(source.modifiedTime))
      out.push({ sourceId: source.id, title: source.title, url: source.url, modifiedTime: live.updatedAt });
  }
  return out;
}

export type HealthAction = {
  type: "interview" | "handoff" | "review" | "assign-owner" | "source-changed" | "publish";
  severity: "high" | "medium" | "low";
  text: string;
  personId?: string;
  articleId?: string;
};

export function computeHealth(input: {
  articles: Item[];
  people: Item[];
  sources?: Item[];
  now?: Date;
}) {
  const at = input.now ?? new Date();
  const index = new Map((input.sources ?? []).map((s) => [s.id, s]));
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const handoffIds = new Set(input.people.map((p) => p.handoffArticleId).filter(Boolean));
  const articles = input.articles.filter((a) => !handoffIds.has(a.id));
  const published = articles.filter(isPublished);
  const drafts = articles.filter((a) => !isPublished(a));

  const stale: Item[] = [];
  const dueSoon: Item[] = [];
  for (const article of published) {
    const due = reviewDue(article);
    if (!due) continue;
    const entry = {
      articleId: article.id,
      title: article.publishedTitle || article.title,
      ownerId: article.ownerId,
      dueAt: due.toISOString(),
      daysOverdue: Math.max(Math.floor((+at - +due) / DAY), 0),
    };
    if (due <= at) stale.push(entry);
    else if (+due - +at <= 30 * DAY) dueSoon.push(entry);
  }
  const unowned = articles
    .filter((a) => !a.ownerId || !peopleById.has(a.ownerId))
    .map((a) => ({ articleId: a.id, title: a.publishedTitle || a.title, published: isPublished(a) }));
  const stuckDrafts = drafts
    .map((a) => ({
      articleId: a.id,
      title: a.title,
      ageDays: Math.floor((+at - +new Date(a.updatedAt || at)) / DAY),
    }))
    .filter((a) => a.ageDays >= 14);
  const sourceChanged = articles
    .map((a) => ({ articleId: a.id, title: a.title, sources: changedSources(a, index) }))
    .filter((a) => a.sources.length);
  const ungrounded = articles
    .filter((a) => Array.isArray(a.evidence) && a.evidence.length)
    .map((a) => ({
      articleId: a.id,
      title: a.title,
      verified: a.evidence.filter((e: Item) => e.verified).length,
      total: a.evidence.length,
    }))
    .filter((a) => a.verified < a.total);

  const staleBy = new Map<string, number>();
  for (const entry of stale)
    if (entry.ownerId) staleBy.set(entry.ownerId, (staleBy.get(entry.ownerId) ?? 0) + 1);

  const peopleRows = input.people.map((person) => {
    const owned = articles.filter((a) => a.ownerId === person.id);
    const ownedPublished = owned.filter(isPublished);
    const leaving = leavingSoon(person, at);
    const handoff = person.handoffArticleId
      ? input.articles.find((a) => a.id === person.handoffArticleId)
      : undefined;
    const reasons: { severity: "high" | "medium"; text: string }[] = [];
    if (leaving)
      reasons.push({
        severity: "high",
        text: person.status === "left" ? `${person.name} has left.` : `${person.name} is leaving.`,
      });
    if (leaving && !handoff)
      reasons.push({ severity: "high", text: "No handoff guide exists yet." });
    if (leaving && handoff && !isPublished(handoff))
      reasons.push({ severity: "medium", text: "The handoff guide is not yet reviewed and published." });
    if (leaving && !person.successorId)
      reasons.push({ severity: "medium", text: "No successor is assigned." });
    if (!ownedPublished.length)
      reasons.push({
        severity: leaving ? "high" : "medium",
        text: "They own no published process, so their knowledge is undocumented.",
      });
    const staleCount = staleBy.get(person.id) ?? 0;
    if (staleCount)
      reasons.push({ severity: "medium", text: `${staleCount} of their processes are overdue for review.` });
    return {
      personId: person.id,
      name: person.name,
      role: person.role,
      status: person.status,
      leaveDate: person.leaveDate,
      published: ownedPublished.length,
      drafts: owned.length - ownedPublished.length,
      stale: staleCount,
      hasHandoff: !!handoff,
      leaving,
      risk: reasons.some((r) => r.severity === "high")
        ? ("high" as const)
        : reasons.length
          ? ("medium" as const)
          : ("low" as const),
      reasons: reasons.map((r) => r.text),
    };
  });

  const actions: HealthAction[] = [];
  for (const row of peopleRows.filter((r) => r.risk === "high")) {
    actions.push({
      type: "interview",
      severity: "high",
      text: `Run a handoff interview with ${row.name}${row.role ? ` (${row.role})` : ""}.`,
      personId: row.personId,
    });
    if (!row.hasHandoff)
      actions.push({
        type: "handoff",
        severity: "high",
        text: `Create a handoff guide for ${row.name}.`,
        personId: row.personId,
      });
  }
  for (const entry of stale.slice(0, 6))
    actions.push({
      type: "review",
      severity: entry.daysOverdue > 90 ? "high" : "medium",
      text: `Review “${entry.title}” — overdue by ${entry.daysOverdue} day(s).`,
      articleId: entry.articleId,
    });
  for (const entry of sourceChanged.slice(0, 5))
    actions.push({
      type: "source-changed",
      severity: "medium",
      text: `A source behind “${entry.title}” changed. Check the process is still accurate.`,
      articleId: entry.articleId,
    });
  for (const entry of unowned.filter((u) => u.published).slice(0, 5))
    actions.push({
      type: "assign-owner",
      severity: "low",
      text: `Assign an owner to “${entry.title}”.`,
      articleId: entry.articleId,
    });
  for (const entry of stuckDrafts.slice(0, 4))
    actions.push({
      type: "publish",
      severity: "low",
      text: `“${entry.title}” has been a draft for ${entry.ageDays} days. Review and publish, or discard.`,
      articleId: entry.articleId,
    });
  const order = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => order[a.severity] - order[b.severity]);

  const total = articles.length;
  let score = 100;
  if (!total) score = 0;
  else {
    // Nothing approved yet can never read as healthy, however tidy the drafts are.
    if (!published.length) score = Math.min(score, 30);
    score -= Math.round((unowned.length / total) * 20);
    score -= Math.round((stale.length / Math.max(published.length, 1)) * 25);
    if (peopleRows.length) {
      const covered = peopleRows.filter((r) => r.published > 0).length / peopleRows.length;
      score -= Math.round((1 - covered) * 30);
    } else score -= 15;
    score -= Math.min(peopleRows.filter((r) => r.risk === "high").length * 10, 30);
    score -= Math.min(sourceChanged.length * 3, 10);
    score = Math.max(0, Math.min(100, score));
  }
  return {
    generatedAt: at.toISOString(),
    score,
    totals: {
      published: published.length,
      drafts: drafts.length,
      unowned: unowned.length,
      stale: stale.length,
      dueSoon: dueSoon.length,
      sourceChanged: sourceChanged.length,
      ungrounded: ungrounded.length,
      people: peopleRows.length,
      peopleAtRisk: peopleRows.filter((r) => r.risk === "high").length,
    },
    people: peopleRows,
    stale,
    dueSoon,
    unowned,
    stuckDrafts,
    sourceChanged,
    ungrounded,
    actions: actions.slice(0, 20),
  };
}

// ---- Interviews ------------------------------------------------------------------------------

export const INTERVIEW_QUESTIONS = [
  "In your own words, what is your role responsible for, and what does success look like?",
  "What do you do every day, every week, every month, and every year?",
  "Which tasks would hurt the organization most if they were missed, and when do they fall due?",
  "Which tools, accounts and files do you rely on, and who else has access?",
  "Who are the people or organizations you depend on most, and what should a newcomer know about them?",
  "What is half-finished or promised to someone right now?",
  "What do people usually get wrong when they take over this work?",
];

export type Gap = { kind: string; articleId?: string; text: string };

/** What is undocumented, unreviewed or unresolved for a person's work. */
export function gapsFor(person: Item, articles: Item[], sources: Item[] = [], at = new Date()): Gap[] {
  const index = new Map(sources.map((s) => [s.id, s]));
  const owned = articles.filter((a) => a.ownerId === person.id && a.id !== person.handoffArticleId);
  const gaps: Gap[] = [];
  if (!owned.length)
    gaps.push({
      kind: "undocumented",
      text: `No processes are documented for ${person.name}. List the recurring responsibilities of ${person.role || "this role"} and how often each happens.`,
    });
  for (const article of owned) {
    const title = article.publishedTitle || article.title;
    if (!isPublished(article))
      gaps.push({
        kind: "unpublished",
        articleId: article.id,
        text: `“${title}” is still an unreviewed draft. Walk me through how this process really runs, step by step.`,
      });
    const due = reviewDue(article);
    if (due && due <= at)
      gaps.push({
        kind: "stale",
        articleId: article.id,
        text: `“${title}” is overdue for review. What has changed since it was written?`,
      });
    for (const line of sectionLines(article.content, /review questions?|open questions?/i).slice(0, 3))
      gaps.push({ kind: "open-question", articleId: article.id, text: `Open question in “${title}”: ${line}` });
    const count = words(plainText(article.publishedContent ?? article.content));
    if (count > 0 && count < 60)
      gaps.push({ kind: "thin", articleId: article.id, text: `“${title}” is only ${count} words. What detail is missing?` });
    if (changedSources(article, index).length)
      gaps.push({
        kind: "source-changed",
        articleId: article.id,
        text: `A document behind “${title}” changed after it was captured. What is different now?`,
      });
    for (const conflict of (article.conflicts ?? []).slice(0, 2))
      gaps.push({
        kind: "conflict",
        articleId: article.id,
        text: `Sources disagree about ${conflict.topic} in “${title}”: ${conflict.note} Which is right?`,
      });
  }
  return gaps;
}

/** The question plan and the instructions handed to the live voice agent. */
export function interviewPlan(person: Item, articles: Item[], sources: Item[] = [], at = new Date()) {
  const gaps = gapsFor(person, articles, sources, at);
  const questions = [
    ...gaps.slice(0, 8).map((g, i) => ({ id: `gap-${i}`, text: g.text, origin: "gap", articleId: g.articleId })),
    ...INTERVIEW_QUESTIONS.map((text, i) => ({ id: `tpl-${i}`, text, origin: "template" })),
  ];
  const agentBrief = [
    `You are conducting a knowledge-capture interview with ${person.name}${person.role ? `, ${person.role}` : ""}.`,
    "Ask ONE question at a time and wait for the answer. When an answer is vague, ask a short follow-up (who, when, which tool or file, what goes wrong). Move on once a topic is clear. Never invent facts; if the person does not know, note it as an open item. Be professional and concise.",
    "Interview plan, in priority order:",
    ...questions.map((q, i) => `${i + 1}. ${q.text}`),
    "Close by summarising what was captured and listing what is still unknown.",
  ].join("\n");
  return {
    title: `Handoff interview — ${person.name}`,
    gapCount: gaps.length,
    questions,
    agentBrief,
  };
}

// ---- Handoff outline -------------------------------------------------------------------------

export type Section = { heading: string; paragraphs?: string[]; steps?: string[] };
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

/** Facts-only handoff sections: every line traces to a record, no model involved. */
export function outlineSections(input: {
  person: Item;
  successor: Item | null;
  articles: Item[];
  sources?: Item[];
  at?: Date;
}): Section[] {
  const at = input.at ?? new Date();
  const { person, successor } = input;
  const owned = input.articles.filter((a) => a.ownerId === person.id && a.id !== person.handoffArticleId);
  const sections: Section[] = [
    {
      heading: "Role summary",
      paragraphs: [
        `${person.name}${person.role ? ` — ${person.role}` : ""}.`,
        `Status: ${person.status}${person.leaveDate ? `; last day ${person.leaveDate}` : ""}.`,
        `Successor: ${successor ? successor.name : "not yet assigned"}.`,
      ],
    },
    owned.length
      ? {
          heading: "Processes they own",
          steps: owned.map(
            (a) =>
              `${a.publishedTitle || a.title} — ${isPublished(a) ? "published" : "draft, not yet reviewed"}; next review ${day(reviewDue(a))}.`,
          ),
        }
      : {
          heading: "Processes they own",
          paragraphs: ["No documented processes are assigned yet. Capture them before the handoff."],
        },
  ];
  const gaps = gapsFor(person, input.articles, input.sources ?? [], at);
  sections.push({
    heading: "Needs attention before handoff",
    ...(gaps.length
      ? { steps: gaps.map((g) => g.text) }
      : { paragraphs: ["No open gaps were detected in the documented processes."] }),
  });
  const links = new Map<string, string>();
  for (const a of owned)
    for (const s of a.publishedSources ?? a.sources ?? [])
      if (s?.url && s?.title) links.set(s.url, `${s.title} — ${s.url}`);
  if (links.size) sections.push({ heading: "Source documents", paragraphs: [...links.values()].slice(0, 20) });
  sections.push({
    heading: "First 30 days for the successor",
    steps: [
      "Week 1: read each process above and note anything unclear; sit with the outgoing person if possible.",
      "Week 2: shadow or run each recurring process once with the previous owner or a colleague nearby.",
      "Week 3: confirm contacts, accounts and access for every tool mentioned in the processes.",
      "Week 4: review each process, correct what is out of date, and mark it reviewed in OrgFlow.",
    ],
  });
  return sections;
}

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
/** Convert sections to a rich-text document. */
export function sectionsToDoc(sections: Section[]) {
  const nodes: Item[] = [];
  for (const section of sections) {
    nodes.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: section.heading }] });
    if (section.paragraphs) nodes.push(...section.paragraphs.map(paragraph));
    if (section.steps)
      nodes.push({
        type: "orderedList",
        content: section.steps.map((text) => ({ type: "listItem", content: [paragraph(text)] })),
      });
  }
  return { type: "doc", content: nodes };
}
