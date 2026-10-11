import React, { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  Check,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { prefersReducedMotion, usePausedOffscreen, useTyped } from "./motion";

/*
 * Pinned walkthrough: the product window stays put while the four steps
 * scroll past. The active step is whichever has crossed 60% of the viewport,
 * and each scene replays its own animation when it becomes active.
 */

const steps = [
  {
    key: "connect",
    name: "Connect",
    title: "Bring in what’s already written.",
    text: "Connect Gmail and Google Drive, then choose what OrgFlow may read. Originals stay where they are. OrgFlow indexes the text so the team can find it.",
    meta: ["Gmail", "Google Drive", "Uploads"],
  },
  {
    key: "capture",
    name: "Capture",
    title: "Record what was never written down.",
    text: "A short voice interview fills the gaps Maria’s files leave. OrgFlow asks about what’s missing, then drafts a playbook for her to review.",
    meta: ["Voice interviews", "Draft playbooks"],
  },
  {
    key: "ask",
    name: "Ask",
    title: "Get answers you can check.",
    text: "Jordan asks in plain language. Every answer cites the document or email it came from, and quotes are checked against the source text.",
    meta: ["Citations", "Quote checks"],
  },
  {
    key: "transfer",
    name: "Transfer",
    title: "Hand it over before the last day.",
    text: "The knowledge map shows who holds what. Reassign Maria’s playbooks and sources to Jordan in one step, with Sam reviewing the handover.",
    meta: ["Knowledge map", "Handover"],
  },
] as const;

const sources = [
  { title: "Volunteer handbook 2026", meta: "Drive · Doc", mail: false },
  { title: "Saturday rota", meta: "Drive · Sheet", mail: false },
  { title: "Re: Tuesday pickup", meta: "Gmail · Thread", mail: true },
  { title: "Freezer temperature log", meta: "Drive · Sheet", mail: false },
  { title: "Donor thank-you list", meta: "Drive · Sheet", mail: false },
];

function ConnectScene() {
  return (
    <div className="scene-connect">
      <div className="scene-head">
        <h4>Sources</h4>
        <div className="providers">
          <span>
            <i className="live-dot" /> Gmail
          </span>
          <span>
            <i className="live-dot" /> Google Drive
          </span>
        </div>
      </div>
      <ul className="source-list">
        {sources.map((source, i) => (
          <li key={source.title} style={{ "--r": i } as React.CSSProperties}>
            <span className="source-icon">
              {source.mail ? (
                <Mail size={15} aria-hidden="true" />
              ) : (
                <FileText size={15} aria-hidden="true" />
              )}
            </span>
            <span className="source-name">
              {source.title}
              <small>{source.meta}</small>
            </span>
            <span className="source-owner" title="Owner: Maria Reyes">
              MR
            </span>
            <span className="source-status">
              <i className="source-bar">
                <b />
              </i>
              <span className="source-done">
                <Check size={11} strokeWidth={3} aria-hidden="true" /> Indexed
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="scene-foot">
        128 files · 42 email threads · indexed with consent
      </p>
    </div>
  );
}

function CaptureScene() {
  return (
    <div className="scene-capture">
      <div className="capture-orb">
        <span className="orb-glow" />
        <span className="orb-wave">
          {Array.from({ length: 15 }, (_, i) => (
            <i key={i} style={{ "--b": i } as React.CSSProperties} />
          ))}
        </span>
        <p>
          Interviewing Maria Reyes
          <small>
            <span className="rec-dot" /> 14:02
          </small>
        </p>
      </div>
      <div className="capture-transcript">
        <span className="gap-chip">Gap found · freezer alarm</span>
        <p className="line-ai">
          You’ve covered ordering. What happens when the freezer alarm goes off
          on a weekend?
        </p>
        <p className="line-person">
          Call Luis first, he lives closest. The spare key is in the lockbox by
          the loading dock.
        </p>
        <div className="draft-card">
          <span className="draft-badge">Draft · needs review</span>
          <h5>Freezer alarm response</h5>
          <ol>
            <li>Call Luis Ortega</li>
            <li>Get the spare key from the dock lockbox</li>
            <li>Log the temperature and tell Sam</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

const answer: (string | number)[] = [
  "Every other Tuesday, before noon, through the Feeding Valley portal",
  1,
  ". The day before, confirm the pickup window with Sam Rivera",
  2,
  ".",
];
const answerLength = answer.reduce<number>(
  (total, part) => total + (typeof part === "string" ? part.length : 1),
  0,
);

function AskScene({ active }: { active: boolean }) {
  const typed = useTyped(" ".repeat(answerLength), active, 2);
  let remaining = typed;
  const done = typed >= answerLength;
  return (
    <div className={`scene-ask${done ? " is-done" : ""}`}>
      <div className="ask-question">
        <span className="avatar avatar-jordan">JL</span>
        <p>How do I place the food bank order?</p>
      </div>
      <div className="ask-answer">
        <span className="ask-mark">
          <img src="/brand-knot.webp" alt="" width="22" height="22" />
        </span>
        <p>
          {answer.map((part, i) => {
            if (remaining <= 0) return null;
            if (typeof part === "number") {
              remaining -= 1;
              return (
                <sup className="cite" key={i}>
                  {part}
                </sup>
              );
            }
            const shown = part.slice(0, remaining);
            remaining -= part.length;
            return <React.Fragment key={i}>{shown}</React.Fragment>;
          })}
          {!done && <span className="caret" />}
        </p>
      </div>
      <div className="ask-sources">
        <div className="ask-source">
          <b>1</b>
          <div>
            <span>
              <FileText size={12} aria-hidden="true" /> Food bank ordering ·
              Drive
            </span>
            <q>Orders close at 12:00 on alternate Tuesdays.</q>
          </div>
        </div>
        <div className="ask-source">
          <b>2</b>
          <div>
            <span>
              <Mail size={12} aria-hidden="true" /> Re: Tuesday pickup · Gmail
            </span>
            <q>Sam, can you confirm the 2 to 4 pm window for tomorrow?</q>
          </div>
        </div>
        <p className="ask-verified">
          <ShieldCheck size={13} aria-hidden="true" /> Both quotes match their
          sources word for word
        </p>
      </div>
    </div>
  );
}

const mapItems = [
  "Saturday rota",
  "Food bank orders",
  "Freezer alarm",
  "Donor calls",
  "Handbook",
];
const MARIA = { x: 92, y: 178 };
const JORDAN = { x: 468, y: 178 };
const FROM_X = 196;
const TO_X = 364;
const itemY = (i: number) => 86 + i * 46;

function TransferScene({ active, run }: { active: boolean; run: number }) {
  const settled = active && prefersReducedMotion();
  const animate = active && !settled;
  return (
    <div className="scene-transfer">
      <svg
        key={animate ? run : "static"}
        className={`map-svg${animate ? " is-running" : ""}${settled ? " is-settled" : ""}`}
        viewBox="0 0 560 360"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="thread-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="#4faaa5" />
            <stop offset="0.55" stopColor="#a99ae6" />
            <stop offset="1" stopColor="#f2aa88" />
          </linearGradient>
        </defs>
        <path
          className="map-review"
          d={`M 280 336 C 280 300 280 300 280 270`}
        />
        {mapItems.map((item, i) => {
          const y = itemY(i);
          return (
            <g key={`edges-${item}`} style={{ "--m": i } as React.CSSProperties}>
              <path
                className="edge edge-from"
                d={`M ${MARIA.x + 30} ${MARIA.y} C ${MARIA.x + 70} ${MARIA.y}, ${FROM_X - 70} ${y}, ${FROM_X - 56} ${y}`}
              />
              <path
                className="edge edge-to"
                pathLength={1}
                d={`M ${TO_X + 56} ${y} C ${TO_X + 70} ${y}, ${JORDAN.x - 70} ${JORDAN.y}, ${JORDAN.x - 30} ${JORDAN.y}`}
              />
            </g>
          );
        })}
        <g className="node node-maria">
          <circle cx={MARIA.x} cy={MARIA.y} r={30} />
          <text x={MARIA.x} y={MARIA.y + 5} className="node-initials">
            MR
          </text>
          <text x={MARIA.x} y={MARIA.y + 52} className="node-name">
            Maria Reyes
          </text>
          <text x={MARIA.x} y={MARIA.y + 68} className="node-meta">
            LEAVES OCT 31
          </text>
        </g>
        <g className="node node-jordan">
          <circle cx={JORDAN.x} cy={JORDAN.y} r={30} />
          <text x={JORDAN.x} y={JORDAN.y + 5} className="node-initials">
            JL
          </text>
          <text x={JORDAN.x} y={JORDAN.y + 52} className="node-name">
            Jordan Lee
          </text>
          <text x={JORDAN.x} y={JORDAN.y + 68} className="node-meta">
            STARTS NOV 1
          </text>
        </g>
        <g className="node node-sam">
          <circle cx={280} cy={336} r={14} />
          <text x={280} y={340} className="node-initials node-initials-small">
            SR
          </text>
          <text x={302} y={334} className="node-meta node-meta-left">
            SAM RIVERA
          </text>
          <text x={302} y={348} className="node-meta node-meta-left">
            REVIEWS HANDOVER
          </text>
        </g>
        {mapItems.map((item, i) => {
          const y = itemY(i);
          const start = settled ? TO_X : FROM_X;
          const distance = TO_X - FROM_X;
          const lift = 34 + (i % 2) * 18;
          return (
            <g
              key={item}
              className="map-item"
              transform={`translate(${start} ${y})`}
              style={{ "--m": i } as React.CSSProperties}
            >
              <rect x={-56} y={-13} width={112} height={26} rx={13} />
              <text y={4}>{item}</text>
              {animate && (
                <animateMotion
                  begin={`${0.5 + i * 0.32}s`}
                  dur="1.1s"
                  fill="freeze"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.65 0 0.35 1"
                  path={`M 0 0 C ${distance * 0.3} ${-lift}, ${distance * 0.7} ${-lift}, ${distance} 0`}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="transfer-bar">
        <span>
          <b>24 items</b> · 6 playbooks · 18 sources
        </span>
        <span className="transfer-button">
          <Check size={13} strokeWidth={2.6} aria-hidden="true" /> Handed to
          Jordan
        </span>
      </div>
    </div>
  );
}

const icons = [FileText, AudioLines, Sparkles, BookOpen];

export default function Story() {
  const [active, setActive] = useState(0);
  const [runs, setRuns] = useState([0, 0, 0, 0]);
  const grid = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  usePausedOffscreen(stage);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.6;
      let next = 0;
      items.current.forEach((item, i) => {
        if (item && item.getBoundingClientRect().top < line) next = i;
      });
      setActive((previous) => (previous === next ? previous : next));
      const element = grid.current;
      if (element) {
        const rect = element.getBoundingClientRect();
        const value = Math.min(
          1,
          Math.max(0, (line - rect.top) / Math.max(1, rect.height)),
        );
        element.style.setProperty("--progress", value.toFixed(4));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    setRuns((previous) =>
      previous.map((value, i) => (i === active ? value + 1 : value)),
    );
  }, [active]);

  return (
    <section
      id="how-it-works"
      className="story"
      aria-labelledby="story-title"
    >
      <div className="container story-head reveal">
        <p className="eyebrow">How it works</p>
        <h2 id="story-title">
          From one person’s memory
          <br />
          to <em>everyone’s</em> playbook.
        </h2>
      </div>
      <div className="container story-grid" ref={grid}>
        <div className="story-stage-wrap">
          <div className="story-stage" ref={stage} data-step={active}>
            <div className="stage-bar" aria-hidden="true">
              <span className="stage-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="stage-tabs">
                {steps.map((step, i) => (
                  <span
                    key={step.key}
                    className={i === active ? "is-active" : ""}
                  >
                    {step.name}
                  </span>
                ))}
              </span>
            </div>
            <div className="stage-body" aria-hidden="true">
              <div
                key={`connect-${runs[0]}`}
                className={`scene${active === 0 ? " is-active" : ""}`}
              >
                <ConnectScene />
              </div>
              <div
                key={`capture-${runs[1]}`}
                className={`scene${active === 1 ? " is-active" : ""}`}
              >
                <CaptureScene />
              </div>
              <div className={`scene${active === 2 ? " is-active" : ""}`}>
                <AskScene active={active === 2} />
              </div>
              <div className={`scene${active === 3 ? " is-active" : ""}`}>
                <TransferScene active={active === 3} run={runs[3]!} />
              </div>
            </div>
          </div>
        </div>
        <div className="story-rail" aria-hidden="true">
          <span />
        </div>
        <ol className="story-steps">
          {steps.map((step, i) => {
            const Icon = icons[i]!;
            return (
              <li
                key={step.key}
                ref={(element) => {
                  items.current[i] = element;
                }}
                className={i === active ? "is-active" : ""}
              >
                <div className="step-inner">
                  <span className="step-node">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <p className="step-label">
                    {String(i + 1).padStart(2, "0")} · {step.name}
                  </p>
                  <h3>{step.title}</h3>
                  <p className="step-text">{step.text}</p>
                  <p className="step-meta">
                    {step.meta.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
