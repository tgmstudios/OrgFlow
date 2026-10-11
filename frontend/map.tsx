import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileText,
  GripVertical,
  LoaderCircle,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";
import { fullDate, type Article, type IndexedSource, type Person } from "./api";
import { AnimatePresence, ease, m, prefersReducedMotion } from "./motion";
import {
  buildDocs,
  docsForPerson,
  formGroups,
  personName,
  useMapState,
  type Group,
  type MapDoc,
  type MapState,
} from "./map-store";

/* Virtual stage; scaled to fit the card. */
const W = 900,
  H = 580,
  CX = W / 2,
  CY = H / 2;
type Pt = { x: number; y: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const KindIcon = { article: BookOpen, file: FileText, source: Mail } as const;
const kindLabel = { article: "Playbook", file: "File", source: "Indexed email or doc" };
const initials = (name = "") =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function layout(groups: Group[], members: Map<string, MapDoc[]>, override: Record<string, Pt>) {
  const pos: Record<string, Pt> = { root: { x: CX, y: CY } };
  const n = groups.length;
  groups.forEach((g, i) => {
    const a = -Math.PI / 2 + Math.PI / Math.max(n, 1) + (i / Math.max(n, 1)) * Math.PI * 2;
    const auto = { x: CX + 290 * Math.cos(a), y: CY + 172 * Math.sin(a) };
    const p = override[g.id] ?? (g.x != null && g.y != null ? { x: g.x, y: g.y } : auto);
    pos[g.id] = { x: clamp(p.x, 120, W - 120), y: clamp(p.y, 90, H - 90) };
    const docs = members.get(g.id) || [];
    const k = docs.length;
    const out = Math.atan2(pos[g.id]!.y - CY, pos[g.id]!.x - CX) || 0;
    const spread = Math.min(Math.PI * 1.6, k * 0.8);
    const r = 122 + Math.max(0, k - 4) * 10;
    docs.forEach((d, j) => {
      const da = k === 1 ? out : out - spread / 2 + (spread * (j + 0.5)) / k;
      const auto = {
        x: clamp(pos[g.id]!.x + r * Math.cos(da), 70, W - 70),
        y: clamp(pos[g.id]!.y + r * 0.78 * Math.sin(da), 22, H - 22),
      };
      pos[d.key] = override[d.key] ?? auto;
    });
  });
  return pos;
}
const curve = (a: Pt, b: Pt, bend = 0.18) => {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return `M ${a.x} ${a.y} Q ${mx - dy * bend} ${my + dx * bend} ${b.x} ${b.y}`;
};

type Drag = {
  type: "doc" | "group";
  key: string;
  start: Pt;
  offset: Pt;
  at: Pt;
  moved: boolean;
};
type Selection = { type: "group" | "doc" | "person"; id: string } | null;

export function KnowledgeMap({
  orgId,
  orgName,
  articles,
  files,
  sources,
  categories,
  people,
  onOpenArticle,
  onOpenPerson,
}: {
  orgId: string;
  orgName: string;
  articles: Article[];
  files: any[];
  sources: IndexedSource[];
  categories: { id: string; name: string }[];
  people: Person[];
  onOpenArticle: (id: string) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [state, setState] = useMapState(orgId);
  const data = useMemo(
    () => ({ articles, files, sources, categories }),
    [articles, files, sources, categories],
  );
  const docs = useMemo(() => buildDocs(data), [data]);
  const [gathering, setGathering] = useState(false);
  const [wave, setWave] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [focusPerson, setFocusPerson] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ groups: string[]; toId: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // First visit, or new documents arrived: form groups.
  useEffect(() => {
    if (!docs.length) return;
    const unassigned = docs.some((d) => !state.assign[d.key]);
    if (!state.groups.length || unassigned) setState((s) => formGroups(docs, data, s));
  }, [docs]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      const next = e!.contentRect.width / W;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setScale((s) => (Math.abs(s - next) > 0.001 ? next : s)),
      );
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

  const groups = state.groups;
  const groupOf = (key: string) => state.assign[key];
  const members = useMemo(() => {
    const map = new Map<string, MapDoc[]>();
    for (const g of groups) map.set(g.id, []);
    for (const d of docs) map.get(state.assign[d.key] ?? "")?.push(d);
    return map;
  }, [groups, docs, state.assign]);

  const override: Record<string, Pt> = {};
  if (drag?.moved) override[drag.key] = drag.at;
  const pos = layout(groups, members, override);
  const following = new Set<string>();
  if (drag?.moved) {
    following.add(drag.key);
    if (drag.type === "group") members.get(drag.key)?.forEach((d) => following.add(d.key));
  }

  function point(e: React.PointerEvent): Pt {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  function down(e: React.PointerEvent, type: Drag["type"], key: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = point(e),
      at = pos[key]!;
    setDrag({ type, key, start: p, offset: { x: p.x - at.x, y: p.y - at.y }, at, moved: false });
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const p = point(e);
    const moved = drag.moved || Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4;
    const at = { x: p.x - drag.offset.x, y: p.y - drag.offset.y };
    setDrag({ ...drag, at, moved });
    if (drag.type === "doc") {
      const target = nearestGroup(at, groupOf(drag.key));
      setHot(target?.id ?? personAt(e));
    } else setHot(personAt(e));
  }
  function personAt(e: React.PointerEvent) {
    const el = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((x) => (x as HTMLElement).dataset?.person) as HTMLElement | undefined;
    return el ? "person:" + el.dataset.person : null;
  }
  function nearestGroup(at: Pt, except?: string) {
    let best: Group | null = null,
      dist = 92;
    for (const g of groups) {
      if (g.id === except) continue;
      const d = Math.hypot(pos[g.id]!.x - at.x, pos[g.id]!.y - at.y);
      if (d < dist) (best = g), (dist = d);
    }
    return best;
  }
  function up(e: React.PointerEvent) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setHot(null);
    if (!d.moved) {
      setSelection({ type: d.type, id: d.key });
      return;
    }
    const person = personAt(e)?.slice(7);
    if (d.type === "doc") {
      const doc = docs.find((x) => x.key === d.key)!;
      if (person) {
        // A document dropped on a person moves into that person's first group.
        const target = groups.find((g) => g.ownerId === person);
        if (target) assignDoc(doc, target.id);
        else setNotice(`${personName(people, person)} has no group yet. Give them a group first.`);
        return;
      }
      const target = nearestGroup(d.at, groupOf(d.key));
      if (target) assignDoc(doc, target.id);
      return;
    }
    if (person) {
      const g = groups.find((x) => x.id === d.key)!;
      if (g.ownerId !== person) setMoving({ groups: [g.id], toId: person });
      return;
    }
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === d.key
          ? { ...g, x: clamp(d.at.x, 120, W - 120), y: clamp(d.at.y, 90, H - 90) }
          : g,
      ),
    }));
  }
  function assignDoc(doc: MapDoc, groupId: string) {
    setState((s) => ({
      ...s,
      assign: { ...s.assign, [doc.key]: groupId },
      pinned: { ...s.pinned, [doc.key]: true },
    }));
    setNotice(`Moved “${doc.title}” to ${groups.find((g) => g.id === groupId)?.name}.`);
  }
  function reform(reset = false) {
    const run = () =>
      setState((s) =>
        formGroups(
          docs,
          data,
          reset
            ? { ...s, pinned: {}, groups: s.groups.map(({ x, y, ...g }) => g) }
            : s,
        ),
      );
    if (prefersReducedMotion()) return run();
    setGathering(true);
    setTimeout(() => {
      run();
      setWave((w) => w + 1);
      setGathering(false);
    }, 420);
  }
  function addGroup() {
    const id = "manual:" + Date.now().toString(36);
    setState((s) => ({
      ...s,
      groups: [...s.groups, { id, name: "New group", tone: "iris", manual: true }],
    }));
    setSelection({ type: "group", id });
  }

  const leaving = people.filter(
    (p) => p.status !== "active" && groups.some((g) => g.ownerId === p.id),
  );
  // Spotlight: the groups in a pending handover, else the hovered person's groups.
  const spotlight = moving
    ? new Set(moving.groups)
    : focusPerson && groups.some((g) => g.ownerId === focusPerson)
      ? new Set(groups.filter((g) => g.ownerId === focusPerson).map((g) => g.id))
      : null;
  const dim = (key: string) => {
    if (!spotlight) return false;
    const gid = /^(article|file|source):/.test(key) ? groupOf(key) : key;
    return !spotlight.has(gid ?? "");
  };
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
  const migratingDocs = new Set(
    moving ? docs.filter((d) => moving.groups.includes(groupOf(d.key) ?? "")).map((d) => d.key) : [],
  );

  return (
    <div className="page-content map-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">KNOWLEDGE MAP</p>
          <h1>Who holds what</h1>
          <p>
            OrgFlow clusters every playbook, file and indexed source into groups. Drag
            documents between groups, and drop a group on a person to hand it over.
          </p>
        </div>
        <div className="title-actions">
          <button className="ghost" onClick={addGroup}>
            <Plus size={16} /> New group
          </button>
          <button className="primary" onClick={() => reform()} disabled={gathering}>
            <Sparkles size={16} /> Re-form clusters
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {leaving.map((p) => {
          const owned = groups.filter((g) => g.ownerId === p.id);
          const count = docsForPerson(state, docs, p.id).length;
          const to = people.find((x) => x.id === p.successorId);
          return (
            <m.div
              key={p.id}
              className="map-alert"
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
                  {owned.length} {owned.length === 1 ? "group" : "groups"} · {count}{" "}
                  {count === 1 ? "document" : "documents"} still assigned to them
                </small>
              </div>
              {to ? (
                <button
                  className="primary compact"
                  onClick={() => setMoving({ groups: owned.map((g) => g.id), toId: to.id })}
                >
                  Hand over to {to.name.split(" ")[0]} <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  className="ghost"
                  onClick={() => setSelection({ type: "person", id: p.id })}
                >
                  Choose a successor
                </button>
              )}
            </m.div>
          );
        })}
      </AnimatePresence>

      <div className="map-layout">
        <div className="card map-card">
          <div
            ref={frame}
            className={"map-frame" + (drag?.moved ? " dragging" : "")}
            style={{ height: H * scale }}
            onPointerDown={() => setSelection(null)}
          >
            <div
              ref={stage}
              className="map-stage"
              style={{ width: W, height: H, transform: `scale(${scale})` }}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => (setDrag(null), setHot(null))}
            >
              <svg className="map-edges" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                <defs>
                  <linearGradient id="thread-edge" x1="0" x2="1">
                    <stop offset="0" stopColor="var(--teal)" />
                    <stop offset="0.55" stopColor="var(--iris)" />
                    <stop offset="1" stopColor="var(--apricot)" />
                  </linearGradient>
                </defs>
                {groups.map((g, i) => (
                  <m.path
                    key={"e" + g.id}
                    className={"edge trunk" + (dim(g.id) ? " dim" : "")}
                    initial={{ d: curve(at("root"), at("root"), 0), pathLength: 0 }}
                    animate={{
                      d: curve(pos.root!, gathering ? pos.root! : pos[g.id]!, 0.12),
                      pathLength: 1,
                    }}
                    transition={spring(g.id, i)}
                  />
                ))}
                {docs.map((d, i) => {
                  const gid = groupOf(d.key);
                  if (!gid || !pos[gid] || !pos[d.key]) return null;
                  return (
                    <m.path
                      key={"e" + d.key}
                      className={
                        "edge twig tone-" +
                        (groups.find((g) => g.id === gid)?.tone || "teal") +
                        (dim(d.key) ? " dim" : "") +
                        (migratingDocs.has(d.key) ? " flowing" : "")
                      }
                      initial={{ d: curve(at("root"), at("root"), 0) }}
                      animate={{ d: curve(at(gid), at(d.key), 0.1) }}
                      transition={spring(d.key, i + groups.length)}
                    />
                  );
                })}
              </svg>

              {/* Cluster clouds sit under everything else. */}
              {groups.map((g, i) => {
                const k = members.get(g.id)?.length || 0;
                const size = 2 * (122 + Math.max(0, k - 4) * 10) + 90;
                return (
                  <m.span
                    key={"cloud" + g.id + wave}
                    className={"map-cloud tone-" + g.tone + (dim(g.id) ? " dim" : "")}
                    style={{ width: size, height: size * 0.8, marginLeft: -size / 2, marginTop: -size * 0.4 }}
                    initial={{ ...at("root"), scale: 0.2, opacity: 0 }}
                    animate={{ ...at(g.id), scale: gathering ? 0.2 : 1, opacity: gathering ? 0 : 1 }}
                    transition={spring(g.id, i)}
                  />
                );
              })}

              <m.div
                className="map-node-pos"
                initial={{ x: CX, y: CY, scale: 0.6, opacity: 0 }}
                animate={{ x: CX, y: CY, scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.6, bounce: 0.25 }}
              >
                <div className="map-root">
                  <span className="map-root-mark" />
                  <strong>{orgName}</strong>
                  <small>
                    {docs.length} docs · {groups.length} groups
                  </small>
                </div>
              </m.div>

              {groups.map((g, i) => {
                const owner = people.find((p) => p.id === g.ownerId);
                const count = members.get(g.id)?.length || 0;
                return (
                  <m.div
                    key={g.id}
                    className="map-node-pos"
                    style={{ zIndex: drag?.key === g.id ? 6 : 3 }}
                    initial={{ x: CX, y: CY, scale: 0.4, opacity: 0 }}
                    animate={{ ...at(g.id), scale: gathering ? 0.4 : 1, opacity: gathering ? 0 : 1 }}
                    transition={spring(g.id, i)}
                  >
                    <div
                      className={
                        "map-group tone-" +
                        g.tone +
                        (hot === g.id ? " hot" : "") +
                        (selection?.id === g.id ? " selected" : "") +
                        (dim(g.id) ? " dim" : "") +
                        (moving?.groups.includes(g.id) ? " leaving" : "")
                      }
                      onPointerDown={(e) => down(e, "group", g.id)}
                    >
                      <strong>{g.name}</strong>
                      <small>
                        {count} {count === 1 ? "doc" : "docs"}
                      </small>
                      <span
                        className={"map-owner" + (owner && owner.status !== "active" ? " warn" : "")}
                        title={owner ? owner.name : "No owner"}
                      >
                        {owner ? initials(owner.name) : "?"}
                      </span>
                    </div>
                  </m.div>
                );
              })}

              {docs.map((d, i) => {
                if (!groupOf(d.key)) return null;
                const Icon = KindIcon[d.kind];
                return (
                  <m.div
                    key={d.key}
                    className="map-node-pos"
                    style={{ zIndex: drag?.key === d.key ? 7 : 4 }}
                    initial={{ x: CX, y: CY, scale: 0.3, opacity: 0 }}
                    animate={{ ...at(d.key), scale: gathering ? 0.3 : 1, opacity: gathering ? 0 : 1 }}
                    transition={spring(d.key, i + groups.length)}
                  >
                    <div
                      className={
                        "map-doc kind-" +
                        d.kind +
                        (selection?.id === d.key ? " selected" : "") +
                        (drag?.key === d.key && drag.moved ? " lifted" : "") +
                        (dim(d.key) ? " dim" : "") +
                        (migratingDocs.has(d.key) ? " migrating" : "")
                      }
                      onPointerDown={(e) => down(e, "doc", d.key)}
                    >
                      <span className="map-doc-icon">
                        <Icon size={13} />
                      </span>
                      <span className="map-doc-title">{d.title}</span>
                    </div>
                  </m.div>
                );
              })}
            </div>
            {!docs.length && (
              <p className="map-empty">
                Add a playbook or connect a source and OrgFlow will start clustering.
              </p>
            )}
          </div>
          <div className="map-people">
            <span className="map-people-label">
              <GripVertical size={13} /> Drop a group on a person to hand it over
            </span>
            <div className="map-people-list">
              {people.map((p) => {
                const count = docsForPerson(state, docs, p.id).length;
                return (
                  <button
                    key={p.id}
                    data-person={p.id}
                    className={
                      "map-person" +
                      (hot === "person:" + p.id ? " hot" : "") +
                      (focusPerson === p.id ? " focused" : "") +
                      (moving?.toId === p.id ? " receiving" : "") +
                      (selection?.type === "person" && selection.id === p.id ? " selected" : "")
                    }
                    onPointerEnter={() => setFocusPerson(p.id)}
                    onPointerLeave={() => setFocusPerson(null)}
                    onClick={() => setSelection({ type: "person", id: p.id })}
                  >
                    <span className="mini-avatar">{initials(p.name)}</span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {count} {count === 1 ? "doc" : "docs"}
                      </small>
                    </span>
                    {p.status !== "active" && <span className="glow-dot warn" title="Leaving" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="card map-inspector">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={moving ? "move" : selection ? selection.type + selection.id : "overview"}
              initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(2px)", transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: ease.out }}
            >
              {moving ? (
                <Handover
                  key="handover"
                  state={state}
                  docs={docs}
                  people={people}
                  moving={moving}
                  onChangeTarget={(toId) => setMoving({ ...moving, toId })}
                  onCancel={() => setMoving(null)}
                  onConfirm={() => {
                    const fromIds = new Set(
                      groups.filter((g) => moving.groups.includes(g.id)).map((g) => g.ownerId),
                    );
                    const count = docs.filter((d) => moving.groups.includes(groupOf(d.key) ?? "")).length;
                    setState((s) => ({
                      ...s,
                      groups: s.groups.map((g) =>
                        moving.groups.includes(g.id) ? { ...g, ownerId: moving.toId } : g,
                      ),
                      history: [
                        {
                          id: Date.now().toString(36),
                          at: new Date().toISOString(),
                          fromId: fromIds.size === 1 ? [...fromIds][0] : undefined,
                          toId: moving.toId,
                          groups: moving.groups,
                          docs: count,
                        },
                        ...s.history,
                      ].slice(0, 20),
                    }));
                    setNotice(
                      `Handed ${count} ${count === 1 ? "document" : "documents"} to ${personName(people, moving.toId)}.`,
                    );
                    setSelection({ type: "person", id: moving.toId });
                    setMoving(null);
                  }}
                />
              ) : selection?.type === "group" ? (
                <GroupPanel
                  group={groups.find((g) => g.id === selection.id)}
                  docs={members.get(selection.id) || []}
                  people={people}
                  onRename={(name) =>
                    setState((s) => ({
                      ...s,
                      groups: s.groups.map((g) => (g.id === selection.id ? { ...g, name } : g)),
                    }))
                  }
                  onOwner={(ownerId) =>
                    setMoving({ groups: [selection.id], toId: ownerId })
                  }
                  onSelectDoc={(key) => setSelection({ type: "doc", id: key })}
                  onDelete={() => {
                    setState((s) => ({
                      ...s,
                      groups: s.groups.filter((g) => g.id !== selection.id),
                    }));
                    setSelection(null);
                  }}
                />
              ) : selection?.type === "doc" ? (
                <DocPanel
                  doc={docs.find((d) => d.key === selection.id)}
                  groups={groups}
                  groupId={groupOf(selection.id)}
                  people={people}
                  onMove={(gid) => assignDoc(docs.find((d) => d.key === selection.id)!, gid)}
                  onOpenArticle={onOpenArticle}
                />
              ) : selection?.type === "person" ? (
                <PersonPanel
                  person={people.find((p) => p.id === selection.id)}
                  people={people}
                  state={state}
                  docs={docs}
                  onSelectGroup={(id) => setSelection({ type: "group", id })}
                  onHandover={(toId) =>
                    setMoving({
                      groups: groups.filter((g) => g.ownerId === selection.id).map((g) => g.id),
                      toId,
                    })
                  }
                  onOpenPerson={onOpenPerson}
                />
              ) : (
                <Overview
                  state={state}
                  docs={docs}
                  people={people}
                  onReset={() => reform(true)}
                />
              )}
            </m.div>
          </AnimatePresence>
        </aside>
      </div>
      <AnimatePresence>
        {notice && (
          <m.div
            className="map-toast"
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          >
            <Check size={15} /> {notice}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Overview({
  state,
  docs,
  people,
  onReset,
}: {
  state: MapState;
  docs: MapDoc[];
  people: Person[];
  onReset: () => void;
}) {
  const unowned = state.groups.filter((g) => !g.ownerId).length;
  const counts = { article: 0, file: 0, source: 0 };
  docs.forEach((d) => counts[d.kind]++);
  return (
    <div className="inspector-body">
      <p className="meta-label">Overview</p>
      <h2 className="inspector-title">
        <Waypoints size={18} /> {state.groups.length} groups
      </h2>
      <div className="map-stats">
        <span>
          <b>{counts.article}</b> playbooks
        </span>
        <span>
          <b>{counts.file}</b> files
        </span>
        <span>
          <b>{counts.source}</b> indexed
        </span>
      </div>
      {unowned > 0 && (
        <p className="map-hint">
          <span className="glow-dot warn" /> {unowned} {unowned === 1 ? "group has" : "groups have"} no
          owner. Select a group to assign one.
        </p>
      )}
      <p className="section-sub">
        Select any group, document or person. Drag documents to regroup them; hand-placed documents
        stay put when clusters re-form.
      </p>
      <p className="meta-label">Recent handovers</p>
      {state.history.length ? (
        <ul className="handover-log">
          {state.history.slice(0, 5).map((h) => (
            <li key={h.id}>
              <span className="glow-dot" />
              <span>
                {personName(people, h.fromId) || "Several people"} <ArrowRight size={12} />{" "}
                <b>{personName(people, h.toId) || "Unknown"}</b>
                <small>
                  {h.docs} docs · {fullDate(h.at)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="inline-note">No handovers yet.</p>
      )}
      <button className="text-button" onClick={onReset}>
        <Sparkles size={14} /> Reset layout and re-cluster
      </button>
    </div>
  );
}

function GroupPanel({
  group,
  docs,
  people,
  onRename,
  onOwner,
  onSelectDoc,
  onDelete,
}: {
  group?: Group;
  docs: MapDoc[];
  people: Person[];
  onRename: (name: string) => void;
  onOwner: (id: string) => void;
  onSelectDoc: (key: string) => void;
  onDelete: () => void;
}) {
  if (!group) return null;
  return (
    <div className="inspector-body">
      <p className="meta-label">Group</p>
      <input
        className="inspector-name"
        aria-label="Group name"
        value={group.name}
        onChange={(e) => onRename(e.target.value)}
      />
      <label className="field">
        Owner
        <select value={group.ownerId || ""} onChange={(e) => e.target.value && onOwner(e.target.value)}>
          <option value="">No owner</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status !== "active" ? " (leaving)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="meta-label">
        {docs.length} {docs.length === 1 ? "document" : "documents"}
      </p>
      <div className="inspector-docs">
        {docs.map((d) => {
          const Icon = KindIcon[d.kind];
          return (
            <button key={d.key} onClick={() => onSelectDoc(d.key)}>
              <Icon size={14} />
              <span>{d.title}</span>
            </button>
          );
        })}
        {!docs.length && <p className="inline-note">Drag documents here from the map.</p>}
      </div>
      {group.manual && !docs.length && (
        <button className="text-button danger" onClick={onDelete}>
          <Trash2 size={14} /> Delete group
        </button>
      )}
    </div>
  );
}

function DocPanel({
  doc,
  groups,
  groupId,
  people,
  onMove,
  onOpenArticle,
}: {
  doc?: MapDoc;
  groups: Group[];
  groupId?: string;
  people: Person[];
  onMove: (groupId: string) => void;
  onOpenArticle: (id: string) => void;
}) {
  if (!doc) return null;
  const Icon = KindIcon[doc.kind];
  const owner = people.find((p) => p.id === groups.find((g) => g.id === groupId)?.ownerId);
  return (
    <div className="inspector-body">
      <p className="meta-label">{kindLabel[doc.kind]}</p>
      <h2 className="inspector-title">
        <Icon size={18} /> {doc.title}
      </h2>
      <p className="section-sub">{doc.detail}</p>
      <label className="field">
        Group
        <select value={groupId || ""} onChange={(e) => onMove(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <p className="map-hint">
        <span className={"glow-dot" + (owner && owner.status !== "active" ? " warn" : "")} />
        {owner ? `Held by ${owner.name}` : "No owner yet"}
      </p>
      {doc.kind === "article" ? (
        <button className="text-button" onClick={() => onOpenArticle(doc.id)}>
          Open playbook <ArrowUpRight size={14} />
        </button>
      ) : doc.url ? (
        <a className="text-button" href={doc.url} target="_blank" rel="noreferrer">
          Open original <ArrowUpRight size={14} />
        </a>
      ) : null}
    </div>
  );
}

function PersonPanel({
  person,
  people,
  state,
  docs,
  onSelectGroup,
  onHandover,
  onOpenPerson,
}: {
  person?: Person;
  people: Person[];
  state: MapState;
  docs: MapDoc[];
  onSelectGroup: (id: string) => void;
  onHandover: (toId: string) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [to, setTo] = useState(person?.successorId || "");
  if (!person) return null;
  const owned = state.groups.filter((g) => g.ownerId === person.id);
  const held = docsForPerson(state, docs, person.id);
  return (
    <div className="inspector-body">
      <p className="meta-label">Person</p>
      <h2 className="inspector-title">
        <span className="mini-avatar">{initials(person.name)}</span> {person.name}
      </h2>
      <p className="section-sub">
        {person.role}
        {person.status !== "active" && (
          <>
            {" · "}
            <span className="badge warn">{person.status === "left" ? "Left" : "Leaving"}</span>
          </>
        )}
      </p>
      <p className="meta-label">
        Holds {owned.length} {owned.length === 1 ? "group" : "groups"} · {held.length} docs
      </p>
      <div className="inspector-docs">
        {owned.map((g) => (
          <button key={g.id} onClick={() => onSelectGroup(g.id)}>
            <span className={"tone-chip tone-" + g.tone} />
            <span>{g.name}</span>
          </button>
        ))}
        {!owned.length && <p className="inline-note">Nothing assigned yet.</p>}
      </div>
      {owned.length > 0 && (
        <div className="handover-picker">
          <label className="field">
            Hand everything over to
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a person…</option>
              {people
                .filter((p) => p.id !== person.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === person.successorId ? " (successor)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <button className="primary" disabled={!to} onClick={() => onHandover(to)}>
            Preview handover <ArrowRight size={15} />
          </button>
        </div>
      )}
      <button className="text-button" onClick={() => onOpenPerson(person.id)}>
        Open profile <ArrowUpRight size={14} />
      </button>
    </div>
  );
}

function Handover({
  state,
  docs,
  people,
  moving,
  onChangeTarget,
  onCancel,
  onConfirm,
}: {
  state: MapState;
  docs: MapDoc[];
  people: Person[];
  moving: { groups: string[]; toId: string };
  onChangeTarget: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const groups = state.groups.filter((g) => moving.groups.includes(g.id));
  const moved = docs.filter((d) => moving.groups.includes(state.assign[d.key] ?? ""));
  const to = people.find((p) => p.id === moving.toId);
  const from = [...new Set(groups.map((g) => personName(people, g.ownerId) || "No owner"))];
  return (
    <div className="inspector-body">
      <p className="meta-label">Handover</p>
      <div className="handover-route">
        <span>{from.join(", ")}</span>
        <span className="route-line" aria-hidden="true" />
        <b>{to?.name}</b>
      </div>
      <label className="field">
        Receiving person
        <select value={moving.toId} onChange={(e) => onChangeTarget(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="meta-label">
        {groups.length} {groups.length === 1 ? "group" : "groups"} · {moved.length} documents
      </p>
      <div className="inspector-docs migrating-list">
        {moved.map((d, i) => {
          const Icon = KindIcon[d.kind];
          return (
            <m.div
              key={d.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.22, ease: ease.out }}
            >
              <Icon size={14} />
              <span>{d.title}</span>
            </m.div>
          );
        })}
      </div>
      <p className="section-sub">
        The groups and their documents move to {to?.name.split(" ")[0]}'s profile. Originals stay
        in their providers.
      </p>
      <div className="form-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            // Let the documents visibly travel before the map settles.
            setTimeout(onConfirm, prefersReducedMotion() ? 0 : 650);
          }}
        >
          {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Hand over
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          <X size={15} /> Cancel
        </button>
      </div>
    </div>
  );
}
