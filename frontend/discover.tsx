import React, { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  LoaderCircle,
  Mail,
  Sparkles,
} from "lucide-react";
import { api, ApiError, type Article, type Candidate } from "./api";
import { AnimatePresence, cardExit, m } from "./motion";

export function SuggestedPlaybooks({
  candidates,
  indexedCount,
  articles,
  onRefresh,
  onOpenArticle,
  onGoIndex,
}: {
  candidates: Candidate[];
  indexedCount: number;
  articles: Article[];
  onRefresh: () => Promise<void> | void;
  onOpenArticle: (id: string) => void;
  onGoIndex: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [needsIndex, setNeedsIndex] = useState(false),
    [notice, setNotice] = useState("");
  const suggested = candidates.filter((c) => c.status === "suggested");
  const drafted = candidates.filter(
    (c) => c.status === "drafted" && c.articleId,
  );
  function fail(e: any, fallback?: string) {
    setNeedsIndex(false);
    if (e instanceof ApiError && e.status === 409) {
      setNeedsIndex(true);
      setError("Nothing is indexed yet, so there is nothing to analyze.");
    } else if (
      e instanceof ApiError &&
      (e.status === 503 || e.code === "AI_NOT_CONFIGURED")
    ) {
      setError(
        "AI isn't configured on this server yet, so OrgFlow can't analyze your sources. Ask your administrator to enable it.",
      );
    } else setError(e.message || fallback || "Something went wrong.");
  }
  async function discover() {
    setBusy("discover");
    setError("");
    setNeedsIndex(false);
    setNotice("");
    try {
      const r = await api("/discover", "POST", {});
      await onRefresh();
      const n = r.candidates?.length || 0;
      setNotice(
        n
          ? `Found ${n} new suggestion${n === 1 ? "" : "s"}.`
          : "No new recurring work found in your indexed sources.",
      );
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function draft(c: Candidate) {
    setBusy(c.id);
    setError("");
    setNeedsIndex(false);
    setNotice("");
    try {
      const r = await api(`/candidates/${c.id}/draft`, "POST", {});
      await onRefresh();
      onOpenArticle(r.draft.id);
    } catch (e: any) {
      fail(e);
      setBusy(null);
    }
  }
  async function dismiss(c: Candidate) {
    setBusy(c.id);
    setError("");
    setNeedsIndex(false);
    try {
      await api(`/candidates/${c.id}/dismiss`, "POST", {});
      await onRefresh();
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className={"card suggested" + (busy === "discover" ? " is-working" : "")}
      aria-label="Suggested playbooks"
    >
      <div className="section-heading">
        <div>
          <h2>
            <Sparkles size={15} /> Suggested playbooks
          </h2>
          <p className="section-sub">
            OrgFlow reads your indexed email and documents for work your team
            repeats. Drafts always need your review before publishing.
          </p>
        </div>
        <button
          className="primary"
          onClick={discover}
          disabled={busy !== null}
        >
          {busy === "discover" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          {busy === "discover" ? "Looking…" : "Find recurring work"}
        </button>
      </div>
      {busy === "discover" && (
        <p className="progress-note shimmer-text" role="status">
          Analyzing your indexed sources. This can take up to a minute.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}{" "}
          {needsIndex && (
            <button className="text-button" onClick={onGoIndex}>
              Index email &amp; documents <ArrowUpRight size={13} />
            </button>
          )}
        </p>
      )}
      {notice && !error && (
        <p className="inline-success" role="status">
          {notice}
        </p>
      )}
      {!suggested.length && !drafted.length && busy !== "discover" && (
        <p className="inline-note">
          {indexedCount
            ? "No suggestions yet. Select “Find recurring work” to analyze your indexed sources."
            : "Index your email and documents first, then OrgFlow can suggest playbooks."}{" "}
          {!indexedCount && (
            <button className="text-button" onClick={onGoIndex}>
              Go to indexing <ArrowUpRight size={13} />
            </button>
          )}
        </p>
      )}
      <div className="suggestion-list">
        <AnimatePresence initial={false} mode="popLayout">
        {busy === "discover" &&
          [0, 1].map((i) => (
            <m.div
              className="suggestion skeleton"
              key={"skeleton-" + i}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              <span className="skeleton-line title" />
              <span className="skeleton-line" />
              <span className="skeleton-line short" />
              <span className="skeleton-chips">
                <span className="skeleton-line chip-line" />
                <span className="skeleton-line chip-line" />
              </span>
            </m.div>
          ))}
        {suggested.map((c) => (
          <m.article
            className={"suggestion" + (busy === c.id ? " is-working" : "")}
            key={c.id}
            {...cardExit}
          >
            <div className="suggestion-head">
              <h3>{c.title}</h3>
              {c.frequency && <span className="badge muted">{c.frequency}</span>}
            </div>
            <p>{c.summary}</p>
            {c.evidence.length > 0 && (
              <div className="chips">
                {c.evidence.map((ev) => {
                  const Icon = ev.provider === "Gmail" ? Mail : FileText;
                  const label = ev.title || ev.id;
                  return ev.url ? (
                    <a
                      className="chip"
                      key={ev.id}
                      href={ev.url}
                      target="_blank"
                      rel="noreferrer"
                      title={[ev.provider, ev.from].filter(Boolean).join(" · ")}
                    >
                      <Icon size={12} />
                      {label}
                    </a>
                  ) : (
                    <span className="chip" key={ev.id}>
                      <Icon size={12} />
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="suggestion-actions">
              <button
                className="primary"
                disabled={busy !== null}
                onClick={() => draft(c)}
              >
                {busy === c.id ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <BookOpen size={14} />
                )}
                {busy === c.id ? "Drafting…" : "Draft playbook"}
              </button>
              <button
                className="ghost"
                disabled={busy !== null}
                onClick={() => dismiss(c)}
              >
                Dismiss
              </button>
              {busy === c.id && (
                <span className="progress-note shimmer-text">
                  Drafting from the evidence — this can take a minute.
                </span>
              )}
            </div>
          </m.article>
        ))}
        {drafted.map((c) => {
          const article = articles.find((a) => a.id === c.articleId);
          return (
            <m.article className="suggestion drafted" key={c.id} {...cardExit}>
              <div className="suggestion-head">
                <h3>{c.title}</h3>
                <span className="badge ok">Draft ready</span>
              </div>
              {article && (
                <button
                  className="text-button"
                  onClick={() => onOpenArticle(article.id)}
                >
                  <BookOpen size={13} /> Open “{article.title}”
                </button>
              )}
            </m.article>
          );
        })}
        </AnimatePresence>
      </div>
    </section>
  );
}
