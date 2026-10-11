import { useEffect, useState } from "react";
import type { Article, IndexedSource, Person } from "./api";

/**
 * Knowledge map state: which group every document belongs to, who owns each
 * group, and the handovers between people. Kept in this browser per
 * organization until the API stores it (see README).
 */
export type Kind = "article" | "file" | "source";
export type MapDoc = {
  key: string;
  kind: Kind;
  id: string;
  title: string;
  detail: string;
  url?: string;
  authorId?: string | null;
  tokens: Set<string>;
};
export type Tone = "teal" | "iris" | "apricot";
export type Group = {
  id: string;
  name: string;
  ownerId?: string;
  tone: Tone;
  manual?: boolean;
  x?: number;
  y?: number;
};
export type Handover = {
  id: string;
  at: string;
  fromId?: string;
  toId: string;
  groups: string[];
  docs: number;
};
export type MapState = {
  groups: Group[];
  assign: Record<string, string>;
  pinned: Record<string, true>;
  history: Handover[];
};

const EMPTY: MapState = { groups: [], assign: {}, pinned: {}, history: [] };
const storeKey = (orgId: string) => "orgflow-map:" + orgId;
const EVENT = "orgflow:map";

export function readMap(orgId: string): MapState {
  try {
    const raw = localStorage.getItem(storeKey(orgId));
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}
export function writeMap(orgId: string, state: MapState) {
  try {
    localStorage.setItem(storeKey(orgId), JSON.stringify(state));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: orgId }));
}
/** Live map state for an organization; every page using it stays in sync. */
export function useMapState(orgId: string) {
  const [state, setState] = useState(() => readMap(orgId));
  useEffect(() => {
    setState(readMap(orgId));
    const sync = (e: Event) => {
      if ((e as CustomEvent).detail === orgId) setState(readMap(orgId));
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [orgId]);
  const update = (next: MapState | ((s: MapState) => MapState)) => {
    const value = typeof next === "function" ? next(readMap(orgId)) : next;
    writeMap(orgId, value);
  };
  return [state, update] as const;
}

// Tokens -------------------------------------------------------------------------
const STOP = new Set(
  "a an and the of for to in on with by at from your our my is are this that it as be or new".split(" "),
);
export function tokens(...parts: (string | undefined | null)[]) {
  const out = new Set<string>();
  for (const word of parts.join(" ").toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 3 || STOP.has(word)) continue;
    out.add(word.length > 5 ? word.replace(/(ings?|ers?|s)$/, "") : word);
  }
  return out;
}
const PROVIDERS = /^(google drive|onedrive|sharepoint|gmail|drive)$/i;

type Source = {
  articles: Article[];
  files: any[];
  sources?: IndexedSource[];
  categories: { id: string; name: string }[];
};
export function buildDocs(data: Source): MapDoc[] {
  const category = (id: string) => data.categories.find((c) => c.id === id)?.name || "";
  return [
    ...data.articles.map((a) => ({
      key: "article:" + a.id,
      kind: "article" as const,
      id: a.id,
      title: a.title,
      detail: category(a.categoryId) || "Playbook",
      authorId: a.ownerId,
      tokens: tokens(a.title, category(a.categoryId)),
    })),
    ...data.files.map((f) => ({
      key: "file:" + f.id,
      kind: "file" as const,
      id: f.id,
      title: f.name,
      detail: [f.provider, f.orgflowPath || f.originalPath].filter(Boolean).join(" · "),
      url: f.url,
      tokens: tokens(
        f.name,
        String(f.orgflowPath || f.originalPath || "")
          .split("/")
          .filter((p: string) => !PROVIDERS.test(p))
          .join(" "),
      ),
    })),
    ...(data.sources || []).map((s) => ({
      key: "source:" + s.id,
      kind: "source" as const,
      id: s.id,
      title: s.title,
      detail: [s.provider, s.from].filter(Boolean).join(" · "),
      url: s.url,
      tokens: tokens(s.title, s.preview?.slice(0, 240)),
    })),
  ];
}

function folderOf(doc: MapDoc, files: any[]) {
  if (doc.kind !== "file") return null;
  const f = files.find((x) => x.id === doc.id);
  const parts = String(f?.orgflowPath || f?.originalPath || "")
    .split("/")
    .filter((p: string) => p && !PROVIDERS.test(p));
  return parts[0] || null;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const TONES: Tone[] = ["teal", "iris", "apricot"];

/**
 * Forms groups: one per category (seeded by its playbooks), then every other
 * document joins the group whose vocabulary it shares most, or a group named
 * after its folder. Hand-placed documents, hand-made groups, owners and
 * positions survive re-forming.
 */
export function formGroups(docs: MapDoc[], data: Source, prev: MapState): MapState {
  const prevGroup = (id: string) => prev.groups.find((g) => g.id === id);
  const groups: Group[] = [];
  const vocab = new Map<string, Set<string>>();
  const assign: Record<string, string> = {};
  const add = (id: string, name: string) => {
    if (!groups.some((g) => g.id === id)) {
      const old = prevGroup(id);
      groups.push({ tone: "teal", ...old, id, name: old?.name || name });
      vocab.set(id, new Set());
    }
    return id;
  };
  for (const g of prev.groups) if (g.manual) add(g.id, g.name);
  for (const c of data.categories) {
    add("cat:" + c.id, c.name);
    tokens(c.name).forEach((t) => vocab.get("cat:" + c.id)!.add(t));
  }
  for (const doc of docs) {
    const pinned = prev.pinned[doc.key] && prev.assign[doc.key];
    if (pinned && prevGroup(pinned)) {
      const g = prevGroup(pinned)!;
      add(g.id, g.name);
      assign[doc.key] = g.id;
    } else if (doc.kind === "article") {
      const a = data.articles.find((x) => x.id === doc.id);
      if (a?.categoryId && vocab.has("cat:" + a.categoryId)) assign[doc.key] = "cat:" + a.categoryId;
    }
    const gid = assign[doc.key];
    if (gid) doc.tokens.forEach((t) => vocab.get(gid)!.add(t));
  }
  for (const doc of docs) {
    if (assign[doc.key]) continue;
    let best = "",
      score = 0;
    for (const [gid, words] of vocab) {
      if (!words.size) continue;
      let hits = 0;
      doc.tokens.forEach((t) => words.has(t) && hits++);
      const s = hits / Math.sqrt(words.size);
      if (s > score) (best = gid), (score = s);
    }
    if (!best) {
      const folder = folderOf(doc, data.files);
      best = folder
        ? add("folder:" + slug(folder), folder)
        : add("inbox", doc.kind === "source" ? "Email & documents" : "Unsorted");
    }
    assign[doc.key] = best;
  }
  const used = groups.filter((g) => g.manual || Object.values(assign).includes(g.id));
  used.forEach((g, i) => {
    g.tone = TONES[i % TONES.length]!;
    if (!g.ownerId) {
      // Default owner: whoever owns most of the group's playbooks.
      const counts = new Map<string, number>();
      for (const doc of docs)
        if (assign[doc.key] === g.id && doc.authorId)
          counts.set(doc.authorId, (counts.get(doc.authorId) || 0) + 1);
      g.ownerId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    }
  });
  return { ...prev, groups: used, assign };
}

/** Documents a person holds through the groups they own. */
export function docsForPerson(state: MapState, docs: MapDoc[], personId: string) {
  const owned = new Set(state.groups.filter((g) => g.ownerId === personId).map((g) => g.id));
  return docs.filter((d) => owned.has(state.assign[d.key] ?? ""));
}

export const personName = (people: Person[], id?: string) =>
  people.find((p) => p.id === id)?.name;
