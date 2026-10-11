import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, FileText, FolderOpen, Layers, Menu, MessageSquare, Plus, ShieldCheck, X } from "lucide-react";
import Demo from "./Demo";

const APP_URL = "https://orgflow.dev/a/";
const navigation = [
  ["How it works", "how-it-works"],
  ["Try the demo", "demo"],
  ["Pricing", "pricing"],
] as const;

function Brand({ light = false }: { light?: boolean }) {
  return (
    <a
      className={`wordmark${light ? " wordmark-light" : ""}`}
      href="#top"
      aria-label="OrgFlow home"
    >
      <Layers aria-hidden="true" strokeWidth={1.7} />
      <span>
        orgflow<span className="brand-period">.</span>
      </span>
    </a>
  );
}
function AppLink({
  children,
  className = "button button-primary",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={APP_URL}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
  );
}
function Navigation() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const resize = () => {
      if (innerWidth > 900) setOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <header className="site-header">
      <div className="nav-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(([label, id]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="sign-in" href={APP_URL}>
            Sign in
          </a>
          <AppLink className="button button-small">Try OrgFlow</AppLink>
        </div>
        <button
          ref={toggle}
          className="menu-toggle"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="mobile-nav"
          aria-label="Mobile navigation"
        >
          {navigation.map(([label, id]) => (
            <a onClick={() => setOpen(false)} href={`#${id}`} key={id}>
              {label}
              <ArrowUpRight size={18} />
            </a>
          ))}
          <a href={APP_URL}>
            Sign in
            <ArrowUpRight size={18} />
          </a>
          <AppLink>Try OrgFlow</AppLink>
        </nav>
      )}
    </header>
  );
}

function KnowledgePortrait() {
  const [together, setTogether] = useState(false);
  return (
    <div
      className={`knowledge-portrait ${together ? "is-together" : "is-scattered"}`}
    >
      <div className="portrait-stage" aria-hidden="true">
        <svg className="portrait-lines" viewBox="0 0 500 430" fill="none">
          <path d="M95 95C95 205 240 105 265 215S375 300 375 330" />
          <path d="M405 95C405 185 315 145 265 215S185 300 185 345" />
          <path d="M150 360C150 255 230 300 265 215" />
          <circle cx="265" cy="215" r="5" />
        </svg>
        <div className="archive-orbit orbit-one" />
        <div className="archive-orbit orbit-two" />
        <div className="paper-fragment fragment-handbook">
          <div className="paper-label">
            <FileText size={14} /> TEAM DOCUMENT
          </div>
          <h3>
            Volunteer
            <br />
            handbook
          </h3>
          <div className="paper-rule" />
          <p>First shift? Start here.</p>
          <span className="paper-page">PAGE 04</span>
        </div>
        <div className="paper-fragment fragment-note">
          <span className="paper-pin" />
          <div className="paper-label">MARTA’S NOTES</div>
          <p>Remember to pair every new volunteer with a shift lead.</p>
          <span className="paper-note-signature">
            The little things matter.
          </span>
        </div>
        <div className="paper-fragment fragment-schedule">
          <div className="paper-label">
            <FolderOpen size={14} /> OPERATIONS
          </div>
          <h3>Saturday rota</h3>
          <div className="schedule-line">
            <span>8:30</span>
            <span>Welcome & walk through</span>
          </div>
          <div className="schedule-line">
            <span>9:00</span>
            <span>First shift</span>
          </div>
          <span className="paper-page">WILLOW CREEK FOOD PANTRY</span>
        </div>
        <div className="archive-book">
          <div className="book-spine">KNOWLEDGE, CARRIED FORWARD</div>
          <div className="book-front">
            <Layers size={27} />
            <div>
              <span>VOLUNTEER OPERATIONS</span>
              <h3>
                A good first day.
                <br />
                Every time.
              </h3>
              <p>
                Welcome your next volunteer
                <br />
                with a process everyone can use.
              </p>
            </div>
            <div className="book-footer">
              <span>OrgFlow Knowledge Base</span>
              <ArrowUpRight size={17} />
            </div>
          </div>
        </div>
        <div className="resolved-note">
          <span className="resolved-check">
            <Check size={12} />
          </span>
          <div>
            Volunteer onboarding<small>3 sources. One shared procedure.</small>
          </div>
        </div>
      </div>
      <div className="portrait-control">
        <span className="sr-only" aria-live="polite">{together ? "The scattered documents are now one shared procedure." : "The handbook, notes, and rota are scattered."}</span>
        <button onClick={() => setTogether(!together)} aria-pressed={together}>
          {together ? "See the scattered view" : "Bring it together"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="portrait-disclosure">
        Illustration with fictional sample content
      </p>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero container" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">
          Your mission
          <br />
          shouldn’t depend
          <br />
          on one person’s
          <br />
          <span className="editorial-word">memory.</span>
        </h1>
        <p className="hero-description">
          Bring your nonprofit’s knowledge together. Find answers, document the work,
          and give the next person a place to start.
        </p>
        <div className="hero-actions">
          <AppLink>Try OrgFlow</AppLink>
          <a className="button button-text" href="#demo">
            See it in action
            <ArrowDown size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
      <KnowledgePortrait />
    </section>
  );
}

function HandoffStory() {
  return (
    <section id="how-it-works" className="handoff-story">
      <div className="container">
        <div className="story-heading reveal">
          <h2>The coordinator leaves.<br /><span>The welcome stays.</span></h2>
          <p>The handbook is there. So are the notes. Turn them into a process the next person can follow.</p>
        </div>
        <div className="story-sequence reveal" aria-label="From existing knowledge to a shared procedure">
          <div className="story-stage">
            <div className="story-source-visual" aria-hidden="true">
              <div className="story-sheet"><FileText size={20} /><span>Volunteer handbook</span><i /><i /><i /></div>
              <div className="story-note">Pair new volunteers<br />with a shift lead.</div>
            </div>
            <h3>The knowledge you have.</h3>
            <p>Start with the handbook and the notes.</p>
          </div>
          <ArrowRight className="story-connector" size={24} aria-hidden="true" />
          <div className="story-stage">
            <div className="story-answer-visual" aria-hidden="true">
              <MessageSquare size={21} /><p>How do we welcome<br />a new volunteer?</p>
              <div><span className="story-citation">1</span> Volunteer handbook</div>
            </div>
            <h3>An answer you can check.</h3>
            <p>Find what matters, with a source.</p>
          </div>
          <ArrowRight className="story-connector" size={24} aria-hidden="true" />
          <div className="story-stage">
            <div className="story-procedure-visual" aria-hidden="true">
              <span><BookOpen size={16} /> Knowledge Base</span>
              <h4>A volunteer’s first day</h4>
              <div><Check size={14} /> Welcome and orientation</div>
              <div><Check size={14} /> Meet the shift lead</div>
              <small>Reviewed. Ready to use.</small>
            </div>
            <h3>A process that stays.</h3>
            <p>Give the next person a place to start.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductOverview() {
  return (
    <section className="product-overview container" aria-labelledby="overview-title">
      <div className="overview-copy reveal">
        <h2 id="overview-title">One place to keep<br />the work moving.</h2>
        <p className="overview-intro">Build your first process or bring years of knowledge together.</p>
        <div className="overview-capability"><FolderOpen size={19} aria-hidden="true" /><div><h3>Your knowledge in one place.</h3><p>Bring relevant file links and articles together.</p></div></div>
        <div className="overview-capability"><MessageSquare size={19} aria-hidden="true" /><div><h3>Answers connected to their sources.</h3><p>Ask a question and follow the references.</p></div></div>
        <div className="overview-capability"><BookOpen size={19} aria-hidden="true" /><div><h3>Processes your team can improve.</h3><p>Write, review, and publish as the work changes.</p></div></div>
      </div>
      <div className="overview-visual reveal" role="group" aria-label="Illustrative OrgFlow Knowledge Base article using fictional content">
        <div className="overview-appbar"><span><img src="/brand-knot.webp" width="24" height="24" alt="" /> orgflow.</span><span>Knowledge Base</span></div>
        <div className="overview-document">
          <div className="overview-document-meta"><span>Volunteer operations</span><span className="overview-published"><Check size={11} /> Published</span></div>
          <h3>A volunteer’s first day</h3>
          <p>A good welcome makes it easier to come back.</p>
          <div className="overview-step"><span>01</span><div><h4>Start with a welcome</h4><p>Meet at reception. Walk through the pantry together.</p></div></div>
          <div className="overview-step"><span>02</span><div><h4>Introduce the shift lead</h4><p>Pair each new volunteer with someone who knows the work.</p></div></div>
          <div className="overview-step"><span>03</span><div><h4>Check in before they leave</h4><p>Make time for questions and arrange their next shift.</p></div></div>
          <div className="overview-source"><FileText size={14} /><span>Volunteer handbook <small>Source document</small></span></div>
        </div>
        <p className="overview-sample">Fictional example. Familiar work.</p>
      </div>
    </section>
  );
}

const faqs = [
  ["Can I try OrgFlow today?", "Yes. Open the app and choose the shared demo workspace. Use fictional content there. Opening the app does not start a subscription."],
  ["Can I use my existing documents?", "Upload a text file or select Google Drive documents and Gmail messages after connecting Google. Connected originals stay where they are. Microsoft connections are not available yet."],
  ["Does AI publish changes automatically?", "No. Generated content starts as an editable draft. Your team reviews it and publishes it separately. Later edits stay in draft until you publish again."],
  ["Is my organization’s information private?", "The demo workspace is shared. Do not add private information there. In the app, selected source text is sent to the AI provider only after you consent."],
] as const;

function Pricing() {
  return (
    <section id="pricing" className="simple-pricing container" aria-labelledby="pricing-title">
      <div className="pricing-layout reveal">
        <div className="pricing-intro"><h2 id="pricing-title">Explore OrgFlow<br />today.</h2><p>A place to start.<br />And something to build on.</p></div>
        <div className="founding-panel">
          <span className="founding-label">Founding nonprofit offer</span>
          <div className="founding-price"><span>$19</span><span>per month</span></div>
          <p className="founding-status">Proposed founding price. Explore the demo today.</p>
          <div className="workspace-disclosure"><ShieldCheck size={20} aria-hidden="true" /><p>Choose the shared demo workspace and use fictional content.</p></div>
          <AppLink className="button button-light">Try OrgFlow</AppLink>
          <p className="subscription-note">Opening the app does not start a subscription.</p>
        </div>
      </div>
      <div className="compact-faq reveal">
        <h3>Before you try it.</h3>
        <div className="faq-questions">
          {faqs.map(([question, answer]) => (
            <details className="faq-item" key={question}><summary>{question}<Plus size={17} aria-hidden="true" /></summary><p>{answer}</p></details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-section simple-final">
      <div className="final-orbits" aria-hidden="true"><span /><span /><span /></div>
      <div className="container final-inner reveal">
        <Layers size={39} strokeWidth={1.4} aria-hidden="true" />
        <h2>Give the next person<br /><span>a place to start.</span></h2>
        <AppLink className="button button-light">Try OrgFlow</AppLink>
      </div>
    </section>
  );
}
function Footer() {
  return (
    <footer className="site-footer container simple-footer">
      <div className="footer-top"><Brand /><nav aria-label="Footer navigation">
        {navigation.map(([label, id]) => <a href={`#${id}`} key={id}>{label}</a>)}
        <a href={APP_URL}>Sign in <ArrowUpRight size={14} aria-hidden="true" /></a>
      </nav></div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} OrgFlow</span><a href="#top">Back to top<ArrowUpRight size={14} aria-hidden="true" /></a></div>
    </footer>
  );
}

export default function App() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    document.documentElement.classList.add("motion-ready");
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => { observer.disconnect(); document.documentElement.classList.remove("motion-ready"); };
  }, []);
  return <div id="top"><a className="skip-link" href="#main">Skip to content</a><Navigation /><main id="main"><Hero /><HandoffStory /><Demo /><ProductOverview /><Pricing /><FinalCTA /></main><Footer /></div>;
}
