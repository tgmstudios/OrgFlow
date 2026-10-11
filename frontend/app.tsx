import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Sparkles,
  Home,
  FolderOpen,
  BookOpen,
  Search,
  ArrowUp,
  ArrowUpRight,
  Plus,
  ChevronRight,
  CalendarDays,
  FileText,
  MoreHorizontal,
  PanelBottomClose,
  X,
  Mic,
  MessageSquare,
  Check,
  Bold,
  Italic,
  List,
  ListChecks,
  ImagePlus,
  Link,
  Heading2,
  LoaderCircle,
  Settings,
  Layers,
} from "lucide-react";
import "./style.css";
type Article = {
  id: string;
  title: string;
  categoryId: string;
  content: any;
  status: string;
  updatedAt: string;
  sources?: any[];
};
type Data = {
  categories: { id: string; name: string }[];
  articles: Article[];
  files: any[];
  events: any[];
  integrations: any[];
  meta?: any;
};
type Message = { role: "user" | "assistant"; content: string; sources?: any[] };
async function api(path: string, method = "GET", body?: any) {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (r.status === 401 && !path.startsWith("/auth/")) {
    window.dispatchEvent(new Event("orgflow:signed-out"));
  }
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
type User = { id: string; email: string; name: string };
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
function AuthScreen({ onUser }: { onUser: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/" + mode, "POST", { name, email, password });
      onUser(r.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-static">
          orgflow<span className="brand-dot">.</span>
        </div>
        <h1>{mode === "login" ? "Sign in" : "Create your account"}</h1>
        {mode === "signup" && (
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="auth-submit" disabled={busy}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    const out = () => setUser(null);
    window.addEventListener("orgflow:signed-out", out);
    return () => window.removeEventListener("orgflow:signed-out", out);
  }, []);
  if (user === undefined) return null;
  if (!user) return <AuthScreen onUser={setUser} />;
  return (
    <App
      user={user}
      onLogout={async () => {
        await api("/auth/logout", "POST", {}).catch(() => {});
        setUser(null);
      }}
    />
  );
}
const date = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const pagePaths: Record<string, string> = {
  Home: "/",
  Files: "/files",
  "Knowledge Base": "/knowledge-base",
};
const currentPage = () =>
  location.pathname.replace(/^\/a(?=\/|$)/, "").startsWith("/knowledge-base")
    ? "Knowledge Base"
    : location.pathname.replace(/^\/a(?=\/|$)/, "").startsWith("/files")
      ? "Files"
      : "Home";
function App({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [data, setData] = useState<Data | null>(null),
    [page, setPageState] = useState(currentPage),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [active, setActive] = useState<string | null>(null),
    [calendar, setCalendar] = useState("agenda"),
    [month, setMonth] = useState(new Date()),
    [agent, setAgent] = useState(false),
    [docked, setDocked] = useState(false),
    [tab, setTab] = useState("chat"),
    [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false),
    [voiceNote, setVoiceNote] = useState(""),
    [provider, setProvider] = useState("All providers"),
    [folder, setFolder] = useState(""),
    [capture, setCapture] = useState(false),
    [sources, setSources] = useState<any[]>([]),
    [sourceOptions, setSourceOptions] = useState<any[]>([]),
    [consent, setConsent] = useState(false),
    [captureProvider, setCaptureProvider] = useState("drive"),
    [captureError, setCaptureError] = useState("");
  function focusChat() {
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLTextAreaElement>(".agent-input textarea")
        ?.focus(),
    );
  }
  function setPage(next: string) {
    setPageState(next);
    setAgent(false);
    const prefix = /^\/a(?:\/|$)/.test(location.pathname) ? "/a" : "";
    const path = prefix + (pagePaths[next] ?? "/");
    if (location.pathname !== path) history.pushState({}, "", path);
  }
  useEffect(() => {
    const onPop = () => setPageState(currentPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const recognition = useRef<any>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [mode, setMode] = useState<"ask" | "draft">("ask");
  const refresh = async () => {
    try {
      setData(await api("/bootstrap"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (!agent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAgent(false);
        recognition.current?.stop();
        window.speechSynthesis?.cancel();
        document.querySelector<HTMLButtonElement>(".agent-launch")?.focus();
      }
      if (e.key === "Tab" && !docked) {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".agent-window button:not(:disabled), .agent-window input, .agent-window textarea, .agent-window select, .agent-window a[href]",
          ),
        ).filter((el) => el.offsetParent !== null);
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLTextAreaElement>(".agent-input textarea")
        ?.focus(),
    );
    return () => window.removeEventListener("keydown", onKey);
  }, [agent, docked]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (pageRef.current === "Home") focusChat();
        else setAgent((a) => !a);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function send(text = input, requestedMode = mode) {
    if (!text.trim() || busy) return;
    if (sources.length && !consent) {
      setCaptureError(
        "Confirm consent before sending selected source text to AI.",
      );
      return;
    }
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api("/agent", "POST", {
        messages: next.map(({ role, content }) => ({ role, content })),
        mode: requestedMode,
        articleId: active || undefined,
        ...(sources.length ? { sources, sourcesConsent: consent } : {}),
      });
      setMessages([
        ...next,
        { role: "assistant", content: r.message, sources: r.sources },
      ]);
      if (tab === "voice" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(r.message);
        window.speechSynthesis.speak(u);
      }
      if (r.draft) {
        await refresh();
        setActive(r.draft.id);
        setPage("Knowledge Base");
      }
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: e.message }]);
    } finally {
      setBusy(false);
    }
  }
  function voice() {
    const W = window as any;
    const Speech = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Speech) {
      setVoiceNote(
        "Speech recognition is not supported in this browser. Use Chat, or try Chrome with microphone access.",
      );
      return;
    }
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Speech();
    recognition.current = r;
    r.lang = "en-US";
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = (e: any) => {
      setVoiceNote(
        "Microphone unavailable: " + e.error + ". You can continue in Chat.",
      );
      setListening(false);
    };
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput(text);
      send(text);
    };
    r.start();
  }
  const selected = data?.articles.find((a) => a.id === active);
  const files = (data?.files || []).filter(
    (f) =>
      (provider === "All providers" || f.provider === provider) &&
      `${f.name} ${f.orgflowPath} ${f.originalPath} ${f.provider}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const folderPaths = (f: any) =>
    String(f.orgflowPath || f.originalPath || "").replace(/^\/+|\/+$/g, "");
  const folderItems = [
    ...new Set(
      files
        .map((f) => folderPaths(f))
        .filter((p) => p.startsWith(folder ? folder + "/" : ""))
        .map((p) => p.slice(folder ? folder.length + 1 : 0).split("/")[0] || "")
        .filter(Boolean),
    ),
  ];
  const shownFiles = query
    ? files
    : files.filter((f) => folderPaths(f) === folder);
  const openAgent = (text?: string) => {
    if (page === "Home") focusChat();
    else setAgent(true);
    if (text) send(text);
  };
  const inline = page === "Home";
  const assistant = (
    <>
      {!inline && (
        <div
          className={docked ? "" : "modal-backdrop"}
          onClick={() => !docked && setAgent(false)}
        />
      )}
      <section
        className={
          inline
            ? "agent-window inline"
            : docked
              ? "agent-window docked"
              : "agent-window"
        }
        role={inline ? "region" : "dialog"}
        aria-modal={inline ? undefined : !docked}
        aria-label="OrgFlow assistant"
      >
        <div className="agent-header">
          <span className="agent-symbol">
            <Sparkles size={20} />
          </span>
          <div>
            <strong>OrgFlow assistant</strong>
            <small>Clarity, one conversation at a time.</small>
          </div>
          {!inline && (
            <>
              <button
                className="icon-button"
                title={docked ? "Center window" : "Dock bottom right"}
                onClick={() => setDocked(!docked)}
              >
                <PanelBottomClose size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Close assistant"
                onClick={() => {
                  setAgent(false);
                  recognition.current?.stop();
                  window.speechSynthesis?.cancel();
                }}
              >
                <X size={19} />
              </button>
            </>
          )}
        </div>
        <div className="agent-tabs">
          <div className="segmented">
            <button
              className={tab === "chat" ? "on" : ""}
              onClick={() => setTab("chat")}
            >
              <MessageSquare size={15} />
              Chat
            </button>
            <button
              className={tab === "voice" ? "on" : ""}
              onClick={() => setTab("voice")}
            >
              <Mic size={15} />
              Voice
            </button>
          </div>
          <select
            aria-label="Assistant task"
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
          >
            <option value="ask">Ask a question</option>
            <option value="draft">Draft a playbook</option>
          </select>
        </div>
        <div className="capture-toolbar">
          <button className="text-button" onClick={() => setCapture(!capture)}>
            <Plus size={14} /> Capture from sources{" "}
            {sources.length > 0 && `(${sources.length})`}
          </button>
        </div>
        {capture && (
          <div className="capture-panel">
            <p>
              Explicitly select source text to share with the AI provider.
              Private files are never read automatically.
            </p>
            <div className="capture-actions">
              <select
                aria-label="Source provider"
                value={captureProvider}
                onChange={(e) => setCaptureProvider(e.target.value)}
              >
                <option value="drive">Google Drive</option>
                <option value="gmail">Gmail</option>
              </select>
              <button
                onClick={async () => {
                  try {
                    const r = await api(
                      "/sources/google?provider=" + captureProvider,
                    );
                    setSourceOptions(r.sources);
                    setCaptureError("");
                  } catch (e: any) {
                    setCaptureError(e.message);
                  }
                }}
              >
                List sources
              </button>
              <label className="upload-button">
                Upload text
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 12000) {
                      setCaptureError("Use a text file under 12 KB.");
                      return;
                    }
                    setSources([
                      ...sources,
                      {
                        id: "upload-" + Date.now(),
                        title: file.name,
                        text: await file.text(),
                      },
                    ]);
                    setConsent(false);
                    setMode("draft");
                  }}
                />
              </label>
            </div>
            {sourceOptions.length > 0 && (
              <select
                aria-label="Select source to read"
                value=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  try {
                    const r = await api(
                      "/sources/google/" +
                        captureProvider +
                        "/" +
                        encodeURIComponent(e.target.value),
                    );
                    setSources([...sources, r]);
                    setConsent(false);
                    setMode("draft");
                    setCaptureError("");
                  } catch (err: any) {
                    setCaptureError(err.message);
                  }
                }}
              >
                <option value="">Select a source to read…</option>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
            {sources.map((s, i) => (
              <div className="selected-source" key={s.id}>
                <FileText size={13} />
                {s.title}
                <button
                  aria-label={"Remove " + s.title}
                  onClick={() => {
                    setSources(sources.filter((_, j) => i !== j));
                    setConsent(false);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {sources.length > 0 && (
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                I approve sending this selected text to the external AI provider
                for drafting.
              </label>
            )}
            {captureError && (
              <p className="capture-error" role="alert">
                {captureError}
              </p>
            )}
          </div>
        )}
        <div className="messages">
          {!messages.length && (
            <div className="agent-welcome">
              <span className="welcome-orb">
                <Sparkles size={30} />
              </span>
              <h2>How can I help your team?</h2>
              <p>
                Ask a question, work through a process, or turn what you know
                into a draft playbook.
              </p>
              {inline && (
                <div className="prompt-chips">
                  {[
                    "Draft a donor stewardship SOP",
                    "Help me find a document",
                    "Interview me about a process",
                  ].map((p) => {
                    const m = /SOP|Interview/.test(p) ? "draft" : "ask";
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setMode(m);
                          send(p, m);
                        }}
                      >
                        {p}
                        <ArrowUpRight size={13} />
                      </button>
                    );
                  })}
                </div>
              )}
              <small>
                AI responses need review. Publishing always stays in your hands.
              </small>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={"message " + m.role}>
              <span>
                {m.role === "assistant" ? (
                  <Sparkles size={16} />
                ) : (
                  <span className="mini-avatar">Y</span>
                )}
              </span>
              <div>
                {m.content}
                {m.sources && m.sources.length > 0 && (
                  <div className="source-citations">
                    <strong>Sources</strong>
                    {m.sources.map((source: any, j: number) => {
                      const article = data?.articles.find(
                        (a) => a.id === source.id,
                      );
                      return (
                        <div key={source.id || j}>
                          {article ? (
                            <button
                              onClick={() => {
                                setActive(article.id);
                                setPage("Knowledge Base");
                                setAgent(false);
                              }}
                            >
                              <BookOpen size={12} />
                              {source.title || article.title}
                            </button>
                          ) : source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText size={12} />
                              {source.title || source.id}
                              <ArrowUpRight size={12} />
                            </a>
                          ) : (
                            <span>
                              <FileText size={12} />
                              {source.title || source.id}
                            </span>
                          )}
                          {source.synthetic && <small>Demo</small>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="message assistant">
              <LoaderCircle className="spin" size={16} />
              <div>Working on that…</div>
            </div>
          )}
        </div>
        {tab === "voice" && (
          <div className="voice-controls">
            <button
              className={listening ? "mic-button listening" : "mic-button"}
              onClick={voice}
              disabled={busy}
            >
              <Mic size={25} />
            </button>
            <strong>
              {listening ? "Listening… tap to finish" : "Tap to speak"}
            </strong>
            <p>
              {voiceNote ||
                "Browser speech services may send audio to your browser vendor. Supported browsers can read responses aloud."}
            </p>
          </div>
        )}
        <form
          className="agent-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            aria-label="Message assistant"
            placeholder={
              mode === "draft"
                ? "Describe the process you want to capture…"
                : "Ask your assistant…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="send"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={19} />
          </button>
        </form>
        <div className="agent-disclaimer">
          Drafts autosave. A staff member reviews and publishes.
        </div>
      </section>
    </>
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("Home")}>
          <span className="brand-mark">
            <Layers size={23} />
          </span>
          orgflow<span className="brand-dot">.</span>
        </button>
        <button className="agent-launch" onClick={() => openAgent()}>
          <Sparkles size={18} /> Your AI assistant <span>⌘ J</span>
        </button>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {[
            [Home, "Home"],
            [FolderOpen, "Files"],
            [BookOpen, "Knowledge Base"],
          ].map(([Icon, label]: any) => (
            <button
              className={page === label ? "nav-item selected" : "nav-item"}
              key={label}
              onClick={() => {
                setPage(label);
                setQuery("");
              }}
            >
              <Icon size={19} />
              {label}
              {label === "Knowledge Base" && (
                <small>{data?.articles.length || 0}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span className="workspace-avatar">O</span>
            <div>
              <strong>Our organization</strong>
              <small>Shared workspace</small>
            </div>
          </div>
          <div className="demo-indicator">
            <span />{" "}
            {data?.meta?.demo === false
              ? "Organization workspace"
              : "Demo workspace"}{" "}
            <span className="info">i</span>
          </div>
          <div className="account-row">
            <span title={user.email}>{user.name}</span>
            <button onClick={onLogout}>Sign out</button>
          </div>
          <a
            className="docs-link"
            href="/docs"
            target="_blank"
            rel="noreferrer"
          >
            <Settings size={15} /> API documentation <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </span>
          <div className="top-right">
            <span className="live-label">
              Your organization's living memory
            </span>
            <span className="avatar" title={user.email}>
              {initials(user.name)}
            </span>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error} <button onClick={refresh}>Retry</button>
          </div>
        )}
        {!data && !error ? (
          <div className="loading">
            <LoaderCircle className="spin" /> Loading your workspace…
          </div>
        ) : (
          <>
            {inline && assistant}
            {page === "Files" && (
              <div className="page-content">
                <div className="page-title">
                  <div>
                    <p className="eyebrow">EVERYTHING, IN ONE PLACE</p>
                    <h1>Your files</h1>
                    <p>
                      A shared index. Original documents stay right where they
                      belong.
                    </p>
                  </div>
                </div>
                <div className="provider-row">
                  {[
                    "All providers",
                    ...new Set((data?.files || []).map((f) => f.provider)),
                  ].map((p) => (
                    <button
                      className={
                        provider === p ? "provider active" : "provider"
                      }
                      key={p}
                      onClick={() => {
                        setProvider(p);
                        setFolder("");
                      }}
                    >
                      <FolderOpen size={16} />
                      {p}
                    </button>
                  ))}
                </div>
                <div className="card files-card">
                  <div className="files-toolbar">
                    <span>
                      <FolderOpen size={17} />{" "}
                      <button onClick={() => setFolder("")}>{provider}</button>
                      {folder
                        .split("/")
                        .filter(Boolean)
                        .map((part, i) => (
                          <React.Fragment key={i}>
                            <ChevronRight size={14} />
                            <button
                              onClick={() =>
                                setFolder(
                                  folder
                                    .split("/")
                                    .slice(0, i + 1)
                                    .join("/"),
                                )
                              }
                            >
                              {part}
                            </button>
                          </React.Fragment>
                        ))}
                    </span>
                    <label className="search">
                      <Search size={16} />
                      <input
                        placeholder="Search files or folders"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>OrgFlow folder</th>
                          <th>Provider</th>
                          <th>Updated</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {!query &&
                          folderItems.map((name) => (
                            <tr key={"folder" + name}>
                              <td colSpan={5}>
                                <button
                                  className="folder-link"
                                  onClick={() =>
                                    setFolder(
                                      folder ? folder + "/" + name : name,
                                    )
                                  }
                                >
                                  <FolderOpen size={22} />
                                  <strong>{name}</strong>
                                  <ChevronRight size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        {shownFiles.map((f) => (
                          <tr key={f.id}>
                            <td>
                              <a href={f.url} target="_blank" rel="noreferrer">
                                <span className="file-icon">
                                  <FileText size={19} />
                                </span>
                                <div>
                                  <strong>
                                    {f.name}
                                    {f.synthetic && (
                                      <span className="demo-tag">Demo</span>
                                    )}
                                  </strong>
                                  <small>{f.originalPath}</small>
                                </div>
                                <ArrowUpRight size={14} />
                              </a>
                            </td>
                            <td>{f.orgflowPath || f.originalPath}</td>
                            <td>
                              <span className="provider-badge">
                                {f.provider}
                              </span>
                            </td>
                            <td>{date(f.updatedAt)}</td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={"Reorganize " + f.name}
                                onClick={async () => {
                                  const path = prompt(
                                    "OrgFlow folder path (original file will stay in place)",
                                    f.orgflowPath || f.originalPath,
                                  );
                                  if (path !== null) {
                                    try {
                                      await api("/files/" + f.id, "PATCH", {
                                        orgflowPath: path,
                                      });
                                      refresh();
                                    } catch (e: any) {
                                      setError(e.message);
                                    }
                                  }
                                }}
                              >
                                <MoreHorizontal size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!shownFiles.length && !folderItems.length && (
                    <p className="empty">No files found.</p>
                  )}
                </div>
                <Connections data={data} onRefresh={refresh} />
              </div>
            )}
            {page === "Knowledge Base" && (
              <div className="knowledge-layout">
                <aside className="category-sidebar">
                  <div className="section-heading">
                    <h3>Categories</h3>
                    <button
                      className="icon-button"
                      aria-label="Create category"
                      onClick={async () => {
                        const name = prompt("New category name");
                        if (name?.trim()) {
                          try {
                            await api("/categories", "POST", { name });
                            refresh();
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }
                      }}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                  <button
                    className={
                      category === "all" ? "category selected" : "category"
                    }
                    onClick={() => setCategory("all")}
                  >
                    <BookOpen size={16} /> All articles{" "}
                    <small>{data?.articles.length}</small>
                  </button>
                  {data?.categories.map((c) => (
                    <div className="category-row" key={c.id}>
                      <button
                        className={
                          category === c.id ? "category selected" : "category"
                        }
                        onClick={() => setCategory(c.id)}
                      >
                        <FolderOpen size={16} />
                        {c.name}
                      </button>
                      <button
                        className="rename"
                        aria-label={"Rename " + c.name}
                        onClick={async () => {
                          const name = prompt("Rename category", c.name);
                          if (name?.trim()) {
                            try {
                              await api("/categories/" + c.id, "PATCH", {
                                name,
                              });
                              refresh();
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="kb-tip">
                    <Sparkles size={20} />
                    <strong>Start with what you know.</strong>
                    <p>
                      Ask your assistant to turn a conversation into a useful
                      playbook.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setMode("draft");
                        setAgent(true);
                      }}
                    >
                      Create with AI <ArrowUpRight size={14} />
                    </button>
                  </div>
                </aside>
                <div className="knowledge-main">
                  {selected ? (
                    <ArticleEditor
                      key={selected.id}
                      article={selected}
                      categories={data?.categories || []}
                      onBack={() => setActive(null)}
                      onOpenArticle={setActive}
                      articles={data?.articles || []}
                      onSaved={(a) =>
                        setData((d) =>
                          d
                            ? {
                                ...d,
                                articles: d.articles.map((x) =>
                                  x.id === a.id ? a : x,
                                ),
                              }
                            : d,
                        )
                      }
                      onError={setError}
                    />
                  ) : (
                    <>
                      <div className="page-title">
                        <div>
                          <p className="eyebrow">YOUR TEAM'S SHARED KNOW-HOW</p>
                          <h1>Knowledge Base</h1>
                          <p>
                            Good processes, captured. Ready for whoever comes
                            next.
                          </p>
                        </div>
                        <button
                          className="primary"
                          onClick={async () => {
                            try {
                              const a = await api("/articles", "POST", {
                                title: "Untitled playbook",
                                categoryId:
                                  category === "all"
                                    ? data?.categories[0]?.id
                                    : category,
                                content: {
                                  type: "doc",
                                  content: [{ type: "paragraph" }],
                                },
                              });
                              await refresh();
                              setActive(a.id);
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          <Plus size={17} /> New article
                        </button>
                      </div>
                      <label className="search kb-search">
                        <Search size={17} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Find a playbook, process, or answer…"
                        />
                      </label>
                      <div className="article-grid">
                        {data?.articles
                          .filter(
                            (a) =>
                              (category === "all" ||
                                a.categoryId === category) &&
                              a.title
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                          )
                          .map((a) => (
                            <button
                              className="article-card"
                              key={a.id}
                              onClick={() => setActive(a.id)}
                            >
                              <div className="section-heading">
                                <span className="article-icon">
                                  <BookOpen size={21} />
                                </span>
                                <span className={"status " + a.status}>
                                  {a.status === "published"
                                    ? "Published"
                                    : "Draft"}
                                </span>
                              </div>
                              <h2>{a.title}</h2>
                              <p>
                                {data?.categories.find(
                                  (c) => c.id === a.categoryId,
                                )?.name || "Uncategorized"}
                              </p>
                              <div className="article-footer">
                                Updated {date(a.updatedAt)}
                                <ArrowUpRight size={17} />
                              </div>
                            </button>
                          ))}
                      </div>
                      {!data?.articles.length && (
                        <div className="empty">
                          Your first playbook starts here. Create an article or
                          ask the assistant.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {!inline && agent && assistant}
    </div>
  );
}
function Connections({
  data,
  onRefresh,
}: {
  data: Data | null;
  onRefresh: () => void;
}) {
  const [google, setGoogle] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    api("/integrations/google")
      .then(setGoogle)
      .catch(() => {});
  }, []);
  return (
    <div className="connections">
      <h3>Connected tools</h3>
      <p>Sample files are demo data. Provider access requires a connection.</p>
      <div className="connections-list">
        <div>
          <FolderOpen size={18} />
          <strong>Google Drive & Gmail</strong>
          <span>{google?.connected ? "Connected" : "Not connected"}</span>
          {google?.connected ? (
            <>
              <button
                className="text-button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await api("/integrations/google/sync", "POST");
                    setNotice("Drive file index refreshed.");
                    onRefresh();
                  } catch (e: any) {
                    setNotice(e.message);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? "Syncing…" : "Sync files"}
              </button>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api("/integrations/google/disconnect", "POST");
                    setGoogle({ ...google, connected: false });
                    setNotice("Google disconnected.");
                    onRefresh();
                  } catch (e: any) {
                    setNotice(e.message);
                  }
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <a
              className="text-button"
              href={
                "/auth/google/start?returnTo=" +
                encodeURIComponent(location.pathname + location.search + location.hash)
              }
            >
              Connect <ArrowUpRight size={14} />
            </a>
          )}
        </div>
        {["SharePoint", "OneDrive"].map((name) => (
          <div key={name}>
            <FolderOpen size={18} />
            <strong>{name}</strong>
            <span>Not connected · coming later</span>
          </div>
        ))}
      </div>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
function Calendar({
  month,
  setMonth,
  events,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  events: any[];
}) {
  const year = month.getFullYear(),
    mo = month.getMonth(),
    first = new Date(year, mo, 1).getDay(),
    days = new Date(year, mo + 1, 0).getDate();
  return (
    <div className="calendar">
      <div className="calendar-title">
        <button
          aria-label="Previous month"
          onClick={() => setMonth(new Date(year, mo - 1, 1))}
        >
          ‹
        </button>
        <strong>
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </strong>
        <button
          aria-label="Next month"
          onClick={() => setMonth(new Date(year, mo + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <small key={"w" + i}>{d}</small>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={"b" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const matches = events.filter((e) => {
            const d = new Date(e.start);
            return (
              d.getFullYear() === year &&
              d.getMonth() === mo &&
              d.getDate() === i + 1
            );
          });
          return (
            <div
              key={i}
              title={matches.map((e) => e.title).join(", ")}
              className={matches.length ? "has-event" : ""}
            >
              {i + 1}
              {matches.length > 0 && <span />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ArticleEditor({
  article,
  categories,
  onBack,
  onSaved,
  onError,
  onOpenArticle,
  articles,
}: {
  article: Article;
  articles: Article[];
  onOpenArticle: (id: string) => void;
  categories: any[];
  onBack: () => void;
  onSaved: (a: Article) => void;
  onError: (s: string) => void;
}) {
  const [title, setTitle] = useState(article.title),
    [cat, setCat] = useState(article.categoryId),
    [save, setSave] = useState("All changes saved"),
    [status, setStatus] = useState(article.status),
    [revision, setRevision] = useState(0);
  const latest = useRef<any>({
    title,
    categoryId: cat,
    content: article.content,
  });
  const timer = useRef<any>(null);
  const pending = useRef<Promise<any>>(Promise.resolve());
  const persist = () => {
    setSave("Saving…");
    if (!latest.current.dirty) return pending.current;
    const snapshot = structuredClone(latest.current);
    latest.current.dirty = false;
    const task = pending.current
      .catch(() => {})
      .then(() => api("/articles/" + article.id, "PATCH", snapshot))
      .then((a) => {
        setSave(latest.current.dirty ? "Unsaved changes" : "All changes saved");
        setStatus(a.status);
        onSaved(a);
        return a;
      })
      .catch((e: any) => {
        latest.current.dirty = true;
        setSave("Save failed");
        onError(e.message);
        throw e;
      });
    pending.current = task;
    return task;
  };
  const schedule = () => {
    setSave("Unsaved changes");
    setStatus("draft");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persist().catch(() => {});
    }, 700);
  };
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: article.content,
    onUpdate: ({ editor }) => {
      latest.current.content = editor.getJSON();
      latest.current.dirty = true;
      schedule();
    },
    onSelectionUpdate: () => setRevision((r) => r + 1),
  });
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (latest.current.dirty) persist().catch(() => {});
    },
    [],
  );
  return (
    <div className="article-editor">
      <div className="editor-top">
        <button
          className="text-button"
          onClick={async () => {
            clearTimeout(timer.current);
            try {
              await persist();
              if (latest.current.dirty) await persist();
              onBack();
            } catch {}
          }}
        >
          ‹ All articles
        </button>
        <div>
          <span className="save-state">
            <Check size={14} />
            {save}
          </span>
          <span className={"status " + status}>{status}</span>
          <button
            className="primary"
            onClick={async () => {
              clearTimeout(timer.current);
              try {
                await persist();
                if (latest.current.dirty) await persist();
                const a = await api(
                  "/articles/" + article.id + "/publish",
                  "POST",
                );
                setStatus(a.status);
                onSaved(a);
                setSave("Published successfully");
              } catch (e: any) {
                onError(e.message);
              }
            }}
          >
            Publish <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
      <select
        className="category-select"
        value={cat}
        aria-label="Article category"
        onChange={(e) => {
          setCat(e.target.value);
          latest.current.categoryId = e.target.value;
          latest.current.dirty = true;
          schedule();
        }}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        className="article-title"
        aria-label="Article title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          latest.current.title = e.target.value;
          latest.current.dirty = true;
          schedule();
        }}
      />
      <p className="editor-hint">
        Capture the process. Make it easy for the next person.
      </p>
      <div className="editor-toolbar">
        {[
          [Bold, "Bold", () => editor?.chain().focus().toggleBold().run()],
          [
            Italic,
            "Italic",
            () => editor?.chain().focus().toggleItalic().run(),
          ],
          [
            Heading2,
            "Heading",
            () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          ],
          [
            List,
            "Bullet list",
            () => editor?.chain().focus().toggleBulletList().run(),
          ],
          [
            ListChecks,
            "Checklist",
            () => editor?.chain().focus().toggleTaskList().run(),
          ],
          [
            Link,
            "Insert link",
            () => {
              const href = prompt("Link URL (https://…)");
              if (href && /^https?:\/\//i.test(href))
                editor?.chain().focus().setLink({ href }).run();
            },
          ],
          [
            ImagePlus,
            "Insert image URL",
            () => {
              const src = prompt("Public image URL (https://…)");
              if (src && /^https?:\/\//i.test(src))
                editor?.chain().focus().setImage({ src }).run();
            },
          ],
        ].map(([Icon, label, fn]: any) => (
          <button
            className="icon-button"
            key={label}
            aria-label={label}
            title={label}
            onClick={fn}
          >
            <Icon size={18} />
          </button>
        ))}
        <label className="image-upload" title="Upload image">
          <ImagePlus size={18} />
          <input
            aria-label="Upload article image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                onError("Images must be under 5 MB.");
                return;
              }
              try {
                const form = new FormData();
                form.append("file", file);
                const r = await fetch("/api/uploads", {
                  method: "POST",
                  body: form,
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || "Image upload failed");
                editor?.chain().focus().setImage({ src: d.url }).run();
              } catch (err: any) {
                onError(err.message);
              }
            }}
          />
        </label>
        <span>Rich text · images · checklists</span>
      </div>
      <EditorContent editor={editor} />
      {article.sources && article.sources.length > 0 && (
        <div className="article-sources">
          <h3>Source evidence</h3>
          <p>
            Review these sources before publishing. Source access remains with
            the original provider.
          </p>
          {article.sources.map((source: any, i: number) => (
            <div key={source.id || i}>
              {articles.some((a) => a.id === source.id) ? (
                <button
                  className="text-button"
                  onClick={async () => {
                    clearTimeout(timer.current);
                    try {
                      await persist();
                      if (latest.current.dirty) await persist();
                      onOpenArticle(source.id);
                    } catch {}
                  }}
                >
                  <BookOpen size={14} />
                  {source.title || source.id}
                  <ChevronRight size={13} />
                </button>
              ) : source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  <FileText size={14} />
                  {source.title || source.id}
                  <ArrowUpRight size={13} />
                </a>
              ) : (
                <span>
                  <FileText size={14} />
                  {source.title || source.id}
                </span>
              )}
              {source.synthetic && <small>Demo source</small>}
            </div>
          ))}
        </div>
      )}
      <div className="editor-bottom">
        <Check size={14} /> Autosaved as a draft. Any staff member can review
        and publish.
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<AuthGate />);
