import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  Layers,
  Menu,
  MessageSquare,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Demo from "./Demo";

const APP_URL = "https://orgflow.dev/a/";
const navigation = [
  ["Why OrgFlow", "why-orgflow"],
  ["How it works", "how-it-works"],
  ["Features", "features"],
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
          <AppLink className="button button-small">Get started</AppLink>
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
          <AppLink>Get started</AppLink>
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
      <div className="portrait-head">
        <span className="section-label">
          A LITTLE KNOWLEDGE. A BIG DIFFERENCE.
        </span>
        <span className="portrait-index">
          {together ? "SHARED" : "SCATTERED"}
        </span>
      </div>
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
        <span aria-live="polite">
          {together
            ? "A place for what your people know."
            : "Sound familiar? It’s all here. Somewhere."}
        </span>
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
        <div className="eyebrow">
          <span className="tiny-orbit" /> INSTITUTIONAL MEMORY, FOR NONPROFITS
        </div>
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
          Turn the files, processes, and knowledge your team has built into
          something everyone can find, understand, and carry forward.
        </p>
        <div className="hero-actions">
          <AppLink>Start with OrgFlow</AppLink>
          <a className="button button-text" href="#demo">
            See how it works
            <ArrowDown size={17} aria-hidden="true" />
          </a>
        </div>
        <p className="hero-note">Built for the people who keep things going.</p>
      </div>
      <KnowledgePortrait />
      <div className="hero-foot">
        <span>WHEN SOMEONE LEAVES, WHAT THEY KNOW STAYS.</span>
        <a href="#why-orgflow">
          A better way to carry your mission forward
          <ArrowDown size={14} />
        </a>
      </div>
    </section>
  );
}

function HumanProblem() {
  return (
    <section id="why-orgflow" className="problem-section">
      <div className="container">
        <div className="problem-intro reveal">
          <span className="section-label">THE WORK BEHIND THE WORK</span>
          <h2>
            Your people move on.
            <br />
            <span>
              Your knowledge
              <br className="desktop-break" /> shouldn’t have to.
            </span>
          </h2>
          <p>
            Every organization has someone who knows how it all works. OrgFlow
            helps that knowledge belong to the team.
          </p>
        </div>
        <div className="problem-stories reveal">
          <article>
            <span className="story-number">01</span>
            <div>
              <h3>The fundraiser is next month.</h3>
              <p>
                The person who ran it last year has left. The checklist is
                buried in an old folder.
              </p>
            </div>
            <span className="story-margin">CONTEXT</span>
          </article>
          <article>
            <span className="story-number">02</span>
            <div>
              <h3>A new volunteer is starting.</h3>
              <p>
                Onboarding lives in five documents and the coordinator’s head.
                Where should they begin?
              </p>
            </div>
            <span className="story-margin">PROCESS</span>
          </article>
          <article>
            <span className="story-number">03</span>
            <div>
              <h3>You’ve answered this before.</h3>
              <p>
                Your team asks the same questions because knowing the answer and
                finding it are different things.
              </p>
            </div>
            <span className="story-margin">KNOWLEDGE</span>
          </article>
        </div>
        <div className="problem-close">
          <div className="continuity-line">
            <span />
            <Layers size={24} />
            <span />
          </div>
          <p>Keep the context. Carry on with the mission.</p>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="how-section container">
      <div className="section-heading reveal">
        <div>
          <span className="section-label">FROM SCATTERED TO SHARED</span>
          <h2>
            A home for what
            <br />
            your team knows.
          </h2>
        </div>
        <p>
          No blank page. No new way of thinking.
          <br />
          Start with the knowledge you already have.
        </p>
      </div>
      <div className="how-grid">
        <article className="how-step reveal">
          <div className="step-visual files-visual" aria-hidden="true">
            <div className="mini-path">
              Files <ChevronDown size={12} /> Volunteer operations
            </div>
            <div className="mini-file">
              <span className="file-symbol">
                <FileText size={17} />
              </span>
              <div>
                Volunteer handbook<small>Google Drive</small>
              </div>
              <ArrowUpRight size={14} />
            </div>
            <div className="mini-file">
              <span className="file-symbol note-symbol">
                <MessageSquare size={17} />
              </span>
              <div>
                First shift notes<small>Selected source</small>
              </div>
              <ArrowUpRight size={14} />
            </div>
            <div className="mini-file">
              <span className="file-symbol">
                <FileText size={17} />
              </span>
              <div>
                Saturday rota<small>Text file</small>
              </div>
              <ArrowUpRight size={14} />
            </div>
          </div>
          <span className="step-number">01 / BRING IT TOGETHER</span>
          <h3>Start with what you have.</h3>
          <p>
            Bring in a text file or select relevant Google Drive documents and
            Gmail messages. Keep connected originals where they belong.
          </p>
        </article>
        <article className="how-step reveal">
          <div className="step-visual answer-visual" aria-hidden="true">
            <div className="mini-question">
              What should a new volunteer do first?
            </div>
            <div className="mini-answer">
              <span className="mini-agent">
                <Layers size={17} />
              </span>
              <p>Meet the shift lead at 8:30 for a welcome and walk through.</p>
            </div>
            <div className="mini-citation">
              <FileText size={12} /> Volunteer handbook <span>↗</span>
            </div>
          </div>
          <span className="step-number">02 / MAKE IT USEFUL</span>
          <h3>Find the answer. Keep the context.</h3>
          <p>
            Ask in plain English. Follow the source references. Turn selected
            knowledge into a procedure your team can review and edit.
          </p>
        </article>
        <article className="how-step reveal">
          <div className="step-visual handoff-visual" aria-hidden="true">
            <div className="mini-path">
              <BookOpen size={14} /> Knowledge Base
            </div>
            <h4>Welcoming a new volunteer</h4>
            <div className="mini-task">
              <Check size={12} /> Meet the shift lead
            </div>
            <div className="mini-task">
              <Check size={12} /> Walk through the pantry
            </div>
            <div className="mini-task">
              <span className="empty-square" /> Pair up for the first shift
            </div>
            <div className="mini-published">
              <span className="avatar-small">ML</span> Reviewed and published
            </div>
          </div>
          <span className="step-number">03 / CARRY IT FORWARD</span>
          <h3>Give the next person a head start.</h3>
          <p>
            Publish the process when it’s ready. The next staff member has a
            place to start, and your team has something it can keep improving.
          </p>
        </article>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="features-section container">
      <div className="section-heading reveal">
        <div>
          <span className="section-label">BUILT AROUND REAL WORK</span>
          <h2>
            Less searching.
            <br />
            More understanding.
          </h2>
        </div>
        <p>
          A few thoughtful tools.
          <br />A clearer way to keep knowledge useful.
        </p>
      </div>
      <article className="feature-knowledge reveal">
        <div className="feature-text">
          <span className="feature-kicker">
            <BookOpen size={17} /> KNOWLEDGE BASE
          </span>
          <h3>
            A process that lives
            <br />
            beyond its author.
          </h3>
          <p>
            Write an article yourself or use the assistant to draft from
            selected sources. Edit the details, organize it into a category, and
            publish it when your team is ready.
          </p>
          <a
            href="#demo"
            className="text-link"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("orgflow:demo-mode", { detail: "capture" }),
              )
            }
          >
            Try capturing a process
            <ArrowRight size={16} />
          </a>
        </div>
        <div
          className="kb-preview"
          role="group"
          aria-label="Illustrative knowledge base article"
        >
          <div className="kb-top">
            <span>
              <BookOpen size={14} /> Knowledge Base
            </span>
            <span>Volunteer operations</span>
          </div>
          <div className="kb-document">
            <div className="kb-status">
              <span className="status-dot" /> Published{" "}
              <span className="kb-sample">SAMPLE</span>
            </div>
            <h4>Welcoming a new volunteer</h4>
            <p>A first shift should feel welcoming, clear, and useful.</p>
            <div className="kb-section">Before the first shift</div>
            <div className="kb-check">
              <Check size={13} />
              <span>Send the welcome note and arrival time.</span>
            </div>
            <div className="kb-check">
              <Check size={13} />
              <span>Assign a shift lead for the walk through.</span>
            </div>
            <div className="kb-section">On the day</div>
            <div className="kb-check">
              <span className="empty-square" />
              <span>Introduce the team and explain the pantry layout.</span>
            </div>
            <div className="kb-review">
              <span className="avatar-small">ML</span>
              <div>
                Reviewed by Marta Lewis
                <small>Ready for the next coordinator</small>
              </div>
              <ShieldCheck size={19} />
            </div>
          </div>
        </div>
      </article>
      <div className="feature-pair">
        <article className="feature-files reveal">
          <span className="feature-kicker">
            <FolderOpen size={17} /> FILES
          </span>
          <h3>
            Your files stay put.
            <br />
            Your team gets a clearer view.
          </h3>
          <p>
            Browse connected file links and arrange them in OrgFlow without
            moving the originals. Open the source when you need the full
            picture.
          </p>
          <div className="file-path-art" aria-hidden="true">
            <span>Google Drive</span>
            <span className="path-connector" />
            <FolderOpen size={22} />
            <span>OrgFlow</span>
            <span className="path-connector" />
            <span className="path-file">
              <FileText size={17} /> Volunteer operations
            </span>
          </div>
          <span className="feature-footnote">
            Google connections use read-only access.
          </span>
        </article>
        <article className="feature-voice reveal">
          <span className="feature-kicker">
            <MessageSquare size={17} /> THE ASSISTANT
          </span>
          <h3>
            A question is
            <br />a good place to start.
          </h3>
          <p>
            Ask about published knowledge through chat. Use browser voice input
            and readout when supported, with the same conversation close at
            hand.
          </p>
          <div className="voice-art" aria-hidden="true">
            <span className="voice-icon">
              <Mic size={22} />
            </span>
            <div className="waveform">
              {[9, 16, 24, 12, 32, 42, 22, 34, 16, 27, 38, 19, 12, 22, 8].map(
                (h, i) => (
                  <span style={{ height: h }} key={i} />
                ),
              )}
            </div>
            <span className="voice-caption">Your question. In your words.</span>
          </div>
          <span className="feature-footnote">
            Voice availability and processing depend on your browser.
          </span>
        </article>
      </div>
    </section>
  );
}

function HumanControl() {
  return (
    <section className="control-section">
      <div className="container control-inner">
        <div className="reveal">
          <span className="section-label">YOUR KNOWLEDGE. YOUR CALL.</span>
          <h2>
            The assistant drafts.
            <br />
            Your people decide.
          </h2>
          <p>
            AI can help put the pieces together. The people who know the work
            should have the final word.
          </p>
        </div>
        <div className="review-flow reveal">
          <div>
            <span className="review-icon">
              <FileText size={19} />
            </span>
            <span>
              Draft<small>Generated from selected sources</small>
            </span>
            <span className="flow-number">01</span>
          </div>
          <div>
            <span className="review-icon">
              <Search size={19} />
            </span>
            <span>
              Review<small>Check the references. Edit the details.</small>
            </span>
            <span className="flow-number">02</span>
          </div>
          <div>
            <span className="review-icon publish-icon">
              <Check size={19} />
            </span>
            <span>
              Publish<small>A separate, deliberate human action</small>
            </span>
            <span className="flow-number">03</span>
          </div>
        </div>
        <p className="control-detail">
          Drafts stay distinct from published articles. Later edits do not
          replace the published version until you publish again. Selected source
          text is sent to the AI provider only after you consent.
        </p>
      </div>
    </section>
  );
}

function ForYourTeam() {
  return (
    <section className="audience-section container">
      <div className="audience-intro reveal">
        <span className="section-label">WHEREVER YOU ARE IN THE MISSION</span>
        <h2>
          A stronger beginning.
          <br />A smoother next chapter.
        </h2>
      </div>
      <div className="audience-paths">
        <article className="reveal">
          <div className="path-emblem">
            <span />
            <span />
            <span />
          </div>
          <span className="step-number">JUST GETTING STARTED</span>
          <h3>
            Build good habits
            <br />
            from day one.
          </h3>
          <p>
            Give your first processes a home. Record why decisions were made.
            Make it easier for the next person to join you.
          </p>
          <AppLink className="text-link">Start your foundation</AppLink>
        </article>
        <article className="reveal">
          <div className="path-emblem path-established">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="step-number">ALREADY DOING THE WORK</span>
          <h3>
            Bring what you know
            <br />
            into the open.
          </h3>
          <p>
            You don’t have to start over. Use the documents you already have and
            capture the context your team adds every day.
          </p>
          <a href="#demo" className="text-link">
            Explore the example
            <ArrowRight size={16} />
          </a>
        </article>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="pricing-section container">
      <div className="pricing-copy reveal">
        <span className="section-label">THE FOUNDING NONPROFIT OFFER</span>
        <h2>
          A small investment
          <br />
          in what comes next.
        </h2>
        <p>
          You put enough into keeping your mission moving. Getting your
          knowledge in order should feel within reach.
        </p>
      </div>
      <div className="price-panel reveal">
        <div className="price-top">
          <span>Founding nonprofit plan</span>
          <span className="price-badge">EARLY ACCESS</span>
        </div>
        <div className="price">
          <span>$19</span>
          <span>
            per month
            <br />
            proposed founding price
          </span>
        </div>
        <p>
          Explore the working product today.
          <br />
          Help shape what comes next.
        </p>
        <AppLink>Open OrgFlow</AppLink>
        <div className="price-disclosure">
          Checkout is not live. Opening the app does not start a subscription or
          charge you.
        </div>
        <details className="early-access-note">
          <summary>
            Before you try the app
            <ChevronDown size={15} />
          </summary>
          <p>
            The current app is a shared demonstration workspace. Use fictional
            content while organization privacy controls are being developed.
          </p>
        </details>
      </div>
    </section>
  );
}

const faqs = [
  [
    "What is OrgFlow?",
    "OrgFlow is a place for the knowledge behind your nonprofit’s work. It brings file links, published articles, and reviewed procedures into one workspace, with an assistant to help you find answers and draft useful processes.",
  ],
  [
    "Do I need to be technical?",
    "No. You can ask a question in your own words, write an article, or start with a text file. If you connect Google, you choose the sources to use and review the assistant’s draft before publishing.",
  ],
  [
    "Can I use it if I’m just starting a nonprofit?",
    "Yes. You can create articles and procedures as your organization takes shape. You don’t need a library of existing documents to start building shared knowledge.",
  ],
  [
    "Does OrgFlow replace Google Drive?",
    "No. Connected files remain in their original provider. OrgFlow lets you browse and organize links, select relevant Google documents or Gmail messages, and turn selected information into articles. Microsoft connections are not available yet.",
  ],
  [
    "Can I review AI-generated content?",
    "Yes. Generated articles start as editable drafts. You can inspect source references, change the content, and publish it separately. Edits to an already published article remain a draft until you publish again.",
  ],
  [
    "Can my organization try it?",
    "You can open the working early access app now and create an account. It currently uses a shared demonstration workspace, so explore with fictional content. Organization isolation is not ready, and there is no paid checkout yet.",
  ],
] as const;
function FAQ() {
  return (
    <section className="faq-section container">
      <div className="reveal">
        <span className="section-label">
          A FEW THINGS YOU MIGHT BE WONDERING
        </span>
        <h2>Good questions.</h2>
      </div>
      <div className="faq-list reveal">
        {faqs.map(([question, answer], index) => (
          <details key={question}>
            <summary>
              <span className="faq-number">0{index + 1}</span>
              <span>{question}</span>
              <Plus size={20} aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-section">
      <div className="final-orbits" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="container final-inner reveal">
        <Layers size={39} strokeWidth={1.4} />
        <span className="section-label">THE MISSION CONTINUES</span>
        <h2>
          People make the difference.
          <br />
          <span>Let their knowledge stay.</span>
        </h2>
        <p>
          The next person shouldn’t have to start from scratch.
          <br />
          Give them something to carry forward.
        </p>
        <AppLink className="button button-light">Start with OrgFlow</AppLink>
        <a href="#demo" className="final-secondary">
          Take a look first
          <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
function Footer() {
  return (
    <footer className="site-footer container">
      <div className="footer-top">
        <div>
          <Brand />
          <p>
            When someone leaves,
            <br />
            what they know stays.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          {navigation.map(([label, id]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
          <a href="#demo">Interactive example</a>
          <a href={APP_URL}>
            Open the app
            <ArrowUpRight size={14} />
          </a>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} OrgFlow</span>
        <span>Built for the knowledge behind the mission.</span>
        <a href="#top">
          Back to top
          <ArrowUpRight size={14} />
        </a>
      </div>
    </footer>
  );
}

export default function App() {
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.documentElement.classList.add("motion-ready");
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);
  return (
    <div id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <Hero />
        <HumanProblem />
        <HowItWorks />
        <Demo />
        <Features />
        <HumanControl />
        <ForYourTeam />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
