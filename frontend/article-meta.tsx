import React, { useState } from "react";
import { ClipboardCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  api,
  fromDateInput,
  fullDate,
  hasListSteps,
  isOverdue,
  toDateInput,
  type Article,
  type Person,
} from "./api";

/** Approval, ownership, periodic review and "run checklist" for one article. */
export function ArticleMeta({
  article,
  people,
  onSaved,
  onError,
  onOpenRun,
  onRunStarted,
}: {
  article: Article;
  people: Person[];
  onSaved: (a: Article) => void;
  onError: (message: string) => void;
  onOpenRun: (id: string) => void;
  onRunStarted: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [assignee, setAssignee] = useState(""),
    [runError, setRunError] = useState("");
  const published = article.status === "published";
  const due = published && isOverdue(article.reviewDueAt);
  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      onSaved(await api("/articles/" + article.id, "PATCH", body));
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function markReviewed() {
    setBusy("review");
    try {
      onSaved(await api(`/articles/${article.id}/review`, "POST", {}));
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function startRun() {
    setBusy("run");
    setRunError("");
    try {
      const run = await api(`/articles/${article.id}/runs`, "POST", {
        ...(assignee ? { assigneeId: assignee } : {}),
      });
      await onRunStarted();
      onOpenRun(run.id);
    } catch (e: any) {
      setRunError(e.message);
      setBusy(null);
    }
  }
  const owner = people.find((p) => p.id === article.ownerId);
  return (
    <div className="article-meta">
      <div className="meta-item">
        <span className="meta-label">Approval</span>
        {published && article.publishedBy ? (
          <span>
            <ShieldCheck size={13} /> Approved by {article.publishedBy.name}
            {article.publishedAt && " · " + fullDate(article.publishedAt)}
          </span>
        ) : published ? (
          <span>
            <ShieldCheck size={13} /> Published
            {article.publishedAt && " · " + fullDate(article.publishedAt)}
          </span>
        ) : (
          <span className="muted">Not approved yet. Publishing approves it.</span>
        )}
      </div>
      <div className="meta-item">
        <label className="meta-label" htmlFor={"owner-" + article.id}>
          Owner
        </label>
        <select
          id={"owner-" + article.id}
          value={article.ownerId || ""}
          disabled={busy === "owner"}
          onChange={(e) => patch({ ownerId: e.target.value || null }, "owner")}
        >
          <option value="">No owner</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status !== "active" ? ` (${p.status})` : ""}
            </option>
          ))}
          {article.ownerId && !owner && (
            <option value={article.ownerId}>Unknown person</option>
          )}
        </select>
      </div>
      {published && (
        <div className="meta-item">
          <label className="meta-label" htmlFor={"review-" + article.id}>
            Review due
          </label>
          <span className="meta-inline">
            <input
              id={"review-" + article.id}
              type="date"
              value={toDateInput(article.reviewDueAt)}
              disabled={busy === "due"}
              onChange={(e) =>
                patch({ reviewDueAt: fromDateInput(e.target.value) }, "due")
              }
            />
            {due && <span className="badge warn">Due for review</span>}
            <button
              className={due ? "primary compact" : "ghost"}
              onClick={markReviewed}
              disabled={busy === "review"}
            >
              {busy === "review" ? (
                <LoaderCircle className="spin" size={13} />
              ) : (
                <ClipboardCheck size={13} />
              )}
              Mark reviewed
            </button>
          </span>
          {article.reviewedAt && (
            <small className="muted">
              Last reviewed
              {article.reviewedBy ? " by " + article.reviewedBy.name : ""} ·{" "}
              {fullDate(article.reviewedAt)}
            </small>
          )}
        </div>
      )}
      {published && hasListSteps(article.content) && (
        <div className="meta-item">
          <span className="meta-label">Checklist</span>
          <span className="meta-inline">
            <select
              aria-label="Assign checklist to"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {people
                .filter((p) => p.status !== "left")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button className="ghost" onClick={startRun} disabled={busy === "run"}>
              {busy === "run" ? (
                <LoaderCircle className="spin" size={13} />
              ) : (
                <ClipboardCheck size={13} />
              )}
              Run checklist
            </button>
          </span>
          {runError && (
            <small className="inline-error" role="alert">
              {runError}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
