import React, { useEffect, useState } from "react";
import { ArrowUpRight, FileText, LoaderCircle, Mail, X } from "lucide-react";
import {
  api,
  fullDate,
  GOOGLE_INDEX_CONSENT,
  type IndexedSource,
} from "./api";
import { AnimatePresence, m, rowExit } from "./motion";
import { ProviderIcon } from "./provider-icons";

export function IndexSources({
  connected,
  onChanged,
}: {
  connected: boolean;
  onChanged: () => void;
}) {
  const [drive, setDrive] = useState(true),
    [gmail, setGmail] = useState(true),
    [gmailQuery, setGmailQuery] = useState(""),
    [consent, setConsent] = useState(false),
    [indexing, setIndexing] = useState(false),
    [result, setResult] = useState<{ drive: number; gmail: number; notice?: string } | null>(null),
    [error, setError] = useState(""),
    [sources, setSources] = useState<IndexedSource[] | null>(null),
    [listError, setListError] = useState(""),
    [removing, setRemoving] = useState<string | null>(null);
  async function load() {
    try {
      const r = await api("/sources");
      setSources(r.sources);
      setListError("");
    } catch (e: any) {
      setListError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function run() {
    setIndexing(true);
    setError("");
    setResult(null);
    try {
      const r = await api("/integrations/google/index", "POST", {
        consent: true,
        drive,
        gmail,
        ...(gmail && gmailQuery.trim() ? { gmailQuery: gmailQuery.trim() } : {}),
      });
      setResult({ ...r.indexed, notice: r.notice });
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIndexing(false);
    }
  }
  async function remove(id: string) {
    setRemoving(id);
    try {
      await api("/sources/" + encodeURIComponent(id), "DELETE");
      setSources((s) => (s ? s.filter((x) => x.id !== id) : s));
      setListError("");
      onChanged();
    } catch (e: any) {
      setListError(e.message);
    } finally {
      setRemoving(null);
    }
  }
  async function removeAll() {
    if (
      !confirm(
        "Remove all indexed email and document text from OrgFlow? Original files and emails stay in Google.",
      )
    )
      return;
    setRemoving("all");
    try {
      await api("/sources", "DELETE");
      setSources([]);
      setListError("");
      onChanged();
    } catch (e: any) {
      setListError(e.message);
    } finally {
      setRemoving(null);
    }
  }
  const canRun = connected && consent && (drive || gmail) && !indexing;
  return (
    <div
      className={"index-panel card" + (indexing ? " is-working" : "")}
      id="index-sources"
    >
      <div className="section-heading">
        <h2>Index email &amp; document text</h2>
      </div>
      <p className="section-sub">
        Lets OrgFlow answer questions from your real documents and email, and
        suggest playbooks for work your team repeats.
      </p>
      {!connected && (
        <p className="inline-note">Connect Google above to index your text.</p>
      )}
      <div className="index-options">
        <label className="check">
          <input
            type="checkbox"
            checked={drive}
            disabled={indexing}
            onChange={(e) => setDrive(e.target.checked)}
          />
          Google Docs, PDFs and Word files from Drive
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={gmail}
            disabled={indexing}
            onChange={(e) => setGmail(e.target.checked)}
          />
          Gmail messages
        </label>
        {gmail && (
          <input
            className="plain-input"
            aria-label="Gmail search filter (optional)"
            placeholder="Optional Gmail search, e.g. label:grants newer_than:90d"
            value={gmailQuery}
            disabled={indexing}
            onChange={(e) => setGmailQuery(e.target.value)}
          />
        )}
      </div>
      <label className="consent index-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={indexing}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {GOOGLE_INDEX_CONSENT}
      </label>
      <div className="index-actions">
        <button className="primary" disabled={!canRun} onClick={run}>
          {indexing ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <FileText size={15} />
          )}
          {indexing ? "Indexing…" : "Index now"}
        </button>
        {indexing && (
          <span className="progress-note shimmer-text" role="status">
            Reading and indexing your text. This can take a minute — keep this
            page open.
          </span>
        )}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p className="inline-success" role="status">
          Indexed {result.drive} document{result.drive === 1 ? "" : "s"} and{" "}
          {result.gmail} email{result.gmail === 1 ? "" : "s"}.
          {result.notice && " " + result.notice}
        </p>
      )}
      <div className="section-heading index-list-heading">
        <h2>Indexed sources</h2>
        {sources && sources.length > 0 && (
          <button
            className="text-button danger"
            onClick={removeAll}
            disabled={removing !== null}
          >
            {removing === "all" ? "Removing…" : "Remove all"}
          </button>
        )}
      </div>
      {listError && (
        <p className="inline-error" role="alert">
          {listError}{" "}
          <button className="text-button" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {!sources && !listError && (
        <div className="loading small">
          <LoaderCircle className="spin" /> Loading indexed sources…
          <span className="skeleton-rows" aria-hidden="true">
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line short" />
          </span>
        </div>
      )}
      {sources && !sources.length && (
        <p className="empty">Nothing indexed yet.</p>
      )}
      {sources && sources.length > 0 && (
        <div className="row-list">
          <AnimatePresence initial={false}>
          {sources.map((s) => (
            <m.div className="row" key={s.id} {...rowExit}>
              <span className="file-icon">
                <ProviderIcon provider={s.provider} size={20} />
              </span>
              <div className="row-main">
                <strong>{s.title}</strong>
                <small>
                  {s.provider === "OrgFlow Showcase" ? "OrgFlow Showcase" : s.provider}
                  {s.from && " · " + s.from}
                  {" · "}
                  {fullDate(s.updatedAt)}
                </small>
              </div>
              {s.url && (
                <a
                  className="text-button"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open <ArrowUpRight size={13} />
                </a>
              )}
              <button
                className="icon-button"
                aria-label={"Remove " + s.title}
                disabled={removing !== null}
                onClick={() => remove(s.id)}
              >
                {removing === s.id ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <X size={16} />
                )}
              </button>
            </m.div>
          ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
