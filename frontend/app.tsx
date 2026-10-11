import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
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
  MicOff,
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
  Users,
  Building2,
  ClipboardCheck,
  Mail,
  AlertCircle,
  Waypoints,
  Plug,
} from "lucide-react";
import "./style.css";
import {
  api,
  fullDate,
  isOverdue,
  type Article,
  type Candidate,
  type IndexedSource,
  type OrgInfo,
  type Person,
  type Run,
} from "./api";
import { IndexSources } from "./indexing";
import { SuggestedPlaybooks } from "./discover";
import { ArticleMeta } from "./article-meta";
import { ChecklistsPage } from "./checklists";
import { PeoplePage } from "./people";
import { OrganizationPage } from "./organization";
import { KnowledgeMap } from "./map";
import { buildDocs, docsForPerson, useMapState } from "./map-store";
import { Aurora, Orb, VoiceWave, useTypewriter } from "./ambient";
import {
  AnimatePresence,
  Collapse,
  MotionRoot,
  SegmentPill,
  m,
  prefersReducedMotion,
  rowExit,
  usePresence,
} from "./motion";
type Data = {
  categories: { id: string; name: string }[];
  articles: Article[];
  files: any[];
  events: any[];
  integrations: any[];
  meta?: any;
  people?: Person[];
  runs?: Run[];
  candidates?: Candidate[];
  sources?: IndexedSource[];
};
type Message = { role: "user" | "assistant"; content: string; sources?: any[] };
type User = {
  id: string;
  email: string;
  name: string;
  orgId?: string;
  role?: "admin" | "member";
};
const NONE: never[] = [];
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
    [workspace, setWorkspace] = useState<"demo" | "create" | "invite">("demo"),
    [organization, setOrganization] = useState(""),
    [inviteCode, setInviteCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/" + mode, "POST", {
        name,
        email,
        password,
        ...(mode === "signup" && workspace === "create"
          ? { organization: organization.trim() }
          : {}),
        ...(mode === "signup" && workspace === "invite"
          ? { inviteCode: inviteCode.trim() }
          : {}),
      });
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
          <span className="brand-mark" aria-hidden="true" />
          orgflow<span className="brand-dot">.</span>
        </div>
        <h1 key={mode}>{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <Collapse open={mode === "signup"}>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        </Collapse>
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
        <Collapse open={mode === "signup"}>
          <div className="workspace-choice">
            <span>Workspace</span>
            <div className="segmented">
              {(
                [
                  ["demo", "Join demo workspace"],
                  ["create", "Create organization"],
                  ["invite", "Join with invite code"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={workspace === value ? "on" : ""}
                  onClick={() => setWorkspace(value)}
                >
                  {workspace === value && <SegmentPill id="auth-workspace" />}
                  {label}
                </button>
              ))}
            </div>
            <div className="workspace-detail" key={workspace}>
              {workspace === "demo" && (
                <small>
                  Explore OrgFlow in the shared demo workspace with sample data.
                </small>
              )}
              {workspace === "create" && (
                <input
                  required
                  aria-label="Organization name"
                  placeholder="Organization name"
                  maxLength={120}
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              )}
              {workspace === "invite" && (
                <input
                  required
                  aria-label="Invite code"
                  placeholder="Invite code"
                  autoCapitalize="off"
                  autoComplete="off"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              )}
            </div>
          </div>
        </Collapse>
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
  Checklists: "/checklists",
  Map: "/map",
  People: "/people",
  Organization: "/organization",
};
const currentPage = () => {
  const path = location.pathname.replace(/^\/a(?=\/|$)/, "");
  return (
    Object.keys(pagePaths).find(
      (page) => page !== "Home" && path.startsWith(pagePaths[page]!),
    ) ?? "Home"
  );
};
/**
 * Open a hosted AWS Monetization page. Uses the URL cookie set at sign-in when present, and
 * otherwise asks the server for a fresh one (already-signed-in sessions, expired cookie).
 */
async function openHosted(
  cookieName: string,
  surface: "pricing" | "portal",
  onError: (message: string) => void,
) {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(cookieName + "="));
  if (match) {
    window.location.assign(
      decodeURIComponent(match.slice(cookieName.length + 1)),
    );
    return;
  }
  try {
    const { url } = await api(`/billing/session?surface=${surface}`);
    window.location.assign(url);
  } catch (e: any) {
    onError(e.message);
  }
}

function App({ user, onLogout }: { user: User; onLogout: () => void }) {
  const realtimeVoice = useConversation({
    onError: (message) => setVoiceNote("Voice session error: " + message),
    onDisconnect: () => setVoiceNote("Voice session ended."),
    onMessage: ({ message, role }) => {
      const speaker = role === "user" ? "user" : "assistant";
      setVoiceTranscript((transcript) =>
        (transcript ? transcript + "\n\n" : "") +
        `${speaker === "user" ? "Staff" : "OrgFlow"}: ${message}`,
      );
      setMessages((current) => [...current, { role: speaker, content: message }]);
    },
  });
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
    [voiceTranscript, setVoiceTranscript] = useState(""),
    [voiceDraftConsent, setVoiceDraftConsent] = useState(false),
    [voiceNote, setVoiceNote] = useState(""),
    [provider, setProvider] = useState("All providers"),
    [folder, setFolder] = useState(""),
    [capture, setCapture] = useState(false),
    [sources, setSources] = useState<any[]>([]),
    [sourceOptions, setSourceOptions] = useState<any[]>([]),
    [consent, setConsent] = useState(false),
    [captureProvider, setCaptureProvider] = useState("drive"),
    [captureError, setCaptureError] = useState(""),
    [org, setOrg] = useState<OrgInfo | null>(null),
    [orgError, setOrgError] = useState(""),
    [activeRun, setActiveRun] = useState<string | null>(null),
    [personFocus, setPersonFocus] = useState<string | null>(null),
    [composerFocus, setComposerFocus] = useState(false);
  const orgId = org?.id || user.orgId || "default";
  const [mapState] = useMapState(orgId);
  const mapDocs = React.useMemo(
    () =>
      data
        ? buildDocs({
            articles: data.articles,
            files: data.files,
            sources: data.sources,
            categories: data.categories,
          })
        : [],
    [data],
  );
  const mapped = (personId: string) => ({
    groups: mapState.groups.filter((g) => g.ownerId === personId),
    docs: docsForPerson(mapState, mapDocs, personId),
  });
  // Keyboard-initiated opens/closes (⌘J, Escape) skip the dialog animation.
  const [instant, setInstant] = useState(false);
  const agentPresence = usePresence(agent, instant ? 0 : 170);
  const agentRef = useRef<HTMLElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const dockedOnce = useRef(false);
  useLayoutEffect(() => {
    // Re-materialize from the new anchor when the window docks or centers.
    if (!dockedOnce.current) {
      dockedOnce.current = true;
      return;
    }
    const el = agentRef.current;
    if (!el || el.classList.contains("inline")) return;
    if (matchMedia("(max-width: 720px)").matches) return;
    el.animate(
      prefersReducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "scale(1)" },
          ],
      { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [docked]);
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
  const loadOrg = async () => {
    try {
      setOrg(await api("/org"));
      setOrgError("");
    } catch (e: any) {
      setOrgError(e.message);
    }
  };
  useEffect(() => {
    refresh();
    loadOrg();
  }, []);
  const openArticle = (id: string) => {
    setActive(id);
    setPage("Knowledge Base");
  };
  const openRun = (id: string) => {
    setActiveRun(id);
    setPage("Checklists");
  };
  const goIndex = () => {
    setPage("Files");
    setTimeout(
      () =>
        document
          .getElementById("index-sources")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80,
    );
  };
  useEffect(() => {
    if (!agent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInstant(true);
        setAgent(false);
        void realtimeVoice.endSession();
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
  }, [agent, docked, realtimeVoice]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (pageRef.current === "Home") focusChat();
        else {
          setInstant(true);
          setAgent((a) => !a);
        }
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    // Keep the newest message in view as the conversation grows.
    const el = messagesRef.current;
    if (!el || (!messages.length && !busy)) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [messages.length, busy]);
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
        messages: next
          .slice(-24)
          .map(({ role, content }) => ({ role, content })),
        mode: requestedMode,
        articleId: active || undefined,
        ...(sources.length ? { sources, sourcesConsent: consent } : {}),
      });
      setMessages([
        ...next,
        { role: "assistant", content: r.message, sources: r.sources },
      ]);
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
  async function voice() {
    if (realtimeVoice.status !== "disconnected") {
      await realtimeVoice.endSession();
      setVoiceNote("Voice session ended.");
      return;
    }
    setVoiceNote("Connecting securely to OrgFlow Voice…");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser does not support microphone access.");
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
      const { conversationToken } = await api("/voice/session-token");
      setVoiceTranscript("");
      setVoiceDraftConsent(false);
      await realtimeVoice.startSession({
        conversationToken,
        connectionType: "webrtc",
        userId: user.id,
      });
      setVoiceNote("Connected. You can speak naturally.");
    } catch (e: any) {
      setVoiceNote(e.message || "Unable to start the voice session.");
    }
  }
  function draftFromVoice() {
    if (!voiceDraftConsent) {
      setVoiceNote("Approve sharing this transcript with the drafting AI first.");
      return;
    }
    const transcript = voiceTranscript.slice(-5000);
    if (!transcript.trim()) {
      setVoiceNote("There is no voice transcript to draft from yet.");
      return;
    }
    setMode("draft");
    setVoiceNote("Sending the reviewed transcript to the drafting AI…");
    send(
      "Create a concise SOP draft from this reviewed voice interview transcript. Preserve clear facts, label uncertain details for review, and add open questions where information is missing.\n\n" +
        transcript,
      "draft",
    );
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
    else {
      setInstant(false);
      setAgent(true);
    }
    if (text) send(text);
  };
  const closeAgent = () => {
    setInstant(false);
    setAgent(false);
    void realtimeVoice.endSession();
  };
  const inline = page === "Home";
  const typed = useTypewriter(
    mode === "draft"
      ? [
          "Walk me through how we thank a major donor…",
          "Turn our volunteer onboarding into a checklist…",
          "Capture the grant reporting process from Maya…",
        ]
      : [
          "Who handles the quarterly grant report?",
          "Where is the donor stewardship overview?",
          "What happens in a new hire's first week?",
          "How do we schedule volunteers each month?",
        ],
    !!input || composerFocus || !!messages.length || tab !== "chat",
  );
  const agentState = agentPresence.closing ? "closed" : "open";
  const assistant = (
    <>
      {!inline && (
        <div
          className={docked ? "" : "modal-backdrop"}
          data-state={agentState}
          data-instant={instant || undefined}
          onClick={() => !docked && closeAgent()}
        />
      )}
      <section
        ref={agentRef}
        className={
          (inline
            ? "agent-window inline"
            : docked
              ? "agent-window docked"
              : "agent-window") + (busy ? " is-working" : "")
        }
        data-state={inline ? undefined : agentState}
        data-instant={(!inline && instant) || undefined}
        role={inline ? "region" : "dialog"}
        aria-modal={inline ? undefined : !docked}
        aria-label="OrgFlow assistant"
      >
        <div className="agent-header">
          <span className="agent-symbol" aria-hidden="true" />
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
                onClick={closeAgent}
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
              {tab === "chat" && <SegmentPill id="agent-tab" />}
              <MessageSquare size={15} />
              Chat
            </button>
            <button
              className={tab === "voice" ? "on" : ""}
              onClick={() => setTab("voice")}
            >
              {tab === "voice" && <SegmentPill id="agent-tab" />}
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
          <button
            className="text-button"
            aria-expanded={capture}
            onClick={() => setCapture(!capture)}
          >
            <Plus size={14} /> Capture from sources{" "}
            {sources.length > 0 && `(${sources.length})`}
          </button>
        </div>
        <Collapse open={capture}>
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
            <AnimatePresence initial={false}>
              {sources.map((s, i) => (
                <m.div className="selected-source" key={s.id} {...rowExit}>
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
                </m.div>
              ))}
            </AnimatePresence>
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
        </Collapse>
        <div className="messages" ref={messagesRef}>
          {!messages.length && (
            <div className="agent-welcome">
              <Orb busy={busy} size={inline ? 104 : 84} />
              <h2>
                How can I help <em>your team</em>?
              </h2>
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
                  <span className="assistant-mark" aria-hidden="true" />
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
                      const isEmail = source.sourceType === "email excerpt",
                        excerpt =
                          isEmail || source.sourceType === "document excerpt",
                        ExcerptIcon = isEmail ? Mail : FileText;
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
                          ) : excerpt ? (
                            <>
                              {source.url ? (
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExcerptIcon size={12} />
                                  {source.title || source.id}
                                  <ArrowUpRight size={12} />
                                </a>
                              ) : (
                                <span>
                                  <ExcerptIcon size={12} />
                                  {source.title || source.id}
                                </span>
                              )}
                              <small>
                                {isEmail ? "Email" : "Document"}
                                {source.from && " · " + source.from}
                              </small>
                            </>
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
            <div className="message assistant pending">
              <span>
                <span className="assistant-mark" aria-hidden="true" />
              </span>
              <div className="shimmer-text">Working on that…</div>
            </div>
          )}
        </div>
        <Collapse open={tab === "voice"}>
          <div className="voice-controls">
            <VoiceWave
              status={realtimeVoice.status}
              speaking={realtimeVoice.isSpeaking}
              muted={realtimeVoice.isMuted}
              levels={{
                input: realtimeVoice.getInputByteFrequencyData,
                output: realtimeVoice.getOutputByteFrequencyData,
              }}
            />
            <div className="voice-actions">
              <button
                className={
                  realtimeVoice.status === "connected"
                    ? realtimeVoice.isSpeaking
                      ? "mic-button listening speaking"
                      : realtimeVoice.isMuted
                        ? "mic-button listening muted"
                        : "mic-button listening"
                    : realtimeVoice.status === "connecting"
                      ? "mic-button connecting"
                      : "mic-button"
                }
                onClick={voice}
                aria-label={
                  realtimeVoice.status === "connected"
                    ? "End voice session"
                    : "Start live voice session"
                }
                disabled={busy || realtimeVoice.status === "connecting"}
              >
                <Mic size={25} />
              </button>
              <AnimatePresence initial={false}>
              {realtimeVoice.status === "connected" && (
                <m.button
                  key="mute"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  className={
                    realtimeVoice.isMuted ? "voice-mute muted" : "voice-mute"
                  }
                  onClick={() => realtimeVoice.setMuted(!realtimeVoice.isMuted)}
                  aria-pressed={realtimeVoice.isMuted}
                  aria-label={
                    realtimeVoice.isMuted ? "Unmute microphone" : "Mute microphone"
                  }
                >
                  {realtimeVoice.isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                  {realtimeVoice.isMuted ? "Unmute mic" : "Mute mic"}
                </m.button>
              )}
            </AnimatePresence>
            </div>
            <strong className="voice-status" key={realtimeVoice.status}>
              {realtimeVoice.status === "connecting"
                ? "Connecting…"
                : realtimeVoice.status === "connected"
                  ? realtimeVoice.isSpeaking
                    ? "OrgFlow is speaking… tap to end"
                    : realtimeVoice.isMuted
                      ? "Microphone muted"
                      : "Listening… tap to end"
                  : "Start live voice"}
            </strong>
            <p>
              {voiceNote ||
                "Live audio is handled by ElevenLabs after you start a secure voice session."}
            </p>
            {voiceTranscript && (
              <div className="voice-transcript">
                <label htmlFor="voice-transcript">Review interview transcript</label>
                <textarea
                  id="voice-transcript"
                  aria-label="Review interview transcript"
                  value={voiceTranscript.slice(-5000)}
                  maxLength={5000}
                  onChange={(e) => setVoiceTranscript(e.target.value)}
                  disabled={realtimeVoice.status !== "disconnected"}
                />
                <label className="consent voice-consent">
                  <input
                    type="checkbox"
                    checked={voiceDraftConsent}
                    onChange={(e) => setVoiceDraftConsent(e.target.checked)}
                    disabled={realtimeVoice.status !== "disconnected"}
                  />
                  Share this transcript with the drafting AI to create an
                  OrgFlow draft.
                </label>
                <button
                  className="text-button"
                  onClick={draftFromVoice}
                  disabled={
                    busy ||
                    realtimeVoice.status !== "disconnected" ||
                    !voiceDraftConsent
                  }
                >
                  <Sparkles size={14} /> Create reviewable SOP draft
                </button>
              </div>
            )}
          </div>
        </Collapse>
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
              !messages.length && !composerFocus && typed
                ? typed + "▏"
                : mode === "draft"
                  ? "Describe the process you want to capture…"
                  : "Ask your assistant…"
            }
            onFocus={() => setComposerFocus(true)}
            onBlur={() => setComposerFocus(false)}
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
      <Aurora />
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("Home")}>
          <span className="brand-mark" aria-hidden="true" />
          orgflow<span className="brand-dot">.</span>
        </button>
        <button className="agent-launch" onClick={() => openAgent()}>
          <span className="agent-launch-glow" aria-hidden="true" />
          <Sparkles size={18} /> <span className="nav-text">Your AI assistant</span>{" "}
          <kbd>⌘ J</kbd>
        </button>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {[
            [Home, "Home"],
            [FolderOpen, "Files"],
            [BookOpen, "Knowledge Base"],
            [ClipboardCheck, "Checklists"],
            [Waypoints, "Map"],
            [Users, "People"],
            [Building2, "Organization"],
          ].map(([Icon, label]: any) => (
            <button
              className={page === label ? "nav-item selected" : "nav-item"}
              key={label}
              onClick={() => {
                setPage(label);
                setQuery("");
                setPersonFocus(null);
                if (label === "Checklists") setActiveRun(null);
              }}
            >
              {page === label && (
                <m.span
                  layoutId="nav-pill"
                  className="nav-pill"
                  aria-hidden="true"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                />
              )}
              <Icon size={19} />
              <span className="nav-text">{label}</span>
              {label === "Knowledge Base" && (
                <small>{data?.articles.length || 0}</small>
              )}
              {label === "Checklists" &&
                (data?.runs || NONE).some((r) => r.status === "active") && (
                  <small>
                    {(data?.runs || NONE).filter((r) => r.status === "active").length}
                  </small>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span className="workspace-avatar">
              {(org?.name || "O")[0]?.toUpperCase()}
            </span>
            <div>
              <strong>{org?.name || "Our organization"}</strong>
              <small>
                {org?.id === "default"
                  ? "Shared demo workspace"
                  : org?.role === "admin"
                    ? "Admin"
                    : "Shared workspace"}
              </small>
            </div>
          </div>
          <div className="demo-indicator">
            <span />{" "}
            {data?.meta?.demo === false
              ? "Organization workspace"
              : "Demo workspace"}{" "}
            <span className="info">i</span>
          </div>
          <div className="account-row billing-row">
            <button onClick={() => openHosted("mai_pricing_url", "pricing", setError)}>
              Plans &amp; upgrade
            </button>
            <button
              onClick={() =>
                openHosted("mai_billing_portal_url", "portal", setError)
              }
            >
              Manage subscription
            </button>
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
            {org?.name || "Workspace"} <ChevronRight size={14} />{" "}
            <strong>{page}</strong>
          </span>
          <div className="top-right">
            {data && (
              <span className="live-pill" title="Playbooks in this workspace">
                <span className="glow-dot" />
                {data.articles.filter((a) => a.status === "published").length} live
                <span className="live-sep" />
                {data.articles.filter((a) => a.status !== "published").length} in
                draft
              </span>
            )}
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
          <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={page}
            className="page-frame"
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.14, ease: "easeIn" } }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
            onAnimationComplete={(def: any) => {
              // A lingering filter would make fixed/sticky descendants misbehave.
              const el = document.querySelector<HTMLElement>(".page-frame");
              if (el && def?.opacity === 1) el.style.filter = "none";
            }}
          >
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
                <Connections
                  data={data}
                  onRefresh={refresh}
                  onSourcesChanged={refresh}
                />
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
                        setInstant(false);
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
                      people={data?.people || NONE}
                      onOpenRun={openRun}
                      onRunStarted={refresh}
                    />
                  ) : (
                    <div className="kb-list">
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
                      <SuggestedPlaybooks
                        candidates={data?.candidates || NONE}
                        indexedCount={data?.sources?.length || 0}
                        articles={data?.articles || NONE}
                        onRefresh={refresh}
                        onOpenArticle={openArticle}
                        onGoIndex={goIndex}
                      />
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
                                <span className="status-stack">
                                  {a.status === "published" &&
                                    isOverdue(a.reviewDueAt) && (
                                      <span
                                        className="badge warn"
                                        title={
                                          "Review was due " +
                                          fullDate(a.reviewDueAt!)
                                        }
                                      >
                                        <AlertCircle size={11} /> Due for review
                                      </span>
                                    )}
                                  <span className={"status " + a.status}>
                                    {a.status === "published"
                                      ? "Published"
                                      : "Draft"}
                                  </span>
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
                    </div>
                  )}
                </div>
              </div>
            )}
            {page === "Checklists" && (
              <ChecklistsPage
                runs={data?.runs || NONE}
                people={data?.people || NONE}
                articles={data?.articles || NONE}
                activeRun={activeRun}
                onSelect={setActiveRun}
                onRefresh={refresh}
                onOpenArticle={openArticle}
              />
            )}
            {page === "Map" && data && (
              <KnowledgeMap
                orgId={orgId}
                orgName={org?.name || "Your organization"}
                articles={data.articles}
                files={data.files}
                sources={data.sources || NONE}
                categories={data.categories}
                people={data.people || NONE}
                onOpenArticle={openArticle}
                onOpenPerson={(id) => {
                  setPersonFocus(id);
                  setPage("People");
                }}
              />
            )}
            {page === "People" && (
              <PeoplePage
                key={personFocus || "people"}
                initialPersonId={personFocus}
                mapped={mapped}
                onOpenMap={() => {
                  setPersonFocus(null);
                  setPage("Map");
                }}
                people={data?.people || NONE}
                articles={data?.articles || NONE}
                onRefresh={refresh}
                onOpenArticle={openArticle}
                onOpenRun={openRun}
              />
            )}
            {page === "Organization" && (
              <OrganizationPage
                org={org}
                orgError={orgError}
                onOrgChange={setOrg}
                onReloadOrg={loadOrg}
                userId={user.id}
                lookups={{
                  articles: data?.articles || NONE,
                  people: data?.people || NONE,
                  runs: data?.runs || NONE,
                  sources: data?.sources || NONE,
                }}
              />
            )}
          </m.div>
          </AnimatePresence>
        )}
      </main>
      {!inline && agent && assistant}
    </div>
  );
}
function Connections({
  data,
  onRefresh,
  onSourcesChanged,
}: {
  data: Data | null;
  onRefresh: () => void;
  onSourcesChanged: () => void;
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
        <div className={google?.connected ? "is-connected" : "is-ready"}>
          <FolderOpen size={18} />
          <strong>Google Drive & Gmail</strong>
          <span>
            {google?.connected ? "Connected · read-only" : "Ready to connect · read-only"}
          </span>
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
        <div className="connection-soon">
          <Plug size={18} />
          <strong>Microsoft 365</strong>
          <em className="soon-badge">Coming soon</em>
          <p>
            SharePoint, OneDrive and Outlook, indexed beside Google with the same
            consent controls.
          </p>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      <IndexSources
        connected={!!google?.connected}
        onChanged={onSourcesChanged}
      />
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
  people,
  onOpenRun,
  onRunStarted,
}: {
  article: Article;
  articles: Article[];
  people: Person[];
  onOpenRun: (id: string) => void;
  onRunStarted: () => Promise<void> | void;
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
          <span
            className={
              "save-state" +
              (save === "Published successfully"
                ? " success"
                : save === "Save failed"
                  ? " failed"
                  : save === "All changes saved"
                    ? " saved"
                    : " pending")
            }
            key={save}
          >
            <Check size={14} />
            {save}
          </span>
          <span className={"status " + status} key={status}>
            {status}
          </span>
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
      <ArticleMeta
        article={article}
        people={people}
        onSaved={onSaved}
        onError={onError}
        onOpenRun={onOpenRun}
        onRunStarted={onRunStarted}
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
createRoot(document.getElementById("root")!).render(
  <ConversationProvider>
    <MotionRoot>
      <AuthGate />
    </MotionRoot>
  </ConversationProvider>,
);
