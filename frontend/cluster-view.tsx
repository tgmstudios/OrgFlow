import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileText,
  LoaderCircle,
  Mail,
  Sparkles,
  X,
} from "lucide-react";
import { api, fullDate, type Article, type IndexedSource, type Person } from "./api";
import { AnimatePresence, ease, m, prefersReducedMotion } from "./motion";

/*
 * Interactive cluster view of the knowledge map: one cluster per person around
 * the organization, plus "Unassigned". Membership is the recorded owner
 * (article.ownerId, source.ownerId); nothing is inferred. Dragging a document
 * onto a cluster reassigns it, dropping a cluster on another hands everything
 * over. Every change goes through the API.
 */
const W = 980,
  H = 640,
  CX = W / 2,
  CY = H / 2;
const NONE = "unassigned";
type Pt = { x: number; y: number };
type Tone = "teal" | "iris" | "apricot" | "muted";
type Doc = {
  key: string;
  kind: "article" | "source";
  id: string;
  title: string;
  detail: string;
  url?: string;
  ownerId: string;
  published: boolean;
};
type Cluster = { id: string; name: string; person?: Person; tone: Tone };
type Drag = { type: "doc" | "cluster"; key: string; start: Pt; offset: Pt; at: Pt; moved: boolean };
type Selection = { type: "cluster" | "doc"; id: string } | null;
type Move = { from: string; to: string; keys: string[] };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const initials = (name = "") =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const curve = (a: Pt, b: Pt, bend: number) => {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} Q ${mx - (b.y - a.y) * bend} ${my + (b.x - a.x) * bend} ${b.x} ${b.y}`;
};
const TONES: Tone[] = ["teal", "iris", "apricot"];

// Approximate on-stage boxes (half sizes), so items can be kept clear of cards and of each other.
const CARD = { w: 88, h: 60 },
  ROOT = { w: 88, h: 56 };
const chip = (d: Doc) => {
  const w = Math.min(176, 44 + d.title.length * 6.4);
  return { w: w / 2 + 6, h: (w >= 176 && d.title.length > 24 ? 22 : 15) + 6 };
};

function layout(clusters: Cluster[], members: Map<string, Doc[]>, pinned: Record<string, Pt>) {
  const pos: Record<string, Pt> = { root: { x: CX, y: CY } };
  const n = clusters.length;
  const free: { key: string; half: Pt; owner: Pt }[] = [];
  clusters.forEach((c, i) => {
    const a = -Math.PI / 2 + Math.PI / Math.max(n, 1) + (i / Math.max(n, 1)) * Math.PI * 2;
    const p = pinned[c.id] ?? { x: CX + 320 * Math.cos(a), y: CY + 196 * Math.sin(a) };
    const at = (pos[c.id] = { x: clamp(p.x, 110, W - 110), y: clamp(p.y, 80, H - 80) });
    const docs = members.get(c.id) || [];
    const k = docs.length;
    const out = Math.atan2(at.y - CY, at.x - CX) || 0;
    const spread = Math.min(Math.PI * 1.5, k * 0.7);
    docs.forEach((d, j) => {
      const da = k === 1 ? out : out - spread / 2 + (spread * (j + 0.5)) / k;
      const half = chip(d);
      // Ellipse wide enough that a chip pointing sideways clears the card.
      const rx = CARD.w + half.w + 14,
        ry = CARD.h + half.h + 16;
      pos[d.key] = pinned[d.key] ?? { x: at.x + rx * Math.cos(da), y: at.y + ry * Math.sin(da) };
      if (!pinned[d.key]) free.push({ key: d.key, half, owner: at });
    });
  });
  // Relax: push unpinned items out of cards, the root, other items and the frame edges.
  const solid = [{ at: pos.root!, half: { x: ROOT.w, y: ROOT.h } }].concat(
    clusters.map((c) => ({ at: pos[c.id]!, half: { x: CARD.w, y: CARD.h } })),
  );
  for (let step = 0; step < 240; step++) {
    let moved = false;
    for (const f of free) {
      const p = pos[f.key]!;
      const push = (o: Pt, hx: number, hy: number, share: number, stack = false) => {
        const dx = p.x - o.x,
          dy = p.y - o.y;
        const ox = hx - Math.abs(dx),
          oy = hy - Math.abs(dy);
        if (ox <= 0 || oy <= 0) return false;
        // Resolve along the shallower axis, unless that would leave the frame; then go the other way.
        const sx = dx >= 0 ? 1 : -1,
          sy = dy >= 0 ? 1 : -1;
        const fitsX = (x: number) => x >= f.half.w + 8 && x <= W - f.half.w - 8;
        const fitsY = (y: number) => y >= f.half.h + 8 && y <= H - f.half.h - 8;
        const tx = p.x + sx * ox * share,
          ty = p.y + sy * oy * share;
        // Chips are wide: stack them vertically against each other unless they barely touch sideways.
        const horizontal = fitsX(tx) && (!fitsY(ty) || (stack ? ox < 10 : ox / hx < oy / hy));
        if (horizontal) p.x = tx;
        else if (fitsY(ty)) p.y = ty;
        else p.y += -sy * (2 * hy - oy) * share; // pinned against an edge: hop over to the other side
        return true;
      };
      for (const s of solid) moved = push(s.at, s.half.x + f.half.w, s.half.y + f.half.h, 1) || moved;
      for (const g of free)
        if (g !== f) moved = push(pos[g.key]!, g.half.w + f.half.w, g.half.h + f.half.h, 0.5, true) || moved;
      p.x = clamp(p.x, f.half.w + 8, W - f.half.w - 8);
      p.y = clamp(p.y, f.half.h + 8, H - f.half.h - 8);
    }
    if (!moved) break;
  }
  return pos;
}

export function ClusterView({
  articles,
  categories,
  sources,
  people,
  onRefresh,
  onOpenArticle,
  onOpenPerson,
}: {
  articles: Article[];
  categories: { id: string; name: string }[];
  sources: IndexedSource[];
  people: Person[];
  onRefresh: () => Promise<void> | void;
  onOpenArticle: (id: string) => void;
  onOpenPerson: (id: string) => void;
}) {
  const known = (id?: string | null) => (id && people.some((p) => p.id === id) ? id : NONE);
  const docs: Doc[] = useMemo(
    () => [
      ...articles.map((a) => ({
        key: "article:" + a.id,
        kind: "article" as const,
        id: a.id,
        title: a.title,
        detail: categories.find((c) => c.id === a.categoryId)?.name || "Playbook",
        ownerId: known(a.ownerId),
        published: a.status === "published",
      })),
      ...sources.map((s) => ({
        key: "source:" + s.id,
        kind: "source" as const,
        id: s.id,
        title: s.title,
        detail: [s.provider, s.from].filter(Boolean).join(" · "),
        url: s.url,
        ownerId: known(s.ownerId),
        published: false,
      })),
    ],
    [articles, sources, categories, people],
  );
  const clusters: Cluster[] = useMemo(() => {
    const list: Cluster[] = people.map((p, i) => ({
      id: p.id,
      name: p.name,
      person: p,
      tone: TONES[i % TONES.length]!,
    }));
    if (docs.some((d) => d.ownerId === NONE)) list.push({ id: NONE, name: "Unassigned", tone: "muted" });
    return list;
  }, [people, docs]);
  const members = useMemo(() => {
    const map = new Map<string, Doc[]>(clusters.map((c) => [c.id, []]));
    for (const d of docs) map.get(d.ownerId)?.push(d);
    return map;
  }, [clusters, docs]);

  const [pinned, setPinned] = useState<Record<string, Pt>>({});
  const [gathering, setGathering] = useState(false);
  const [wave, setWave] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      const next = e!.contentRect.width / W;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScale((s) => (Math.abs(s - next) > 0.001 ? next : s)));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice]);

  const live: Record<string, Pt> = { ...pinned };
  if (drag?.moved) live[drag.key] = drag.at;
  const pos = layout(clusters, members, live);
  const following = new Set<string>();
  if (drag?.moved) {
    following.add(drag.key);
    if (drag.type === "cluster") members.get(drag.key)?.forEach((d) => following.add(d.key));
  }

  /** Reassign documents through the API; published playbooks return to draft for re-approval. */
  async function assign(keys: string[], to: string) {
    const moving = docs.filter((d) => keys.includes(d.key) && d.ownerId !== to);
    if (!moving.length) return;
    setSaving(new Set(moving.map((d) => d.key)));
    try {
      for (const d of moving)
        await api(`/${d.kind === "article" ? "articles" : "sources"}/${d.id}`, "PATCH", {
          ownerId: to === NONE ? null : to,
        });
      await onRefresh();
      const name = to === NONE ? "Unassigned" : people.find((p) => p.id === to)?.name;
      setNotice({
        ok: true,
        text:
          moving.length === 1
            ? `Moved “${moving[0]!.title}” to ${name}.`
            : `Handed ${moving.length} items to ${name}.`,
      });
    } catch (e: any) {
      setNotice({ ok: false, text: e.message });
      await onRefresh();
    } finally {
      setSaving(new Set());
    }
  }

  function point(e: React.PointerEvent): Pt {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  function nearest(at: Pt, except?: string) {
    let best: Cluster | null = null,
      dist = 92;
    for (const c of clusters) {
      if (c.id === except) continue;
      const d = Math.hypot(pos[c.id]!.x - at.x, pos[c.id]!.y - at.y);
      if (d < dist) (best = c), (dist = d);
    }
    return best;
  }
  function down(e: React.PointerEvent, type: Drag["type"], key: string) {
    if (e.button !== 0 || saving.size) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = point(e),
      at = pos[key]!;
    setDrag({ type, key, start: p, offset: { x: p.x - at.x, y: p.y - at.y }, at, moved: false });
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const p = point(e);
    const at = { x: p.x - drag.offset.x, y: p.y - drag.offset.y };
    const moved = drag.moved || Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4;
    setDrag({ ...drag, at, moved });
    const own = drag.type === "doc" ? docs.find((d) => d.key === drag.key)?.ownerId : drag.key;
    const target = nearest(at, own);
    // Only a person can receive a whole cluster.
    setHot(target && !(drag.type === "cluster" && target.id === NONE) ? target.id : null);
  }
  function up() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setHot(null);
    if (!d.moved) return setSelection({ type: d.type, id: d.key });
    if (d.type === "doc") {
      const doc = docs.find((x) => x.key === d.key)!;
      const target = nearest(d.at, doc.ownerId);
      if (target) void assign([doc.key], target.id);
      return;
    }
    const target = nearest(d.at, d.key);
    if (target && target.id !== NONE) {
      const keys = (members.get(d.key) || []).map((x) => x.key);
      if (keys.length) setMove({ from: d.key, to: target.id, keys });
      return;
    }
    setPinned((p) => ({ ...p, [d.key]: { x: clamp(d.at.x, 120, W - 120), y: clamp(d.at.y, 90, H - 90) } }));
  }
  function reform() {
    if (prefersReducedMotion()) return setPinned({});
    setGathering(true);
    setTimeout(() => {
      setPinned({});
      setWave((w) => w + 1);
      setGathering(false);
    }, 420);
  }

  const leaving = clusters.filter(
    (c) => c.person && c.person.status !== "active" && (members.get(c.id)?.length || 0) > 0,
  );
  const traveling = new Set(move?.keys ?? [...saving]);
  const spot = move ? new Set([move.from, move.to]) : null;
  const dim = (clusterId: string) => !!spot && !spot.has(clusterId);
  const instant = prefersReducedMotion();
  const spring = (key: string, i: number) =>
    following.has(key) || instant
      ? { duration: 0 }
      : {
          type: "spring" as const,
          duration: gathering ? 0.38 : 0.7,
          bounce: gathering ? 0 : 0.22,
          delay: gathering ? 0 : Math.min(i * 0.035, 0.5),
        };
  const at = (key: string) => (gathering ? { x: CX, y: CY } : pos[key] ?? { x: CX, y: CY });
  const selectedDoc = selection?.type === "doc" ? docs.find((d) => d.key === selection.id) : undefined;
  const selectedCluster = selection?.type === "cluster" ? clusters.find((c) => c.id === selection.id) : undefined;

  return (
    <>
      <AnimatePresence initial={false}>
        {leaving.map((c) => {
          const p = c.person!,
            count = members.get(c.id)!.length,
            to = people.find((x) => x.id === p.successorId);
          return (
            <m.div
              key={c.id}
              className="cl-alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.24, ease: ease.out }}
            >
              <span className="glow-dot warn" />
              <div>
                <strong>
                  {p.name} {p.status === "left" ? "has left" : "is leaving"}
                  {p.leaveDate && p.status !== "left" && " " + fullDate(p.leaveDate)}
                </strong>
                <small>
                  {count} {count === 1 ? "item" : "items"} still owned by them
                </small>
              </div>
              {to ? (
                <button
                  className="primary compact"
                  onClick={() =>
                    setMove({ from: c.id, to: to.id, keys: members.get(c.id)!.map((d) => d.key) })
                  }
                >
                  Hand over to {to.name.split(" ")[0]} <ArrowRight size={14} />
                </button>
              ) : (
                <button className="ghost" onClick={() => onOpenPerson(p.id)}>
                  Choose a successor
                </button>
              )}
            </m.div>
          );
        })}
      </AnimatePresence>

      <div className="cl-layout">
        <div className="card cl-card">
          <div
            ref={frame}
            className={"cl-frame" + (drag?.moved ? " dragging" : "")}
            style={{ height: H * scale }}
            onPointerDown={() => setSelection(null)}
          >
            <div
              ref={stage}
              className="cl-stage"
              style={{ width: W, height: H, transform: `scale(${scale})` }}
              onPointerMove={moveDrag}
              onPointerUp={up}
              onPointerCancel={() => (setDrag(null), setHot(null))}
            >
              <svg className="cl-edges" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                <defs>
                  <linearGradient id="cl-thread" x1="0" x2="1">
                    <stop offset="0" stopColor="var(--teal)" />
                    <stop offset="0.55" stopColor="var(--iris)" />
                    <stop offset="1" stopColor="var(--apricot)" />
                  </linearGradient>
                </defs>
                {clusters.map((c, i) => (
                  <m.path
                    key={"e" + c.id}
                    className={"edge trunk" + (dim(c.id) ? " dim" : "")}
                    initial={{ d: curve(pos.root!, pos.root!, 0), pathLength: 0 }}
                    animate={{ d: curve(pos.root!, at(c.id), 0.12), pathLength: 1 }}
                    transition={spring(c.id, i)}
                  />
                ))}
                {docs.map((d, i) => (
                  <m.path
                    key={"e" + d.key}
                    className={
                      "edge twig tone-" +
                      (clusters.find((c) => c.id === d.ownerId)?.tone || "muted") +
                      (dim(d.ownerId) ? " dim" : "") +
                      (traveling.has(d.key) ? " flowing" : "")
                    }
                    initial={{ d: curve(pos.root!, pos.root!, 0) }}
                    animate={{ d: curve(at(d.ownerId), at(d.key), 0.1) }}
                    transition={spring(d.key, i + clusters.length)}
                  />
                ))}
              </svg>

              {clusters.map((c, i) => {
                const k = members.get(c.id)?.length || 0;
                const size = 2 * (122 + Math.max(0, k - 4) * 10) + 90;
                return (
                  <m.span
                    key={"cloud" + c.id + wave}
                    className={"cl-cloud tone-" + c.tone + (dim(c.id) ? " dim" : "")}
                    style={{ width: size, height: size * 0.8, marginLeft: -size / 2, marginTop: -size * 0.4 }}
                    initial={{ x: CX, y: CY, scale: 0.2, opacity: 0 }}
                    animate={{ ...at(c.id), scale: gathering ? 0.2 : 1, opacity: gathering || !k ? 0 : 1 }}
                    transition={spring(c.id, i)}
                  />
                );
              })}

              <m.div
                className="cl-pos"
                initial={{ x: CX, y: CY, scale: 0.6, opacity: 0 }}
                animate={{ x: CX, y: CY, scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.6, bounce: 0.25 }}
              >
                <div className="cl-root">
                  <span className="cl-root-mark" />
                  <strong>Your organization</strong>
                  <small>
                    {docs.length} items · {people.length} people
                  </small>
                </div>
              </m.div>

              {clusters.map((c, i) => {
                const count = members.get(c.id)?.length || 0;
                return (
                  <m.div
                    key={c.id}
                    className="cl-pos"
                    style={{ zIndex: drag?.key === c.id ? 6 : 3 }}
                    initial={{ x: CX, y: CY, scale: 0.4, opacity: 0 }}
                    animate={{ ...at(c.id), scale: gathering ? 0.4 : 1, opacity: gathering ? 0 : 1 }}
                    transition={spring(c.id, i)}
                  >
                    <div
                      className={
                        "cl-cluster tone-" +
                        c.tone +
                        (hot === c.id ? " hot" : "") +
                        (selection?.id === c.id ? " selected" : "") +
                        (dim(c.id) ? " dim" : "") +
                        (move?.from === c.id ? " leaving" : "") +
                        (move?.to === c.id ? " receiving" : "")
                      }
                      onPointerDown={(e) => down(e, "cluster", c.id)}
                    >
                      {c.person ? (
                        <span className={"cl-avatar" + (c.person.status !== "active" ? " warn" : "")}>
                          {initials(c.name)}
                        </span>
                      ) : (
                        <span className="cl-avatar none">?</span>
                      )}
                      <strong>{c.name}</strong>
                      {c.person?.role && <span className="cl-role">{c.person.role}</span>}
                      <small>
                        {count} {count === 1 ? "item" : "items"}
                      </small>
                    </div>
                  </m.div>
                );
              })}

              {docs.map((d, i) => {
                const Icon = d.kind === "article" ? BookOpen : /gmail/i.test(d.detail) ? Mail : FileText;
                return (
                  <m.div
                    key={d.key}
                    className="cl-pos"
                    style={{ zIndex: drag?.key === d.key ? 7 : 4 }}
                    initial={{ x: CX, y: CY, scale: 0.3, opacity: 0 }}
                    animate={{ ...at(d.key), scale: gathering ? 0.3 : 1, opacity: gathering ? 0 : 1 }}
                    transition={spring(d.key, i + clusters.length)}
                  >
                    <div
                      className={
                        "cl-doc kind-" +
                        d.kind +
                        (selection?.id === d.key ? " selected" : "") +
                        (drag?.key === d.key && drag.moved ? " lifted" : "") +
                        (dim(d.ownerId) ? " dim" : "") +
                        (traveling.has(d.key) ? " traveling" : "")
                      }
                      onPointerDown={(e) => down(e, "doc", d.key)}
                    >
                      <span className="cl-doc-icon">
                        {saving.has(d.key) ? <LoaderCircle size={12} className="spin" /> : <Icon size={13} />}
                      </span>
                      <span className="cl-doc-title">{d.title}</span>
                    </div>
                  </m.div>
                );
              })}
            </div>
            {!docs.length && (
              <p className="cl-empty">Add a playbook or index a source to start the map.</p>
            )}
          </div>
          <div className="cl-legend">
            <span>Drag an item onto a person to reassign it · drop a person onto another to hand everything over</span>
            <button className="text-button" onClick={reform} disabled={gathering}>
              <Sparkles size={14} /> Re-form
            </button>
          </div>
        </div>

        <aside className="card cl-inspector">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={move ? "move" : selection ? selection.type + selection.id : "overview"}
              className="cl-inspector-body"
              initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(2px)", transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: ease.out }}
            >
              {move ? (
                <HandoverPanel
                  move={move}
                  docs={docs}
                  people={people}
                  busy={saving.size > 0}
                  onTarget={(to) => setMove({ ...move, to })}
                  onCancel={() => setMove(null)}
                  onConfirm={async () => {
                    await assign(move.keys, move.to);
                    setSelection({ type: "cluster", id: move.to });
                    setMove(null);
                  }}
                />
              ) : selectedDoc ? (
                <>
                  <p className="meta-label">{selectedDoc.kind === "article" ? "Playbook" : "Indexed source"}</p>
                  <h2 className="cl-title">{selectedDoc.title}</h2>
                  <p className="section-sub">{selectedDoc.detail}</p>
                  <label className="field">
                    Owner
                    <select
                      value={selectedDoc.ownerId === NONE ? "" : selectedDoc.ownerId}
                      disabled={saving.size > 0}
                      onChange={(e) => void assign([selectedDoc.key], e.target.value || NONE)}
                    >
                      <option value="">Unassigned</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedDoc.kind === "article" ? (
                    <button className="text-button" onClick={() => onOpenArticle(selectedDoc.id)}>
                      Open playbook <ArrowUpRight size={14} />
                    </button>
                  ) : selectedDoc.url ? (
                    <a className="text-button" href={selectedDoc.url} target="_blank" rel="noreferrer">
                      Open original <ArrowUpRight size={14} />
                    </a>
                  ) : null}
                </>
              ) : selectedCluster ? (
                <>
                  <p className="meta-label">{selectedCluster.person ? "Person" : "Needs an owner"}</p>
                  <h2 className="cl-title">{selectedCluster.name}</h2>
                  {selectedCluster.person && (
                    <p className="section-sub">
                      {selectedCluster.person.role}
                      {selectedCluster.person.status !== "active" && (
                        <>
                          {" · "}
                          <span className="badge warn">
                            {selectedCluster.person.status === "left" ? "Left" : "Leaving"}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  <div className="cl-docs">
                    {(members.get(selectedCluster.id) || []).map((d) => (
                      <button key={d.key} onClick={() => setSelection({ type: "doc", id: d.key })}>
                        {d.kind === "article" ? <BookOpen size={14} /> : <FileText size={14} />}
                        <span>{d.title}</span>
                      </button>
                    ))}
                    {!members.get(selectedCluster.id)?.length && (
                      <p className="inline-note">Nothing owned yet. Drag items here.</p>
                    )}
                  </div>
                  {selectedCluster.person && (members.get(selectedCluster.id)?.length || 0) > 0 && (
                    <label className="field">
                      Hand everything over to
                      <select
                        value=""
                        onChange={(e) =>
                          e.target.value &&
                          setMove({
                            from: selectedCluster.id,
                            to: e.target.value,
                            keys: members.get(selectedCluster.id)!.map((d) => d.key),
                          })
                        }
                      >
                        <option value="">Choose a person…</option>
                        {people
                          .filter((p) => p.id !== selectedCluster.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.id === selectedCluster.person!.successorId ? " (successor)" : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {selectedCluster.person && (
                    <button className="text-button" onClick={() => onOpenPerson(selectedCluster.id)}>
                      {selectedCluster.person.status === "active" ? "Review knowledge & transfer" : "Continue handoff"}{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="meta-label">Overview</p>
                  <div className="cl-stats">
                    <span>
                      <b>{articles.length}</b> playbooks
                    </span>
                    <span>
                      <b>{sources.length}</b> sources
                    </span>
                    <span>
                      <b>{members.get(NONE)?.length || 0}</b> unowned
                    </span>
                  </div>
                  <p className="section-sub">
                    Each cluster is a person and what they own. Select a cluster or item for details;
                    drag to reassign.
                  </p>
                </>
              )}
            </m.div>
          </AnimatePresence>
        </aside>
      </div>
      <AnimatePresence>
        {notice && (
          <m.div
            className={"cl-toast" + (notice.ok ? "" : " failed")}
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          >
            {notice.ok ? <Check size={15} /> : <X size={15} />} {notice.text}
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

function HandoverPanel({
  move,
  docs,
  people,
  busy,
  onTarget,
  onCancel,
  onConfirm,
}: {
  move: Move;
  docs: Doc[];
  people: Person[];
  busy: boolean;
  onTarget: (to: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const items = docs.filter((d) => move.keys.includes(d.key));
  const republish = items.filter((d) => d.published).length;
  const from = people.find((p) => p.id === move.from)?.name || "Unassigned";
  const to = people.find((p) => p.id === move.to);
  return (
    <>
      <p className="meta-label">Handover</p>
      <div className="cl-route">
        <span>{from}</span>
        <span className="cl-route-line" aria-hidden="true" />
        <b>{to?.name}</b>
      </div>
      <label className="field">
        Receiving person
        <select value={move.to} onChange={(e) => onTarget(e.target.value)} disabled={busy}>
          {people
            .filter((p) => p.id !== move.from)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <p className="meta-label">
        {items.length} {items.length === 1 ? "item" : "items"}
      </p>
      <div className="cl-docs">
        {items.map((d, i) => (
          <m.div
            key={d.key}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.22, ease: ease.out }}
          >
            {d.kind === "article" ? <BookOpen size={14} /> : <FileText size={14} />}
            <span>{d.title}</span>
          </m.div>
        ))}
      </div>
      {republish > 0 && (
        <p className="cl-warning">
          <span className="glow-dot warn" /> {republish} published{" "}
          {republish === 1 ? "playbook returns" : "playbooks return"} to draft after an owner change and
          will need re-approval.
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={busy} onClick={onConfirm}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Hand over
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          <X size={15} /> Cancel
        </button>
      </div>
    </>
  );
}
