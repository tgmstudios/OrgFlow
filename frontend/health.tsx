import React, { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { api, fullDate, type Article, type InterviewPlan } from "./api";
import { CountUp } from "./ambient";

type Row = { id: string; title: string; meta: string };

/** Where the organization's memory is thin, stale, or concentrated in someone who is leaving. */
export function HealthPage({
  articles,
  onOpenArticle,
  onOpenPerson,
  onStartInterview,
}: {
  articles: Article[];
  onOpenArticle: (id: string) => void;
  onOpenPerson: (id: string) => void;
  onStartInterview: (plan: InterviewPlan) => void;
}) {
  const [health, setHealth] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      setHealth(await api("/insights/health"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, articles]);

  if (!health)
    return (
      <div className="page-content">
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : (
          <div className="loading">
            <LoaderCircle className="spin" /> Measuring your organization’s memory…
          </div>
        )}
      </div>
    );
  const t = health.totals;
  // Someone leaving without a handoff guide keeps the page from reading "good".
  const tone =
    health.score >= 75 && t.peopleAtRisk === 0 ? "good" : health.score >= 45 ? "fair" : "poor";

  async function act(action: any) {
    if (action.articleId && !["interview", "handoff"].includes(action.type))
      return onOpenArticle(action.articleId);
    setBusy(action.text);
    try {
      if (action.type === "interview")
        onStartInterview(await api(`/people/${action.personId}/interview`, "POST", {}));
      else {
        await api(`/people/${action.personId}/handoff`, "POST", { mode: "outline" });
        onOpenPerson(action.personId);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page-content health-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">IS THE MEMORY HOLDING?</p>
          <h1>Knowledge health</h1>
          <p>
            Where your organization’s know-how is thin, out of date, or concentrated in someone who
            is leaving.
          </p>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="health-summary">
        <div className={"score-card " + tone}>
          <svg className="score-ring" viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="score-thread" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--teal)" />
                <stop offset="0.5" stopColor="var(--primary)" />
                <stop offset="1" stopColor="var(--apricot)" />
              </linearGradient>
            </defs>
            <circle className="score-track" cx="60" cy="60" r="52" />
            <circle
              className="score-fill"
              cx="60"
              cy="60"
              r="52"
              pathLength={100}
              style={{ "--score": health.score } as React.CSSProperties}
            />
          </svg>
          <div className="score-value">
            <strong>
              <CountUp value={health.score} />
            </strong>
            <span>/ 100</span>
          </div>
          <small>
            <span className={"glow-dot" + (tone === "good" ? "" : " warn")} />
            {t.published + t.drafts === 0
              ? "Nothing documented yet"
              : tone === "good"
                ? "Knowledge is in good shape"
                : tone === "fair"
                  ? "Some gaps to close"
                  : "Significant risk of knowledge loss"}
          </small>
        </div>
        {(
          [
            ["Published", t.published, ""],
            ["Drafts", t.drafts, t.drafts > 0 ? "warn" : ""],
            ["Overdue review", t.stale, t.stale > 0 ? "bad" : ""],
            ["No owner", t.unowned, t.unowned > 0 ? "warn" : ""],
            ["People at risk", t.peopleAtRisk, t.peopleAtRisk > 0 ? "bad" : ""],
            ["Source changed", t.sourceChanged, t.sourceChanged > 0 ? "warn" : ""],
          ] as [string, number, string][]
        ).map(([label, value, cls]) => (
          <div className={"stat-card " + cls} key={label}>
            <strong>
              <CountUp value={value} duration={700} />
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-heading">
          <h2>
            <Activity size={16} /> What to do next
          </h2>
        </div>
        {health.actions.length === 0 ? (
          <p className="empty">
            <ShieldCheck size={16} /> Nothing urgent. Keep capturing and reviewing.
          </p>
        ) : (
          health.actions.map((action: any, i: number) => (
            <div className={"digest-item " + action.severity} key={i}>
              <span className={"glow-dot " + ({ high: "bad", medium: "warn", low: "" } as any)[action.severity]} />
              <span>{action.text}</span>
              <button className="text-button" disabled={busy !== ""} onClick={() => act(action)}>
                {busy === action.text && <LoaderCircle className="spin" size={12} />}
                {action.type === "interview"
                  ? "Plan interview"
                  : action.type === "handoff"
                    ? "Create outline"
                    : "Open"}
                <ArrowUpRight size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="section-heading">
          <h2>People</h2>
        </div>
        {health.people.length === 0 && (
          <p className="empty">Add people so processes have an owner and a handoff path.</p>
        )}
        <div className="table-scroll">
          <table>
            <tbody>
              {health.people.map((p: any) => (
                <tr key={p.personId}>
                  <td>
                    <button className="text-button" onClick={() => onOpenPerson(p.personId)}>
                      <strong>{p.name}</strong>
                    </button>
                    <small>
                      {p.role}
                      {p.leaveDate ? ` · last day ${fullDate(p.leaveDate)}` : ""}
                    </small>
                  </td>
                  <td>
                    {p.published} published · {p.drafts} draft · {p.stale} overdue
                  </td>
                  <td>
                    <span className={"risk " + p.risk}>{p.risk}</span>
                  </td>
                  <td>{p.reasons.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="health-columns">
        <ListCard
          title="Overdue for review"
          empty="Everything published has been reviewed recently."
          rows={health.stale.map(
            (s: any): Row => ({
              id: s.articleId,
              title: s.title,
              meta: `Due ${fullDate(s.dueAt)} · ${s.daysOverdue} day(s) overdue`,
            }),
          )}
          onOpen={onOpenArticle}
        />
        <ListCard
          title="Due in the next 30 days"
          empty="Nothing due soon."
          rows={health.dueSoon.map(
            (s: any): Row => ({ id: s.articleId, title: s.title, meta: `Due ${fullDate(s.dueAt)}` }),
          )}
          onOpen={onOpenArticle}
        />
        <ListCard
          title="Sources changed since capture"
          empty="No captured documents have changed."
          warn
          rows={health.sourceChanged.map(
            (s: any): Row => ({
              id: s.articleId,
              title: s.title,
              meta: s.sources.map((x: any) => x.title || x.sourceId).join(", "),
            }),
          )}
          onOpen={onOpenArticle}
        />
        <ListCard
          title="Processes with no owner"
          empty="Every process has an owner."
          rows={health.unowned.map(
            (s: any): Row => ({
              id: s.articleId,
              title: s.title,
              meta: s.published ? "Published" : "Draft",
            }),
          )}
          onOpen={onOpenArticle}
        />
        <ListCard
          title="Drafts waiting 14+ days"
          empty="No stuck drafts."
          rows={health.stuckDrafts.map(
            (s: any): Row => ({ id: s.articleId, title: s.title, meta: `${s.ageDays} days old` }),
          )}
          onOpen={onOpenArticle}
        />
        <ListCard
          title="Quotes that could not be verified"
          empty="All AI citations were found in their sources."
          warn
          rows={health.ungrounded.map(
            (s: any): Row => ({
              id: s.articleId,
              title: s.title,
              meta: `${s.verified} of ${s.total} verified`,
            }),
          )}
          onOpen={onOpenArticle}
        />
      </div>
    </div>
  );
}

function ListCard({
  title,
  rows,
  empty,
  warn,
  onOpen,
}: {
  title: string;
  rows: Row[];
  empty: string;
  warn?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="card">
      <div className="section-heading">
        <h2>
          {warn && rows.length > 0 && <TriangleAlert size={15} />} {title}
        </h2>
        <span className="flag">{rows.length}</span>
      </div>
      {rows.length === 0 && <p className="empty">{empty}</p>}
      {rows.slice(0, 8).map((row) => (
        <button className="list-item" key={row.id} onClick={() => onOpen(row.id)}>
          <strong>{row.title}</strong>
          <small>{row.meta}</small>
        </button>
      ))}
    </div>
  );
}
