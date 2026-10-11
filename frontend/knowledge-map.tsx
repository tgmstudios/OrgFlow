import React, { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, FileText, List, LoaderCircle, Network, UserRound, Users, Waypoints } from "lucide-react";
import { api, type Article, type IndexedSource, type Person } from "./api";
import { ClusterView } from "./cluster-view";
import { SegmentPill } from "./motion";

type Category = { id: string; name: string };

/** Organization view of documented knowledge and the people currently responsible for it. */
export function KnowledgeMap({
  articles,
  categories,
  people,
  sources,
  onRefresh,
  onOpenArticle,
  onOpenPerson,
}: {
  articles: Article[];
  categories: Category[];
  people: Person[];
  sources: IndexedSource[];
  onRefresh: () => Promise<void> | void;
  onOpenArticle: (id: string) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [view, setView] = useState<"clusters" | "list">("clusters");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const published = articles.filter((a) => a.status === "published");
  const drafts = articles.filter((a) => a.status !== "published");
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people.map((person) => ({
      person,
      articles: articles.filter((a) => a.ownerId === person.id && (!q || a.title.toLowerCase().includes(q) || person.name.toLowerCase().includes(q))),
      sources: sources.filter((s) => s.ownerId === person.id && (!q || s.title.toLowerCase().includes(q) || person.name.toLowerCase().includes(q))),
    })).filter((g) => !q || g.person.name.toLowerCase().includes(q) || g.articles.length > 0 || g.sources.length > 0);
  }, [articles, people, sources, filter]);
  const unassigned = articles.filter((a) => !a.ownerId || !people.some((p) => p.id === a.ownerId));
  const shownUnassigned = unassigned.filter((a) => !filter || a.title.toLowerCase().includes(filter.toLowerCase()));
  const shownSources = sources.filter((s) => !filter || s.title.toLowerCase().includes(filter.toLowerCase()) || s.provider.toLowerCase().includes(filter.toLowerCase()));
  const unassignedSources = sources.filter((s) => !s.ownerId || !people.some((p) => p.id === s.ownerId));
  const shownUnassignedSources = unassignedSources.filter((s) => !filter || s.title.toLowerCase().includes(filter.toLowerCase()));

  async function assign(article: Article, ownerId: string) {
    setSaving(article.id);
    setError("");
    try {
      await api(`/articles/${article.id}`, "PATCH", { ownerId: ownerId || null });
      await onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving("");
    }
  }

  async function assignSource(source: IndexedSource, ownerId: string) {
    setSaving(source.id);
    setError("");
    try {
      await api(`/sources/${source.id}`, "PATCH", { ownerId: ownerId || null });
      await onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving("");
    }
  }

  function SourceNode({ source }: { source: IndexedSource }) {
    return <div className="map-knowledge-node">
      <a className="map-node-title" href={source.url || undefined} target={source.url ? "_blank" : undefined} rel={source.url ? "noreferrer" : undefined}>
        <FileText size={15} /><span>{source.title}</span><ArrowUpRight size={13} />
      </a>
      <div className="map-node-meta"><span>{source.provider}</span>
        {saving === source.id ? <LoaderCircle size={13} className="spin" /> : <label className="map-owner-select">Owner
          <select aria-label={`Owner for ${source.title}`} value={source.ownerId || ""} onChange={(e) => void assignSource(source, e.target.value)}>
            <option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>}
      </div>
    </div>;
  }

  function KnowledgeNode({ article }: { article: Article }) {
    return (
      <div className="map-knowledge-node">
        <button className="map-node-title" onClick={() => onOpenArticle(article.id)}>
          <BookOpen size={15} />
          <span>{article.title}</span>
          <ArrowUpRight size={13} />
        </button>
        <div className="map-node-meta">
          <span className={article.status === "published" ? "status published" : "status draft"}>{article.status === "published" ? "Published" : "Draft"}</span>
          <span>{categories.find((c) => c.id === article.categoryId)?.name || "Uncategorized"}</span>
          {saving === article.id ? <LoaderCircle size={13} className="spin" /> : (
            <label className="map-owner-select">Owner
              <select aria-label={`Owner for ${article.title}`} value={article.ownerId || ""} onChange={(e) => void assign(article, e.target.value)}>
                <option value="">Unassigned</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-content knowledge-map-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">WHO KNOWS WHAT</p>
          <h1>Knowledge map</h1>
          <p>See the playbooks your team relies on, who owns them, and what needs a handoff when someone leaves.</p>
        </div>
        <div className="map-title-actions">
          <div className="segmented" role="tablist" aria-label="Map view">
            {([["clusters", Waypoints, "Clusters"], ["list", List, "List"]] as const).map(([value, Icon, label]) => (
              <button key={value} role="tab" aria-selected={view === value} className={view === value ? "on" : ""} onClick={() => setView(value)}>
                {view === value && <SegmentPill id="map-view" />}
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          {view === "list" && <label className="map-search">Search knowledge<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="People or playbooks" /></label>}
        </div>
      </div>
      {view === "clusters" ? (
        <ClusterView
          articles={articles}
          categories={categories}
          sources={sources}
          people={people}
          onRefresh={onRefresh}
          onOpenArticle={onOpenArticle}
          onOpenPerson={onOpenPerson}
        />
      ) : <>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="map-overview card">
        <div className="map-org-node"><Network size={19} /><span>{people.length ? "Your organization" : "Your knowledge"}</span></div>
        <div className="map-overview-stats"><span><strong>{articles.length + sources.length}</strong> knowledge items</span><span><strong>{published.length}</strong> published playbooks</span><span><strong>{drafts.length}</strong> drafts</span><span><strong>{unassigned.length + unassignedSources.length}</strong> without an owner</span></div>
      </div>

      {people.length > 0 ? <div className="map-people-grid">
        {groups.map(({ person, articles: owned, sources: ownedSources }) => (
          <section className={`map-person card ${person.status !== "active" ? "at-risk" : ""}`} key={person.id}>
            <div className="map-person-head">
              <button className="map-person-identity" onClick={() => onOpenPerson(person.id)}>
                <span className="map-avatar"><UserRound size={17} /></span>
                <span><strong>{person.name}</strong><small>{person.role || "Team member"}{person.leaveDate ? ` · leaves ${person.leaveDate}` : ""}</small></span>
                <ArrowUpRight size={14} />
              </button>
              <span className={`status ${person.status === "active" ? "published" : "draft"}`}>{person.status === "active" ? "Active" : person.status === "leaving" ? "Leaving" : "Left"}</span>
            </div>
            <div className="map-owner-caption">{owned.length} playbook{owned.length === 1 ? "" : "s"} · {ownedSources.length} source{ownedSources.length === 1 ? "" : "s"}</div>
            <div className="map-knowledge-list">
              {owned.map((a) => <KnowledgeNode key={a.id} article={a} />)}
              {ownedSources.map((s) => <SourceNode key={s.id} source={s} />)}
              {!owned.length && !ownedSources.length && <p className="empty">No knowledge assigned yet.</p>}
            </div>
            <button className="map-transfer-button" onClick={() => onOpenPerson(person.id)}>
              {person.status === "active" ? "Review knowledge & transfer" : "Continue handoff"}<ArrowUpRight size={14} />
            </button>
          </section>
        ))}
      </div> : <div className="card map-empty"><Users size={22} /><strong>Add people to map knowledge ownership</strong><p>Once your team is listed, assign playbooks to the people responsible for them.</p></div>}

      {(shownUnassigned.length > 0 || shownUnassignedSources.length > 0 || people.length === 0) && <section className="card map-unassigned">
        <div className="section-heading"><h2><Users size={16} /> Ownership needs a name</h2><span>{shownUnassigned.length + unassignedSources.length} items</span></div>
        <p className="section-sub">Assign a person to make these processes and source materials part of a clear handoff.</p>
        <div className="map-knowledge-list">{shownUnassigned.map((a) => <KnowledgeNode key={a.id} article={a} />)}{shownUnassignedSources.map((s) => <SourceNode key={s.id} source={s} />)}</div>
      </section>}

      <section className="card map-source-section">
        <div className="section-heading"><h2><FileText size={16} /> Connected source material</h2><span>{shownSources.length} sources</span></div>
        <p className="section-sub">Assign indexed files and email sources to the person who knows or maintains them. Assigned sources are included in that person’s AI handoff draft.</p>
        {shownSources.length ? <div className="map-knowledge-list">{shownSources.map((s) => <SourceNode key={s.id} source={s} />)}</div> : <p className="empty">No indexed source material matches this search.</p>}
      </section>
      </>}
    </div>
  );
}
