import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, FileText, Pencil, RotateCcw, ShieldCheck, X } from "lucide-react";
import { sources } from "./sample-data";
import "./guided-demo.css";

type Stage = "question" | "answer" | "draft" | "handoff";
const initialTitle = "Welcoming a new volunteer";
const initialProcedure = [
  "Send the welcome email with the interest form and orientation sheet.",
  "Add their name and availability to the weekly rota.",
  "Welcome them at 8:30 a.m. for the food safety briefing. Pair them with an experienced volunteer.",
  "Check in after the shift and confirm next week’s availability for Jo Garcia.",
];
const welcome = sources.find((source) => source.id === "welcome")!;

export default function GuidedDemo() {
  const id = useId();
  const [stage, setStage] = useState<Stage>("question");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [steps, setSteps] = useState([...initialProcedure]);
  const [published, setPublished] = useState<{ title: string; steps: string[] } | null>(null);
  const [checked, setChecked] = useState([false, false, false, false]);
  const [status, setStatus] = useState("");
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const initialAction = useRef<HTMLButtonElement>(null);
  const editAction = useRef<HTMLButtonElement>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const sourceDialog = useRef<HTMLDivElement>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const previousStage = useRef(stage);
  const valid = Boolean(title.trim()) && steps.every((step) => Boolean(step.trim()));
  const completed = checked.filter(Boolean).length;

  useEffect(() => {
    if (stage !== previousStage.current) {
      previousStage.current = stage;
      if (stage === "question") initialAction.current?.focus();
      else stageHeading.current?.focus();
    }
  }, [stage]);

  useEffect(() => {
    if (editing) titleField.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!sourceOpen) return;
    const dialog = sourceDialog.current;
    const outside: { element: HTMLElement; wasInert: boolean }[] = [];
    let branch: HTMLElement | null = dialog;
    while (branch && branch !== document.body) {
      const parent = branch.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          outside.push({ element: sibling, wasInert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = parent;
    }
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSourceOpen(false);
      }
      if (event.key === "Tab" && dialog) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href], input, textarea, [tabindex='0']"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
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
      for (const { element, wasInert } of outside.reverse()) element.inert = wasInert;
      sourceTrigger.current?.focus();
    };
  }, [sourceOpen]);

  function citation() {
    return (
      <button className="of-guided-citation" onClick={(event) => {
        sourceTrigger.current = event.currentTarget;
        setSourceOpen(true);
      }} aria-haspopup="dialog">
        <FileText size={16} aria-hidden="true" />
        <span>{welcome.title}</span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    );
  }

  function reset() {
    setStage("question");
    setEditing(false);
    setReviewed(false);
    setTitle(initialTitle);
    setSteps([...initialProcedure]);
    setPublished(null);
    setChecked([false, false, false, false]);
    setSourceOpen(false);
    setStatus("The sample example has been reset.");
    initialAction.current?.focus();
  }

  function edit() {
    setStage("draft");
    setEditing(true);
    setReviewed(false);
    setStatus("Edit the sample draft. Any published version stays available until you publish these changes.");
  }

  return (
    <div className="of-guided-shell">
      <div className="of-guided-topbar">
        <span><img src="/brand-knot.webp" width="26" height="26" alt="" />OneFlow assistant</span>
        <button className="of-guided-reset" onClick={reset} aria-label="Reset the simple example">
          <RotateCcw size={14} aria-hidden="true" />Reset
        </button>
      </div>
      <div className={`of-guided-canvas of-guided-${stage}`}>
        {stage === "question" && (
          <div className="of-guided-question-content">
            <span className="of-guided-question-mark" aria-hidden="true"><img src="/brand-knot.webp" width="84" height="84" alt="" /></span>
            <h3>How do we welcome<br className="of-guided-desktop-break" /> a new volunteer?</h3>
            <button ref={initialAction} className="of-guided-primary" onClick={() => {
              setStage("answer");
              setStatus("A sample answer is ready, with a source you can read.");
            }}>See the answer<ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        )}
        {stage === "answer" && (
          <div className="of-guided-content of-demo-enter">
            <p className="of-guided-context">How do we welcome a new volunteer?</p>
            <h3 ref={stageHeading} tabIndex={-1}>Start before their<br />first Saturday.</h3>
            <p className="of-guided-answer">Send the welcome email with the interest form and orientation sheet. Ask them to arrive at 8:30 a.m. for a food safety briefing, pair them with an experienced volunteer, and check in before they leave.</p>
            {citation()}
            <button className="of-guided-primary" onClick={() => {
              setStage("draft");
              setStatus("A sample procedure is ready for your review. Nothing is published yet.");
            }}>Turn this into a procedure<ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        )}
        {stage === "draft" && (
          <div className="of-guided-content of-guided-procedure of-demo-enter">
            <div className="of-guided-document-head">
              <span><BookOpen size={15} aria-hidden="true" />Volunteer operations</span>
              <span className="of-guided-draft-badge">Draft</span>
            </div>
            <h3 ref={stageHeading} tabIndex={-1} className={editing ? "of-guided-hidden-heading" : ""}>{title}</h3>
            {editing && <label className="of-guided-edit-title">Procedure title<input ref={titleField} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>}
            <ol className="of-guided-steps">
              {steps.map((step, index) => <li key={index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {editing ? <label>Step {index + 1}<textarea value={step} rows={2} maxLength={600} onChange={(event) => setSteps((current) => current.map((item, position) => position === index ? event.target.value : item))} /></label> : <p>{step}</p>}
              </li>)}
            </ol>
            {citation()}
            <div className="of-guided-review">
              <div className="of-guided-review-stages" aria-label="Draft created. Human review required before publishing.">
                <span><Check size={12} aria-hidden="true" />Draft</span><ChevronRight size={13} aria-hidden="true" /><span className={reviewed ? "is-reviewed" : ""}>Review</span><ChevronRight size={13} aria-hidden="true" /><span>Publish</span>
              </div>
              <p>OneFlow helps write it. Your team decides what becomes official.</p>
              {!editing && <label className="of-guided-approval"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I’ve reviewed the steps and their source.</span></label>}
              {editing && !valid && <p className="of-guided-validation" role="alert">Give the procedure a title and keep every step filled in.</p>}
              <div className="of-guided-actions">
                {editing ? <button className="of-guided-primary" disabled={!valid} onClick={() => {
                  setEditing(false);
                  setReviewed(false);
                  setStatus("Your sample edits are saved as a draft. Review them before publishing.");
                  requestAnimationFrame(() => editAction.current?.focus());
                }}>Save draft<Check size={16} aria-hidden="true" /></button> : <>
                  <button className="of-guided-primary" disabled={!reviewed || !valid} onClick={() => {
                    if (!reviewed || !valid) return;
                    setPublished({ title: title.trim(), steps: [...steps] });
                    setChecked([false, false, false, false]);
                    setStage("handoff");
                    setStatus("You published the sample procedure. Sam can now use your reviewed version.");
                  }}>Publish procedure<Check size={16} aria-hidden="true" /></button>
                  <button ref={editAction} className="of-guided-text-action" onClick={edit}><Pencil size={14} aria-hidden="true" />Edit procedure</button>
                </>}
              </div>
              {published && <div className="of-guided-published-copy"><span>Sam still sees the last published version.</span><button className="of-guided-text-action" onClick={() => setStage("handoff")}>View published procedure<ArrowRight size={14} aria-hidden="true" /></button></div>}
            </div>
          </div>
        )}
        {stage === "handoff" && published && (
          <div className="of-guided-content of-guided-procedure of-demo-enter">
            <div className="of-guided-document-head"><span><BookOpen size={15} aria-hidden="true" />Volunteer operations</span><span className="of-guided-published-badge"><Check size={12} aria-hidden="true" />Published by you</span></div>
            <h3 ref={stageHeading} tabIndex={-1}>Ready for Sam’s<br />first Saturday.</h3>
            <p className="of-guided-handoff-copy">A new coordinator. The same shared knowledge.</p>
            <h4>{published.title}</h4>
            <div className="of-guided-checklist">
              {published.steps.map((step, index) => <label key={index} className={checked[index] ? "is-checked" : ""}><input type="checkbox" checked={checked[index]} onChange={(event) => {
                setChecked((current) => current.map((item, position) => position === index ? event.target.checked : item));
                setStatus(`Step ${index + 1} ${event.target.checked ? "completed" : "cleared"} in the sample checklist.`);
              }} /><span>{step}</span></label>)}
            </div>
            <div className="of-guided-completion" role="progressbar" aria-label="Procedure completion" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed} aria-valuetext={`${completed} of 4 steps complete`}><span style={{ transform: `scaleX(${completed / 4})` }} /></div>
            <div className="of-guided-progress"><span>{completed === 4 ? <><CheckCircle2 size={16} aria-hidden="true" />Ready for the next first shift.</> : `${completed} of 4 steps complete`}</span><button className="of-guided-text-action" onClick={() => {setChecked([false, false, false, false]);setStatus("The sample checklist has been cleared.");}}>Clear checklist</button></div>
            <div className="of-guided-actions"><a className="of-guided-primary" href="https://orgflow.dev/a/">Try OneFlow<ArrowRight size={17} aria-hidden="true" /></a><button className="of-guided-text-action" onClick={edit}><Pencil size={14} aria-hidden="true" />Edit draft</button></div>
          </div>
        )}
      </div>
      <div className="of-guided-footnote">
        <span>Fictional content. No live AI requests.</span>
        <details><summary>About this example</summary><p>This example stays in your browser and resets on reload. In the live app, you choose source text and give consent before it is sent to the AI provider. The checklist illustrates how a published procedure can be used.</p></details>
      </div>
      <p className="of-demo-sr-status" role="status" aria-live="polite">{status}</p>
      {sourceOpen && <div className="of-guided-source-overlay" onClick={(event) => {if (event.target === event.currentTarget) setSourceOpen(false);}}>
        <div className="of-guided-source-dialog of-demo-enter" ref={sourceDialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-source-title`}>
          <div className="of-guided-source-top"><span><FileText size={16} aria-hidden="true" />Sample source</span><button aria-label="Close source preview" onClick={() => setSourceOpen(false)}><X size={20} aria-hidden="true" /></button></div>
          <div className="of-guided-source-content"><h3 id={`${id}-source-title`}>{welcome.title}</h3><p className="of-guided-source-kind">{welcome.kind}</p>{welcome.paragraphs.map((paragraph) => <div key={paragraph.heading}><h4>{paragraph.heading}</h4><p>{paragraph.text}</p></div>)}<p className="of-guided-source-disclosure"><ShieldCheck size={16} aria-hidden="true" />Willow Creek Food Pantry and its staff are fictional.</p></div>
          <button className="of-guided-source-back" onClick={() => setSourceOpen(false)}>Back to the example<ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </div>}
    </div>
  );
}
