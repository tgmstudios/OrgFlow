import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardCheck,
  Trash2,
} from "lucide-react";
import {
  api,
  dateTime,
  fullDate,
  isOverdue,
  type Article,
  type Person,
  type Run,
} from "./api";

const progress = (r: Run) => r.steps.filter((s) => s.done).length;

function RunRow({
  run,
  people,
  onOpen,
}: {
  run: Run;
  people: Person[];
  onOpen: () => void;
}) {
  const done = progress(run),
    total = run.steps.length,
    assignee = people.find((p) => p.id === run.assigneeId);
  return (
    <button className="run-row" onClick={onOpen}>
      <span className={"run-icon " + run.status}>
        {run.status === "completed" ? (
          <Check size={16} />
        ) : (
          <ClipboardCheck size={16} />
        )}
      </span>
      <div className="row-main">
        <strong>{run.title}</strong>
        <small>
          {assignee ? "Assigned to " + assignee.name : "Unassigned"}
          {" · "}
          {run.startedBy ? "Started by " + run.startedBy.name + " · " : "Started "}
          {fullDate(run.startedAt)}
          {run.status === "active" && run.dueAt && (
            <>
              {" · "}
              <span className={isOverdue(run.dueAt) ? "overdue" : ""}>
                Due {fullDate(run.dueAt)}
              </span>
            </>
          )}
        </small>
      </div>
      <div className="run-progress">
        <div
          className={
            "progress-bar" + (total && done === total ? " complete" : "")
          }
          aria-hidden="true"
        >
          <span style={{ transform: `scaleX(${total ? done / total : 0})` }} />
        </div>
        <small>
          {done}/{total}
        </small>
      </div>
    </button>
  );
}

export function ChecklistsPage({
  runs,
  people,
  articles,
  activeRun,
  onSelect,
  onRefresh,
  onOpenArticle,
}: {
  runs: Run[];
  people: Person[];
  articles: Article[];
  activeRun: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => Promise<void> | void;
  onOpenArticle: (id: string) => void;
}) {
  // Responses from step updates, shown immediately until the next refresh lands.
  const [local, setLocal] = useState<Record<string, Run>>({}),
    [pendingStep, setPendingStep] = useState<string | null>(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  useEffect(() => setLocal((l) => (Object.keys(l).length ? {} : l)), [runs]);
  const merged = runs.map((r) => local[r.id] ?? r);
  const selected = merged.find((r) => r.id === activeRun);
  const active = merged.filter((r) => r.status === "active");
  const completed = merged.filter((r) => r.status === "completed");

  async function toggle(run: Run, stepId: string, done: boolean) {
    setPendingStep(run.id + stepId);
    setError("");
    try {
      const updated: Run = await api(
        `/runs/${run.id}/steps/${stepId}`,
        "PATCH",
        { done },
      );
      setLocal((l) => ({ ...l, [run.id]: updated }));
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPendingStep(null);
    }
  }
  async function remove(run: Run) {
    if (!confirm(`Delete the checklist “${run.title}”? This can't be undone.`))
      return;
    setDeleting(true);
    setError("");
    try {
      await api("/runs/" + run.id, "DELETE");
      await onRefresh();
      onSelect(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (selected) {
    const done = progress(selected),
      article = articles.find((a) => a.id === selected.articleId),
      assignee = people.find((p) => p.id === selected.assigneeId);
    return (
      <div className="page-content" key={"run-" + selected.id}>
        <div className="run-detail">
          <button className="text-button" onClick={() => onSelect(null)}>
            ‹ All checklists
          </button>
          <div className="page-title run-title">
            <div>
              <p className="eyebrow">
                {selected.status === "completed" ? "COMPLETED" : "IN PROGRESS"}
              </p>
              <h1>{selected.title}</h1>
              <p>
                {done} of {selected.steps.length} steps done
                {" · "}
                {assignee ? "Assigned to " + assignee.name : "Unassigned"}
                {" · "}
                {selected.startedBy
                  ? "Started by " + selected.startedBy.name + " on "
                  : "Started "}
                {fullDate(selected.startedAt)}
                {selected.dueAt && " · Due " + fullDate(selected.dueAt)}
                {selected.completedAt &&
                  " · Completed " + fullDate(selected.completedAt)}
              </p>
            </div>
            <div className="title-actions">
              {article && (
                <button className="ghost" onClick={() => onOpenArticle(article.id)}>
                  <BookOpen size={14} /> Playbook <ArrowUpRight size={13} />
                </button>
              )}
              <button
                className="ghost danger"
                disabled={deleting}
                onClick={() => remove(selected)}
              >
                <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
          <div
            className={
              "progress-bar large" +
              (selected.steps.length && done === selected.steps.length
                ? " complete"
                : "")
            }
            aria-hidden="true"
          >
            <span
              style={{
                transform: `scaleX(${
                  selected.steps.length ? done / selected.steps.length : 0
                })`,
              }}
            />
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="card steps-card">
            {selected.steps.map((s) => (
              <label
                className={
                  (s.done ? "step done" : "step") +
                  (pendingStep === selected.id + s.id ? " pending" : "")
                }
                key={s.id}
              >
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={pendingStep === selected.id + s.id}
                  onChange={(e) => toggle(selected, s.id, e.target.checked)}
                />
                <div>
                  <span>{s.text}</span>
                  {s.done && (
                    <small>
                      Completed
                      {s.doneBy ? " by " + s.doneBy.name : ""}
                      {s.doneAt ? " · " + dateTime(s.doneAt) : ""}
                    </small>
                  )}
                  {s.note && <small>Note: {s.note}</small>}
                </div>
              </label>
            ))}
            {!selected.steps.length && (
              <p className="empty">This checklist has no steps.</p>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="page-content" key="runs">
      <div className="page-title">
        <div>
          <p className="eyebrow">PUT PLAYBOOKS TO WORK</p>
          <h1>Checklists</h1>
          <p>
            Run a published playbook step by step. Start one from any playbook
            with a list of steps.
          </p>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!merged.length && (
        <div className="card">
          <p className="empty">
            No checklists yet. Open a published playbook in the Knowledge Base
            and choose “Run checklist”.
          </p>
        </div>
      )}
      {active.length > 0 && (
        <div className="card run-section">
          <div className="section-heading">
            <h2>Active</h2>
            <span className="badge muted">{active.length}</span>
          </div>
          {active.map((r) => (
            <RunRow key={r.id} run={r} people={people} onOpen={() => onSelect(r.id)} />
          ))}
        </div>
      )}
      {completed.length > 0 && (
        <div className="card run-section">
          <div className="section-heading">
            <h2>Completed</h2>
            <span className="badge muted">{completed.length}</span>
          </div>
          {completed.map((r) => (
            <RunRow key={r.id} run={r} people={people} onOpen={() => onSelect(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
