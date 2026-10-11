import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  Home,
  Layers,
  MessageSquare,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./demo.css";

import GuidedDemo from "./GuidedDemo";
import { sources, questions, initialSteps, type SampleSource } from "./sample-data";

type Mode = "answer" | "capture" | "handoff";

const modes: {
  id: Mode;
  title: string;
  number: string;
  icon: typeof MessageSquare;
}[] = [
  { id: "answer", title: "Find an answer", number: "01", icon: MessageSquare },
  { id: "capture", title: "Capture a process", number: "02", icon: Layers },
  {
    id: "handoff",
    title: "Get someone up to speed",
    number: "03",
    icon: BookOpen,
  },
];

function FullDemo({ active }: { active: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("answer");
  const [question, setQuestion] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedSources, setSelectedSources] = useState([
    "welcome",
    "handoff",
  ]);
  const [consent, setConsent] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedSnapshot, setPublishedSnapshot] = useState<{
    title: string;
    steps: string[];
  } | null>(null);
  const [title, setTitle] = useState("Welcoming a new volunteer");
  const [steps, setSteps] = useState([...initialSteps]);
  const [checked, setChecked] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [source, setSource] = useState<SampleSource | null>(null);
  const [status, setStatus] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastSourceTrigger = useRef<HTMLElement | null>(null);
  const selectedQuestion = questions[question]!;
  const completed = checked.filter(Boolean).length;

  useEffect(() => {
    const onDemoMode = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (next === "answer" || next === "capture" || next === "handoff") {
        setMode(next);
        setSource(null);
        setStatus("");
      }
    };
    window.addEventListener("orgflow:demo-mode", onDemoMode);
    return () => window.removeEventListener("orgflow:demo-mode", onDemoMode);
  }, []);

  useEffect(() => {
    if (!active) setSource(null);
  }, [active]);

  useEffect(() => {
    if (!source) return;
    const dialog = dialogRef.current;
    const outsideBranches: { element: HTMLElement; wasInert: boolean }[] = [];
    let activeBranch: HTMLElement | null = dialog;
    while (activeBranch && activeBranch !== document.body) {
      const parent = activeBranch.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== activeBranch && sibling instanceof HTMLElement) {
          outsideBranches.push({ element: sibling, wasInert: sibling.inert });
          sibling.inert = true;
        }
      }
      activeBranch = parent;
    }
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSource(null);
      }
      if (event.key === "Tab" && dialog) {
        const items = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button, a[href], input, textarea, [tabindex='0']",
          ),
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      for (const { element, wasInert } of outsideBranches.reverse())
        element.inert = wasInert;
      lastSourceTrigger.current?.focus();
    };
  }, [source]);

  function openSource(sourceId: string, trigger: HTMLElement) {
    lastSourceTrigger.current = trigger;
    setSource(sources.find((item) => item.id === sourceId) ?? null);
  }

  function selectMode(next: Mode) {
    setMode(next);
    setSource(null);
    setStatus("");
  }

  function reset() {
    setMode("answer");
    setQuestion(0);
    setAnswered(false);
    setSelectedSources(["welcome", "handoff"]);
    setConsent(false);
    setDrafted(false);
    setEditing(false);
    setPublished(false);
    setPublishedSnapshot(null);
    setTitle("Welcoming a new volunteer");
    setSteps([...initialSteps]);
    setChecked([false, false, false, false]);
    setSource(null);
    setStatus("Sample workspace reset. Choose a question to start again.");
  }

  function ask() {
    setAnswered(true);
    setStatus(
      "Sample answer ready. You can open each source to read the notes behind it.",
    );
  }

  function createDraft() {
    if (!consent || selectedSources.length === 0) return;
    const nextSteps = [...initialSteps];
    if (!selectedSources.includes("handoff"))
      nextSteps[0] =
        "Send the welcome email with the interest form and orientation sheet.";
    if (!selectedSources.includes("welcome"))
      nextSteps[2] =
        "Introduce their shift partner before the food safety briefing.";
    setSteps(nextSteps);
    setDrafted(true);
    setPublished(false);
    setStatus(
      "Sample draft created. Review the steps and sources before publishing.",
    );
  }

  function publish() {
    if (!title.trim() || steps.some((step) => !step.trim()) || editing) return;
    setPublished(true);
    setPublishedSnapshot({ title: title.trim(), steps: [...steps] });
    setStatus(
      "Sample playbook published. Your reviewed steps are now available in the next example.",
    );
  }

  const sourceButton = (sourceId: string, compact = false) => {
    const item = sources.find((entry) => entry.id === sourceId)!;
    return (
      <button
        key={sourceId}
        className={compact ? "of-demo-citation" : "of-demo-source-card"}
        onClick={(event) => openSource(sourceId, event.currentTarget)}
      >
        <span className="of-demo-file-icon">
          <FileText size={compact ? 13 : 17} aria-hidden="true" />
        </span>
        <span>
          {item.title}
          {!compact && <small>{item.kind}</small>}
        </span>
        <ChevronRight size={compact ? 13 : 16} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="of-demo-full">
      <div
        className="of-demo-tabs"
        role="tablist"
        aria-label="Explore the sample workspace"
      >
        {modes.map((item, index) => (
          <button
            key={item.id}
            id={`${id}-tab-${item.id}`}
            role="tab"
            aria-selected={mode === item.id}
            aria-controls={`${id}-panel`}
            tabIndex={mode === item.id ? 0 : -1}
            className={
              mode === item.id ? "of-demo-tab is-active" : "of-demo-tab"
            }
            onClick={() => selectMode(item.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % modes.length;
              else if (event.key === "ArrowLeft")
                next = (index + modes.length - 1) % modes.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = modes.length - 1;
              else return;
              event.preventDefault();
              const nextMode = modes[next]!.id;
              selectMode(nextMode);
              document.getElementById(`${id}-tab-${nextMode}`)?.focus();
            }}
          >
            <span className="of-demo-tab-number">{item.number}</span>
            <item.icon size={18} aria-hidden="true" />
            <span>{item.title}</span>
            <ArrowRight
              size={16}
              className="of-demo-tab-arrow"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <div className="of-demo-shell">
        <div className="of-demo-window-bar">
          <span className="of-demo-window-label">
            <span className="of-demo-live-dot" /> INTERACTIVE EXAMPLE
          </span>
          <span className="of-demo-window-note">
            Sample content. No live AI requests.
          </span>
          <button
            className="of-demo-reset"
            onClick={reset}
            aria-label="Reset demo and clear the sample workspace"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset demo</span>
          </button>
        </div>
        <div className="of-demo-app">
          <aside
            className="of-demo-sidebar"
            aria-label="Sample application navigation"
          >
            <span className="of-demo-logo">
              <img src="/brand-knot.webp" width="26" height="26" alt="" />OneFlow
            </span>
            <button
              className="of-demo-agent-launch"
              onClick={() => selectMode("answer")}
            >
              <Sparkles size={15} aria-hidden="true" />
              Ask your assistant
            </button>
            <span className="of-demo-nav-label">WORKSPACE</span>
            {(
              [
                ["answer", Home, "Home"],
                ["capture", FolderOpen, "Files"],
                ["handoff", BookOpen, "Knowledge Base"],
              ] as const
            ).map(([item, Icon, label]) => (
              <button
                key={item}
                className={
                  mode === item
                    ? "of-demo-nav-item is-active"
                    : "of-demo-nav-item"
                }
                onClick={() => selectMode(item)}
                aria-current={mode === item ? "page" : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
                {item === "handoff" && <small>3</small>}
              </button>
            ))}
            <div className="of-demo-workspace">
              <span className="of-demo-workspace-avatar">W</span>
              <div>
                <strong>Willow Creek</strong>
                <small>Food Pantry</small>
              </div>
            </div>
            <span className="of-demo-sample-label">
              <span /> Fictional workspace
            </span>
          </aside>

          <div className="of-demo-main">
            <div className="of-demo-topbar">
              <span>
                Workspace <ChevronRight size={13} aria-hidden="true" />{" "}
                <strong>
                  {mode === "answer"
                    ? "Home"
                    : mode === "capture"
                      ? "Capture"
                      : "Knowledge Base"}
                </strong>
              </span>
              <span
                className="of-demo-avatar"
                role="img"
                aria-label="Sample staff member Sam"
              >
                S
              </span>
            </div>
            <div
              className="of-demo-panel"
              id={`${id}-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-tab-${mode}`}
              tabIndex={0}
              key={mode}
            >
              {mode === "answer" && (
                <div className="of-demo-answer-layout">
                  <div className="of-demo-answer-main">
                    <p className="of-demo-eyebrow">
                      <Sparkles size={13} aria-hidden="true" /> YOUR TEAM’S
                      SHARED KNOW-HOW
                    </p>
                    <h3>
                      A simple question.
                      <br />A useful place to start.
                    </h3>
                    <p className="of-demo-panel-description">
                      The answer is already in your team’s knowledge. Bring it
                      into the conversation.
                    </p>
                    <form
                      className="of-demo-question-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        ask();
                      }}
                    >
                      <label htmlFor={`${id}-question`}>
                        Try a question from the pantry
                      </label>
                      <div className="of-demo-question-row">
                        <select
                          id={`${id}-question`}
                          value={question}
                          onChange={(event) => {
                            setQuestion(Number(event.target.value));
                            setAnswered(false);
                          }}
                          aria-label="Choose a sample question"
                        >
                          {questions.map((item, index) => (
                            <option key={item.question} value={index}>
                              {item.question}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          aria-label="Ask the selected sample question"
                        >
                          <ArrowUp size={19} aria-hidden="true" />
                        </button>
                      </div>
                      <span>
                        <Sparkles size={12} aria-hidden="true" /> Grounded in
                        sample organizational knowledge
                      </span>
                    </form>
                    {answered ? (
                      <div
                        className="of-demo-response of-demo-enter"
                        aria-label="Sample assistant answer"
                      >
                        <div className="of-demo-response-heading">
                          <span>
                            <Sparkles size={15} aria-hidden="true" /> OneFlow
                            assistant
                          </span>
                          <small>Sample answer</small>
                        </div>
                        <p>{selectedQuestion.intro}</p>
                        <ol className="of-demo-answer-steps">
                          {selectedQuestion.steps.map(
                            ([heading, description], index) => (
                              <li key={heading}>
                                <span>{index + 1}</span>
                                <div>
                                  <strong>{heading}</strong>
                                  <p>{description}</p>
                                </div>
                              </li>
                            ),
                          )}
                        </ol>
                        <div className="of-demo-citations">
                          <span>FROM YOUR SOURCES</span>
                          {selectedQuestion.sourceIds.map((item) =>
                            sourceButton(item, true),
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="of-demo-ready">
                        <span className="of-demo-ready-icon">
                          <MessageSquare size={23} aria-hidden="true" />
                        </span>
                        <div>
                          <strong>No need to know where to look.</strong>
                          <p>
                            Choose a question and press the arrow. Then open a
                            source to see where the answer came from.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <aside className="of-demo-context">
                    <p className="of-demo-context-label">
                      KNOWLEDGE BEHIND THE ANSWER
                    </p>
                    <h4>
                      Familiar information.
                      <br /> Easier to find.
                    </h4>
                    <p>
                      Documents, staff notes and published playbooks give an
                      answer somewhere to start.
                    </p>
                    {sources.map((item) => sourceButton(item.id))}
                    <div className="of-demo-context-note">
                      <ShieldCheck size={17} aria-hidden="true" />
                      <span>
                        Read the source.
                        <br /> Keep your own judgment.
                      </span>
                    </div>
                  </aside>
                </div>
              )}

              {mode === "capture" && (
                <div className="of-demo-capture-layout">
                  <div className="of-demo-capture-main">
                    <p className="of-demo-eyebrow">
                      <Layers size={13} aria-hidden="true" /> TURN KNOWLEDGE
                      INTO A PLAYBOOK
                    </p>
                    <h3>
                      {drafted
                        ? "The know-how has a home."
                        : "Good notes. A clear next step."}
                    </h3>
                    <p className="of-demo-panel-description">
                      {drafted
                        ? "A draft stays a draft until someone reviews and publishes it."
                        : "Bring two pieces of the pantry’s knowledge together. Review the process before sharing it."}
                    </p>
                    {!drafted ? (
                      <div className="of-demo-source-selection">
                        <span className="of-demo-field-label">
                          SELECT SAMPLE SOURCES
                        </span>
                        {sources.slice(0, 2).map((item) => (
                          <div className="of-demo-selection-row" key={item.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedSources.includes(item.id)}
                                onChange={(event) => {
                                  setSelectedSources((current) =>
                                    event.target.checked
                                      ? [...current, item.id]
                                      : current.filter(
                                          (entry) => entry !== item.id,
                                        ),
                                  );
                                  setConsent(false);
                                }}
                              />
                              <span className="of-demo-selection-check">
                                <Check size={12} aria-hidden="true" />
                              </span>
                              <span className="of-demo-file-icon">
                                <FileText size={18} aria-hidden="true" />
                              </span>
                              <span>
                                <strong>{item.title}</strong>
                                <small>{item.kind}</small>
                              </span>
                            </label>
                            <button
                              onClick={(event) =>
                                openSource(item.id, event.currentTarget)
                              }
                              aria-label={`Read ${item.title}`}
                            >
                              <ChevronRight size={17} aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                        <label className="of-demo-consent">
                          <input
                            type="checkbox"
                            checked={consent}
                            onChange={(event) =>
                              setConsent(event.target.checked)
                            }
                          />
                          <span>
                            I’ve selected the sample text to use for this
                            walkthrough.
                          </span>
                        </label>
                        <button
                          className="of-demo-primary"
                          onClick={createDraft}
                          disabled={!consent || !selectedSources.length}
                        >
                          <Sparkles size={15} aria-hidden="true" /> Create
                          sample draft{" "}
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                        <p className="of-demo-local-note">
                          This demonstration stays in your browser. The real app
                          asks for your consent before sending selected source
                          text to its AI provider.
                        </p>
                      </div>
                    ) : (
                      <article className="of-demo-playbook of-demo-enter">
                        <div className="of-demo-playbook-meta">
                          <span>
                            <BookOpen size={14} aria-hidden="true" /> Volunteer
                            operations
                          </span>
                          <span
                            className={
                              published
                                ? "of-demo-status is-published"
                                : "of-demo-status"
                            }
                          >
                            {published ? (
                              <Check size={11} aria-hidden="true" />
                            ) : (
                              <span />
                            )}
                            {published ? "Published" : "Draft for review"}
                          </span>
                        </div>
                        {editing ? (
                          <label className="of-demo-edit-title">
                            Playbook title
                            <input
                              value={title}
                              onChange={(event) => setTitle(event.target.value)}
                              maxLength={120}
                            />
                          </label>
                        ) : (
                          <h4>{title}</h4>
                        )}
                        <ol className="of-demo-draft-steps">
                          {steps.map((step, index) => (
                            <li key={index}>
                              <span>{String(index + 1).padStart(2, "0")}</span>
                              {editing ? (
                                <label>
                                  Step {index + 1}
                                  <textarea
                                    value={step}
                                    onChange={(event) =>
                                      setSteps((current) =>
                                        current.map((entry, position) =>
                                          position === index
                                            ? event.target.value
                                            : entry,
                                        ),
                                      )
                                    }
                                    rows={3}
                                    maxLength={600}
                                  />
                                </label>
                              ) : (
                                <p>{step}</p>
                              )}
                            </li>
                          ))}
                        </ol>
                        <div className="of-demo-citations">
                          <span>BASED ON</span>
                          {selectedSources.map((item) =>
                            sourceButton(item, true),
                          )}
                        </div>
                        <div className="of-demo-review-actions">
                          {editing ? (
                            <button
                              className="of-demo-secondary"
                              disabled={
                                !title.trim() ||
                                steps.some((step) => !step.trim())
                              }
                              onClick={() => {
                                setEditing(false);
                                setStatus(
                                  "Your sample edits have been saved as a draft.",
                                );
                              }}
                            >
                              <Check size={14} aria-hidden="true" />
                              Save edits
                            </button>
                          ) : (
                            <button
                              className="of-demo-secondary"
                              onClick={() => {
                                setEditing(true);
                                setPublished(false);
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Edit steps
                            </button>
                          )}
                          {!published ? (
                            <button
                              className="of-demo-primary"
                              disabled={
                                editing ||
                                !title.trim() ||
                                steps.some((step) => !step.trim())
                              }
                              onClick={publish}
                            >
                              <Check size={14} aria-hidden="true" />
                              Approve &amp; publish
                            </button>
                          ) : (
                            <button
                              className="of-demo-primary"
                              onClick={() => selectMode("handoff")}
                            >
                              See it in use{" "}
                              <ArrowRight size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {published && (
                          <p className="of-demo-published-note" role="status">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            Published in this sample workspace. Reviewed by you.
                          </p>
                        )}
                      </article>
                    )}
                  </div>
                  <aside className="of-demo-context">
                    <p className="of-demo-context-label">
                      PEOPLE MAKE THE FINAL CALL
                    </p>
                    <span className="of-demo-review-mark">
                      <ShieldCheck
                        size={29}
                        strokeWidth={1.4}
                        aria-hidden="true"
                      />
                    </span>
                    <h4>
                      Useful knowledge.
                      <br /> Human judgment.
                    </h4>
                    <p>
                      Read the sources. Adjust a step. Publish when it reflects
                      how your team actually works.
                    </p>
                    <div className="of-demo-review-sequence">
                      <div>
                        <span className="is-done">
                          <Check size={11} aria-hidden="true" />
                        </span>
                        Select source text
                      </div>
                      <div>
                        <span className={drafted ? "is-done" : ""}>
                          {drafted ? (
                            <Check size={11} aria-hidden="true" />
                          ) : (
                            "2"
                          )}
                        </span>
                        Create a draft
                      </div>
                      <div>
                        <span className={published ? "is-done" : ""}>
                          {published ? (
                            <Check size={11} aria-hidden="true" />
                          ) : (
                            "3"
                          )}
                        </span>
                        Review and publish
                      </div>
                    </div>
                    <small className="of-demo-context-fine">
                      A sample playbook, not a live AI response or real
                      organizational policy.
                    </small>
                  </aside>
                </div>
              )}

              {mode === "handoff" && (
                <div className="of-demo-handoff-layout">
                  <div className="of-demo-handoff-main">
                    <p className="of-demo-eyebrow">
                      <BookOpen size={13} aria-hidden="true" /> KNOWLEDGE FOR
                      WHOEVER COMES NEXT
                    </p>
                    <h3>
                      First Saturday.
                      <br />A familiar way forward.
                    </h3>
                    <p className="of-demo-panel-description">
                      Sam is taking over volunteer coordination. The welcome
                      process is ready to read and use.
                    </p>
                    <article className="of-demo-playbook of-demo-checklist">
                      <div className="of-demo-playbook-meta">
                        <span>
                          <BookOpen size={14} aria-hidden="true" /> Volunteer
                          operations
                        </span>
                        <span className="of-demo-status is-published">
                          <Check size={11} aria-hidden="true" />
                          Published sample
                        </span>
                      </div>
                      <h4>
                        {publishedSnapshot
                          ? publishedSnapshot.title
                          : "Welcoming a new volunteer"}
                      </h4>
                      <div className="of-demo-progress">
                        <span>
                          {completed === 4
                            ? "Ready for the next first shift."
                            : "One shared process. A clear place to start."}
                        </span>
                        <strong>{completed} / 4</strong>
                        <div
                          role="progressbar"
                          aria-label="Sample checklist progress"
                          aria-valuemin={0}
                          aria-valuemax={4}
                          aria-valuenow={completed}
                        >
                          <span style={{ width: `${completed * 25}%` }} />
                        </div>
                      </div>
                      <div className="of-demo-checklist-items">
                        {(publishedSnapshot
                          ? publishedSnapshot.steps
                          : initialSteps
                        ).map((step, index) => (
                          <label
                            key={index}
                            className={checked[index] ? "is-checked" : ""}
                          >
                            <input
                              type="checkbox"
                              checked={checked[index]}
                              onChange={(event) => {
                                setChecked((current) =>
                                  current.map((entry, position) =>
                                    position === index
                                      ? event.target.checked
                                      : entry,
                                  ),
                                );
                                setStatus(
                                  event.target.checked
                                    ? `Step ${index + 1} checked in the sample checklist.`
                                    : `Step ${index + 1} unchecked.`,
                                );
                              }}
                            />
                            <span className="of-demo-task-check">
                              <Check size={13} aria-hidden="true" />
                            </span>
                            <span>{step}</span>
                          </label>
                        ))}
                      </div>
                      <div className="of-demo-checklist-foot">
                        <span>
                          <CheckCircle2 size={14} aria-hidden="true" />
                          {publishedSnapshot
                            ? "Reviewed by you in this example"
                            : "Reviewed sample playbook"}
                        </span>
                        <button
                          onClick={() => {
                            setChecked([false, false, false, false]);
                            setStatus("Sample checklist cleared.");
                          }}
                        >
                          <RotateCcw size={12} aria-hidden="true" />
                          Reset checklist
                        </button>
                      </div>
                    </article>
                    <p className="of-demo-local-note">
                      An illustrative checklist based on a published sample
                      playbook. Your live workspace lets your team read, edit
                      and publish articles.
                    </p>
                  </div>
                  <aside className="of-demo-context">
                    <p className="of-demo-context-label">THE HANDOFF</p>
                    <div className="of-demo-people">
                      <span className="of-demo-person-avatar">M</span>
                      <span className="of-demo-people-line">
                        <ArrowRight size={15} aria-hidden="true" />
                      </span>
                      <span className="of-demo-person-avatar is-new">S</span>
                    </div>
                    <h4>
                      Miriam’s experience.
                      <br /> Sam’s starting point.
                    </h4>
                    <p>
                      Someone new can see the steps and the notes behind them.
                      The process can keep improving as the team changes.
                    </p>
                    {sourceButton("welcome")}
                    {sourceButton("handoff")}
                    <div className="of-demo-context-note">
                      <BookOpen size={17} aria-hidden="true" />
                      <span>
                        The person changes.
                        <br /> The knowledge carries on.
                      </span>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          </div>
        </div>

        {source && (
          <div
            className="of-demo-source-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSource(null);
            }}
          >
            <div
              className="of-demo-source-drawer of-demo-enter"
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-source-title`}
            >
              <div className="of-demo-drawer-top">
                <span>
                  <FileText size={16} aria-hidden="true" /> SOURCE PREVIEW
                </span>
                <button
                  onClick={() => setSource(null)}
                  aria-label="Close source preview"
                >
                  <X size={19} aria-hidden="true" />
                </button>
              </div>
              <div className="of-demo-source-document">
                <p className="of-demo-eyebrow">{source.label}</p>
                <h3 id={`${id}-source-title`}>{source.title}</h3>
                <span className="of-demo-document-kind">{source.kind}</span>
                <div className="of-demo-document-rule" />
                {source.paragraphs.map((paragraph) => (
                  <div
                    className="of-demo-source-paragraph"
                    key={paragraph.heading}
                  >
                    <h4>{paragraph.heading}</h4>
                    <p>{paragraph.text}</p>
                  </div>
                ))}
                <div className="of-demo-document-disclosure">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <p>
                    Created for this example. Willow Creek Food Pantry and its
                    staff are fictional.
                  </p>
                </div>
              </div>
              <button
                className="of-demo-drawer-back"
                onClick={() => setSource(null)}
              >
                Back to the example <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="of-demo-sr-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}


export default function Demo() {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const exploreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const reveal = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (next === "answer" || next === "capture" || next === "handoff")
        setExpanded(true);
    };
    window.addEventListener("orgflow:demo-mode", reveal);
    return () => window.removeEventListener("orgflow:demo-mode", reveal);
  }, []);
  return (
    <section id="demo" className="demo-section" aria-labelledby={`${id}-heading`}>
      <div className="of-demo-intro">
        <h2 id={`${id}-heading`}>See what stays.</h2>
        <p>A first shift at Willow Creek Food Pantry, a fictional nonprofit.</p>
      </div>
      <div hidden={expanded}><GuidedDemo /></div>
      <div className="of-demo-explore-row">
        <button
          ref={exploreRef}
          className="of-demo-explore"
          aria-expanded={expanded}
          aria-controls={`${id}-full-example`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Back to the simple example" : "Explore the full example"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-full-example`} hidden={!expanded}>
        <FullDemo active={expanded} />
      </div>
    </section>
  );
}
