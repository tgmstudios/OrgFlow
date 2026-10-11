import React, { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  LoaderCircle,
  Mic,
  Plus,
  Sparkles,
} from "lucide-react";
import { api, fullDate, type Article, type InterviewPlan, type Person } from "./api";
import { Collapse } from "./motion";

const statusLabel: Record<Person["status"], string> = {
  active: "Active",
  leaving: "Leaving",
  left: "Left",
};
const statusClass: Record<Person["status"], string> = {
  active: "badge ok",
  leaving: "badge warn",
  left: "badge muted",
};

function PersonDetail({
  person,
  people,
  articles,
  onBack,
  onRefresh,
  onOpenArticle,
  onOpenRun,
  onStartInterview,
}: {
  person: Person;
  people: Person[];
  articles: Article[];
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
  onOpenArticle: (id: string) => void;
  onOpenRun: (id: string) => void;
  onStartInterview: (plan: InterviewPlan) => void;
}) {
  const [name, setName] = useState(person.name),
    [role, setRole] = useState(person.role),
    [email, setEmail] = useState(person.email || ""),
    [status, setStatus] = useState<Person["status"]>(person.status),
    [leaveDate, setLeaveDate] = useState(person.leaveDate || ""),
    [successorId, setSuccessorId] = useState(person.successorId || ""),
    [saving, setSaving] = useState(false),
    [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null),
    [notes, setNotes] = useState(""),
    [task, setTask] = useState<"handoff" | "onboarding" | null>(null),
    [transferError, setTransferError] = useState(""),
    [handoffDone, setHandoffDone] = useState<{
      message: string;
      articleId?: string;
    } | null>(null);
  const others = people.filter((p) => p.id !== person.id);
  const owned = articles.filter((a) => a.ownerId === person.id);
  const guide = articles.find((a) => a.id === person.handoffArticleId);
  const successor = people.find((p) => p.id === (successorId || person.successorId));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await api("/people/" + person.id, "PATCH", {
        name,
        role,
        email,
        status,
        leaveDate,
        successorId,
      });
      await onRefresh();
      setSaveMsg({ ok: true, text: "Saved." });
    } catch (err: any) {
      setSaveMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }
  async function handoff() {
    setTask("handoff");
    setTransferError("");
    setHandoffDone(null);
    try {
      const r = await api(`/people/${person.id}/handoff`, "POST", {
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      await onRefresh();
      if (r.person?.status) setStatus(r.person.status);
      setHandoffDone({ message: r.message, articleId: r.draft?.id });
    } catch (err: any) {
      setTransferError(err.message);
    } finally {
      setTask(null);
    }
  }
  /** Facts-only guide from OrgFlow's records: no AI, no consent needed. */
  async function outline() {
    setTask("handoff");
    setTransferError("");
    setHandoffDone(null);
    try {
      const r = await api(`/people/${person.id}/handoff`, "POST", { mode: "outline" });
      await onRefresh();
      if (r.person?.status) setStatus(r.person.status);
      setHandoffDone({
        message: "Outline created from recorded facts.",
        articleId: r.draft?.id,
      });
    } catch (err: any) {
      setTransferError(err.message);
    } finally {
      setTask(null);
    }
  }
  /** A gap-driven question plan for the live voice interview. */
  async function interview() {
    setTransferError("");
    try {
      onStartInterview(await api(`/people/${person.id}/interview`, "POST", {}));
    } catch (err: any) {
      setTransferError(err.message);
    }
  }
  async function onboarding() {
    setTask("onboarding");
    setTransferError("");
    try {
      const run = await api(`/people/${person.id}/onboarding`, "POST", {
        ...(successorId ? { successorId } : {}),
      });
      await onRefresh();
      onOpenRun(run.id);
    } catch (err: any) {
      setTransferError(err.message);
      setTask(null);
    }
  }
  return (
    <div className="page-content">
      <button className="text-button" onClick={onBack}>
        ‹ All people
      </button>
      <div className="page-title person-title">
        <div>
          <p className="eyebrow">PEOPLE &amp; TRANSFER</p>
          <h1>{person.name}</h1>
          <p>
            {person.role}
            {person.email && " · " + person.email}
          </p>
        </div>
        <span className={statusClass[person.status]}>
          {statusLabel[person.status]}
        </span>
      </div>
      <div className="panel-grid">
        <form className="card form-card" onSubmit={save}>
          <div className="section-heading">
            <h2>Details</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Role
              <input
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </label>
            <label className="field">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Person["status"])}
              >
                <option value="active">Active</option>
                <option value="leaving">Leaving</option>
                <option value="left">Left</option>
              </select>
            </label>
            <label className="field">
              Leave date
              <input
                type="date"
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
              />
            </label>
            <label className="field">
              Successor
              <select
                value={successorId}
                onChange={(e) => setSuccessorId(e.target.value)}
              >
                <option value="">No successor yet</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saveMsg && (
              <span
                className={saveMsg.ok ? "inline-success" : "inline-error"}
                role={saveMsg.ok ? "status" : "alert"}
              >
                {saveMsg.text}
              </span>
            )}
          </div>
          {owned.length > 0 && (
            <div className="owned">
              <strong>Playbooks owned ({owned.length})</strong>
              {owned.map((a) => (
                <button
                  className="text-button"
                  key={a.id}
                  type="button"
                  onClick={() => onOpenArticle(a.id)}
                >
                  <BookOpen size={13} /> {a.title}
                </button>
              ))}
            </div>
          )}
        </form>
        <div
          className={
            "card form-card" + (task === "handoff" ? " is-working" : "")
          }
        >
          <div className="section-heading">
            <h2>
              <Sparkles size={15} /> Handoff guide
            </h2>
          </div>
          <p className="section-sub">
            OrgFlow drafts a role guide from the playbooks {person.name} owns
            and the emails they sent that you have indexed
            {person.email ? "" : " (add their email so sent mail can be matched)"}
            . It is a draft: a staff member must review and approve it before it
            becomes a published playbook.
          </p>
          <label className="field">
            Notes for the guide (optional)
            <textarea
              rows={4}
              maxLength={5000}
              placeholder="Anything the AI should know: priorities, unfinished work, who to call…"
              value={notes}
              disabled={task !== null}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button className="primary" disabled={task !== null} onClick={handoff}>
              {task === "handoff" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              {task === "handoff"
                ? "Drafting…"
                : guide
                  ? "Revise handoff guide"
                  : "Generate handoff guide"}
            </button>
            <button className="ghost" disabled={task !== null} onClick={outline}>
              <FileText size={15} /> Outline without AI
            </button>
            <button className="ghost" disabled={task !== null} onClick={interview}>
              <Mic size={15} /> Plan a voice interview
            </button>
            {task === "handoff" && (
              <span className="progress-note shimmer-text" role="status">
                Reading playbooks and indexed email. This can take a minute.
              </span>
            )}
          </div>
          {handoffDone && (
            <p className="inline-success" role="status">
              {handoffDone.message || "Handoff guide drafted."}{" "}
              {handoffDone.articleId && (
                <button
                  className="text-button"
                  onClick={() => onOpenArticle(handoffDone.articleId!)}
                >
                  Review the draft <ArrowUpRight size={13} />
                </button>
              )}
            </p>
          )}
          {guide && !handoffDone && (
            <p className="inline-note">
              <button className="text-button" onClick={() => onOpenArticle(guide.id)}>
                <BookOpen size={13} /> Open “{guide.title}” ({guide.status})
              </button>
            </p>
          )}
          {guide && (
            <div className="onboarding-box">
              <strong>Onboarding for the successor</strong>
              <p className="section-sub">
                Turns the guide’s steps into a checklist assigned to{" "}
                {successor ? successor.name : "the successor"}.
                {guide.status !== "published" &&
                  " The guide is still a draft; you can review it before starting."}
              </p>
              <div className="form-actions">
                <select
                  aria-label="Successor"
                  value={successorId}
                  disabled={task !== null}
                  onChange={(e) => setSuccessorId(e.target.value)}
                >
                  <option value="">Choose a successor…</option>
                  {others.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost"
                  disabled={task !== null || !(successorId || person.successorId)}
                  onClick={onboarding}
                >
                  {task === "onboarding" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <ClipboardCheck size={14} />
                  )}
                  Start onboarding checklist
                </button>
              </div>
            </div>
          )}
          {transferError && (
            <p className="inline-error" role="alert">
              {transferError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PeoplePage({
  people,
  articles,
  onRefresh,
  onOpenArticle,
  onOpenRun,
  onStartInterview,
}: {
  people: Person[];
  articles: Article[];
  onRefresh: () => Promise<void> | void;
  onOpenArticle: (id: string) => void;
  onOpenRun: (id: string) => void;
  onStartInterview: (plan: InterviewPlan) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [role, setRole] = useState(""),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = people.find((p) => p.id === selectedId);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await api("/people", "POST", {
        name,
        role,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      await onRefresh();
      setName("");
      setRole("");
      setEmail("");
      setAdding(false);
      setSelectedId(p.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (selected)
    return (
      <PersonDetail
        key={selected.id}
        person={selected}
        people={people}
        articles={articles}
        onBack={() => setSelectedId(null)}
        onRefresh={onRefresh}
        onOpenArticle={onOpenArticle}
        onOpenRun={onOpenRun}
        onStartInterview={onStartInterview}
      />
    );
  return (
    <div className="page-content">
      <div className="page-title">
        <div>
          <p className="eyebrow">KNOWLEDGE THAT STAYS</p>
          <h1>People</h1>
          <p>
            Track who owns what, and capture a person’s know-how before they
            move on.
          </p>
        </div>
        <button
          className="primary"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <Plus size={17} /> Add person
        </button>
      </div>
      <Collapse open={adding}>
        <form className="card form-card add-person" onSubmit={add}>
          <div className="form-grid">
            <label className="field">
              Name
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Role
              <input
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </label>
            <label className="field">
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? "Adding…" : "Add person"}
            </button>
            <button type="button" className="ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            {error && (
              <span className="inline-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </form>
      </Collapse>
      <div className="card people-card">
        {people.map((p) => {
          const owned = articles.filter((a) => a.ownerId === p.id).length,
            succ = people.find((x) => x.id === p.successorId);
          return (
            <button className="person-row" key={p.id} onClick={() => setSelectedId(p.id)}>
              <span className="mini-avatar">{p.name[0]?.toUpperCase()}</span>
              <div className="row-main">
                <strong>{p.name}</strong>
                <small>
                  {p.role}
                  {p.email && " · " + p.email}
                </small>
              </div>
              <small className="row-meta">
                {owned > 0 && `${owned} playbook${owned === 1 ? "" : "s"}`}
                {p.leaveDate && ` · leaves ${fullDate(p.leaveDate)}`}
                {succ && ` · successor ${succ.name}`}
              </small>
              <span className={statusClass[p.status]}>{statusLabel[p.status]}</span>
            </button>
          );
        })}
        {!people.length && (
          <p className="empty">
            No people yet. Add the people who own your playbooks and
            processes.
          </p>
        )}
      </div>
    </div>
  );
}
