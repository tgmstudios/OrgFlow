import React, { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, RefreshCw } from "lucide-react";
import {
  api,
  actionLabels,
  dateTime,
  type AuditEntry,
  type OrgInfo,
} from "./api";

type Lookups = {
  articles: { id: string; title: string }[];
  people: { id: string; name: string }[];
  runs: { id: string; title: string }[];
  sources: { id: string; title: string }[];
};

function describe(entry: AuditEntry, lookups: Lookups) {
  const t = entry.target;
  if (!t) return "";
  if (typeof t === "string") return t;
  const parts: string[] = [];
  const article = t.articleId
    ? lookups.articles.find((a) => a.id === t.articleId)
    : null;
  if (article) parts.push(article.title);
  const run = t.runId ? lookups.runs.find((r) => r.id === t.runId) : null;
  if (run) parts.push(run.title);
  const person = t.personId
    ? lookups.people.find((p) => p.id === t.personId)
    : null;
  if (person) parts.push(person.name + (t.status ? ` (${t.status})` : ""));
  const source = t.sourceId
    ? lookups.sources.find((s) => s.id === t.sourceId)
    : null;
  if (source) parts.push(source.title);
  if (typeof t.candidates === "number")
    parts.push(
      `${t.candidates} new suggestion${t.candidates === 1 ? "" : "s"}` +
        (typeof t.sourcesRead === "number"
          ? ` from ${t.sourcesRead} source${t.sourcesRead === 1 ? "" : "s"}`
          : ""),
    );
  if (typeof t.sources === "number")
    parts.push(`${t.sources} source${t.sources === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function OrganizationPage({
  org,
  orgError,
  onOrgChange,
  onReloadOrg,
  lookups,
  userId,
}: {
  org: OrgInfo | null;
  orgError: string;
  onOrgChange: (org: OrgInfo) => void;
  onReloadOrg: () => void;
  lookups: Lookups;
  userId: string;
}) {
  const [audit, setAudit] = useState<AuditEntry[] | null>(null),
    [auditError, setAuditError] = useState(""),
    [auditLoading, setAuditLoading] = useState(false),
    [copied, setCopied] = useState(false),
    [rotating, setRotating] = useState(false),
    [codeError, setCodeError] = useState(""),
    [importingShowcase, setImportingShowcase] = useState(false),
    [showcaseError, setShowcaseError] = useState("");
  async function loadAudit() {
    setAuditLoading(true);
    try {
      const r = await api("/audit");
      setAudit(r.entries);
      setAuditError("");
    } catch (e: any) {
      setAuditError(e.message);
    } finally {
      setAuditLoading(false);
    }
  }
  useEffect(() => {
    loadAudit();
  }, []);
  async function copy() {
    if (!org?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(org.inviteCode);
      setCopied(true);
      setCodeError("");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCodeError("Copy failed. Select the code and copy it manually.");
    }
  }
  async function rotate() {
    if (
      !confirm(
        "Create a new invite code? The current code will stop working for new members.",
      )
    )
      return;
    setRotating(true);
    setCodeError("");
    try {
      const r = await api("/org/invite", "POST", {});
      if (org) onOrgChange({ ...org, inviteCode: r.inviteCode });
      loadAudit();
    } catch (e: any) {
      setCodeError(e.message);
    } finally {
      setRotating(false);
    }
  }
  async function importShowcase() {
    if (!org || org.role !== "admin" || org.name !== "Centre Valley Community Pantry (OrgFlow Showcase)")
      return;
    if (!confirm("Load fictional pantry documents, editable draft procedures, 5 staff roles, 9 example emails and 11 events into this organization? This does not connect your personal Google or Gmail account, and it will not automatically publish drafts."))
      return;
    setImportingShowcase(true);
    setShowcaseError("");
    try {
      await api("/showcase/install", "POST", { confirmation:"INSTALL_FICTIONAL_SHOWCASE" });
      window.location.reload();
    } catch(e:any) {
      setShowcaseError(e.message || "Could not load the example.");
      setImportingShowcase(false);
    }
  }
  return (
    <div className="page-content">
      <div className="page-title">
        <div>
          <p className="eyebrow">YOUR ORGANIZATION</p>
          <h1>{org?.name || "Organization"}</h1>
          <p>
            Members, invitations and a record of important changes.
            {org?.id === "default" &&
              " This is the shared demo workspace; create your own organization when you sign up."}
          </p>
        </div>
      </div>
      {orgError && !org && (
        <div className="card">
          <p className="inline-error" role="alert">
            {orgError}
          </p>
          <button className="ghost" onClick={onReloadOrg}>
            Retry
          </button>
        </div>
      )}
      {!org && !orgError && (
        <div className="loading">
          <LoaderCircle className="spin" /> Loading organization…
        </div>
      )}
      {org && (
        <div className="panel-grid">
          <div className="card">
            <div className="section-heading">
              <h2>Members</h2>
              <span className="badge muted">{org.members.length}</span>
            </div>
            <div className="row-list">
              {org.members.map((m) => (
                <div className="row" key={m.id}>
                  <span className="mini-avatar">{m.name[0]?.toUpperCase()}</span>
                  <div className="row-main">
                    <strong>
                      {m.name}
                      {m.id === userId && " (you)"}
                    </strong>
                    <small>{m.email}</small>
                  </div>
                  <span className={m.role === "admin" ? "badge ok" : "badge muted"}>
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="section-heading">
              <h2>Invite code</h2>
            </div>
            {org.role === "admin" && org.inviteCode ? (
              <>
                <p className="section-sub">
                  Share this code so teammates can join {org.name} when they
                  create their account.
                </p>
                <div className="invite-code">
                  <code key={org.inviteCode}>{org.inviteCode}</code>
                  <button className="ghost" onClick={copy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button className="ghost" onClick={rotate} disabled={rotating}>
                    {rotating ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    New code
                  </button>
                </div>
              </>
            ) : (
              <p className="section-sub">
                Only organization admins can see or change the invite code.
              </p>
            )}
            {codeError && (
              <p className="inline-error" role="alert">
                {codeError}
              </p>
            )}
          </div>
          {org.role === "admin" && org.name === "Centre Valley Community Pantry (OrgFlow Showcase)" && (
            <div className="card panel-wide">
              <div className="section-heading"><h2>Showcase library</h2></div>
              <p className="section-sub">
                Import the fictional Centre Valley Pantry documents into this private organization.
                The documents appear as OrgFlow Showcase files with working original links, cited
                source text, reporting relationships, and draft procedures for human review.
                Google and Gmail remain disconnected until separately authorized.
              </p>
              <button className="primary" onClick={importShowcase} disabled={importingShowcase}>
                {importingShowcase ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                {importingShowcase ? "Importing fictional data…" : "Load showcase files and staff"}
              </button>
              {showcaseError && <p className="inline-error" role="alert">{showcaseError}</p>}
            </div>
          )}
          <div className="card panel-wide">
            <div className="section-heading">
              <h2>Activity</h2>
              <button
                className="text-button"
                onClick={loadAudit}
                disabled={auditLoading}
              >
                {auditLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {auditError && (
              <p className="inline-error" role="alert">
                {auditError}
              </p>
            )}
            {!audit && !auditError && (
              <div className="loading small">
                <LoaderCircle className="spin" /> Loading activity…
              </div>
            )}
            {audit && !audit.length && (
              <p className="empty">No activity recorded yet.</p>
            )}
            {audit && audit.length > 0 && (
              <div className="row-list">
                {audit.map((e) => {
                  const detail = describe(e, lookups);
                  return (
                    <div className="row" key={e.id}>
                      <div className="row-main">
                        <strong>{actionLabels[e.action] || e.action}</strong>
                        <small>
                          {e.actor?.name || "Someone"}
                          {detail && " · " + detail}
                        </small>
                      </div>
                      <small className="row-meta">{dateTime(e.at)}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
