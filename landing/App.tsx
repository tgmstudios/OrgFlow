import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Menu,
  Plus,
  Quote,
  ShieldCheck,
  X,
} from "lucide-react";
import { usePausedOffscreen, useScrollProgress } from "./motion";
import Story from "./Story";
import Screens from "./Screens";

const APP_URL = "https://orgflow.dev/a/";
const navigation = [
  ["How it works", "how-it-works"],
  ["Why OrgFlow", "why"],
  ["Pricing", "pricing"],
] as const;

function Brand() {
  return (
    <a className="wordmark" href="#top" aria-label="OrgFlow home">
      <img src="/brand-knot.webp" alt="" width="30" height="30" />
      <span>OrgFlow</span>
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
      <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  );
}

function Navigation() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const onResize = () => {
      if (innerWidth > 900) setOpen(false);
    };
    const onScroll = () => setScrolled(scrollY > 8);
    onScroll();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);
  return (
    <header
      className={`site-header${scrolled || open ? " is-scrolled" : ""}`}
    >
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
          <AppLink className="button button-primary button-small">
            Open OrgFlow
          </AppLink>
        </div>
        <button
          ref={toggle}
          className="menu-toggle"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
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
            </a>
          ))}
          <a href={APP_URL}>Sign in</a>
          <AppLink>Open OrgFlow</AppLink>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-glow" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="container hero-copy">
        <p className="eyebrow hero-in" style={{ "--d": 0 } as React.CSSProperties}>
          Institutional memory for nonprofits
        </p>
        <h1 id="hero-title" className="hero-in" style={{ "--d": 1 } as React.CSSProperties}>
          When someone leaves,
          <br />
          <em>what they know</em> stays.
        </h1>
        <p className="hero-lede hero-in" style={{ "--d": 2 } as React.CSSProperties}>
          OrgFlow gathers your team’s email, documents, and hard-won know-how,
          answers questions with sources, and hands it all to whoever’s next.
        </p>
        <div className="hero-actions hero-in" style={{ "--d": 3 } as React.CSSProperties}>
          <AppLink>Open OrgFlow</AppLink>
          <a className="button button-ghost" href="#how-it-works">
            See how it works
            <ArrowDown size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
      <Screens />
    </section>
  );
}

const statement =
  "Every nonprofit runs on things one person knows. Which supplier delivers early on Fridays. Why the freezer alarm trips. Which donors want a call, not an email. On October 31, Maria Reyes leaves Center Valley Community Pantry.";
const emphasis = new Set(["Maria", "Reyes"]);

function Statement() {
  const ref = useRef<HTMLDivElement>(null);
  useScrollProgress(ref, { from: 0.9, to: 0.55 });
  const words = statement.split(" ");
  return (
    <section className="statement" aria-label="The problem">
      <div
        className="container statement-inner"
        ref={ref}
        style={{ "--count": words.length } as React.CSSProperties}
      >
        <p className="eyebrow">The problem</p>
        <p className="statement-text">
          {words.map((word, i) => (
            <span
              key={i}
              className={emphasis.has(word) ? "statement-em" : undefined}
              style={{ "--w": i } as React.CSSProperties}
            >
              {word}{" "}
            </span>
          ))}
        </p>
        <p className="statement-follow">
          Jordan Lee starts November 1. OrgFlow makes sure that first day starts with
          everything Maria knows, checked by their supervisor, Sam Rivera.
        </p>
        <p className="statement-note">
          Center Valley Community Pantry is a fictional example.
        </p>
      </div>
    </section>
  );
}

function Why() {
  const ref = useRef<HTMLDivElement>(null);
  usePausedOffscreen(ref);
  return (
    <section id="why" className="why" aria-labelledby="why-title">
      <div className="container">
        <div className="section-head reveal">
          <p className="eyebrow">Why OrgFlow</p>
          <h2 id="why-title">
            Built for small teams
            <br />
            with <em>long memories.</em>
          </h2>
        </div>
        <div className="bento" ref={ref}>
          <article className="card card-wide reveal">
            <div className="card-copy">
              <h3>AI drafts. People publish.</h3>
              <p>
                Interviews and answers become editable drafts. Nothing reaches
                your knowledge base until someone on your team publishes it.
              </p>
            </div>
            <div className="flow-pills" aria-hidden="true">
              <span>Draft</span>
              <i />
              <span>In review</span>
              <i />
              <span>Published</span>
            </div>
          </article>
          <article className="card reveal" style={{ "--d": 1 } as React.CSSProperties}>
            <div className="card-visual quote-visual" aria-hidden="true">
              <Quote size={18} />
              <p>
                <mark>Orders close at 12:00</mark> on alternate Tuesdays.
              </p>
            </div>
            <h3>Quotes, not guesses.</h3>
            <p>
              Citations point to the exact email or document, and quoted text is
              checked against the source.
            </p>
          </article>
          <article className="card reveal" style={{ "--d": 2 } as React.CSSProperties}>
            <div className="card-visual review-visual" aria-hidden="true">
              <div>
                <span>Freezer alarm response</span>
                <i style={{ "--w": "82%" } as React.CSSProperties} />
              </div>
              <div>
                <span>Saturday rota</span>
                <i style={{ "--w": "46%" } as React.CSSProperties} />
              </div>
              <div>
                <span>Donor thank-yous</span>
                <i className="due" style={{ "--w": "12%" } as React.CSSProperties} />
              </div>
            </div>
            <h3>Knowledge that stays current.</h3>
            <p>
              Every playbook has an owner and a review date, so stale steps get
              noticed before they cause trouble.
            </p>
          </article>
          <article className="card card-wide card-ink reveal">
            <div className="card-copy">
              <h3>Your originals stay put.</h3>
              <p>
                Files stay in Gmail and Google Drive. You choose what OrgFlow
                reads, and source text goes to the AI provider only after you
                consent.
              </p>
            </div>
            <div className="consent-visual" aria-hidden="true">
              <ShieldCheck size={20} />
              <div>
                <span>
                  <Check size={11} strokeWidth={3} /> Volunteer handbook 2026
                </span>
                <span>
                  <Check size={11} strokeWidth={3} /> Re: Tuesday pickup
                </span>
                <span className="off">Board minutes (not shared)</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  [
    "Can I try OrgFlow today?",
    "Yes. Open the app and choose the shared demo workspace. Use fictional content there. Opening the app does not start a subscription.",
  ],
  [
    "Can I use my existing documents?",
    "Upload a text file, or connect Google and select Drive documents and Gmail messages. Connected originals stay where they are. Microsoft connections are not available yet.",
  ],
  [
    "Does AI publish changes automatically?",
    "No. Generated content starts as an editable draft. Your team reviews it and publishes it separately. Later edits stay in draft until you publish again.",
  ],
  [
    "Is my organization’s information private?",
    "The demo workspace is shared, so do not add private information there. In the app, selected source text is sent to the AI provider only after you consent.",
  ],
] as const;

function Pricing() {
  return (
    <section id="pricing" className="pricing" aria-labelledby="pricing-title">
      <div className="container pricing-grid">
        <div className="pricing-intro reveal">
          <p className="eyebrow">Pricing</p>
          <h2 id="pricing-title">
            Start with the demo.
          </h2>
          <div className="faq">
            {faqs.map(([question, answer]) => (
              <details className="faq-item" key={question}>
                <summary>
                  {question}
                  <Plus size={17} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
        <div className="price-card reveal" style={{ "--d": 1 } as React.CSSProperties}>
          <p className="price-label">Founding nonprofit offer</p>
          <p className="price">
            <span>$19</span>
            <small>per month</small>
          </p>
          <p className="price-note">
            Proposed founding price. Explore the demo today.
          </p>
          <ul>
            <li>
              <Check size={15} strokeWidth={2.6} aria-hidden="true" /> Gmail and
              Google Drive sources
            </li>
            <li>
              <Check size={15} strokeWidth={2.6} aria-hidden="true" /> Voice
              interviews and draft playbooks
            </li>
            <li>
              <Check size={15} strokeWidth={2.6} aria-hidden="true" /> Cited
              answers for the whole team
            </li>
            <li>
              <Check size={15} strokeWidth={2.6} aria-hidden="true" /> Knowledge
              map and handovers
            </li>
          </ul>
          <AppLink className="button button-primary button-block">
            Open OrgFlow
          </AppLink>
          <p className="price-fine">
            Choose the shared demo workspace and use fictional content. Opening
            the app does not start a subscription.
          </p>
        </div>
      </div>
    </section>
  );
}

const finalThreads = ["#5cc2bc", "#a6e1dc", "#e9e2fb", "#c6b6f3", "#f4b796"];

function FinalCTA() {
  const ref = useRef<HTMLElement>(null);
  usePausedOffscreen(ref);
  return (
    <section className="final reveal-draw" ref={ref} aria-labelledby="final-title">
      <svg
        className="final-threads"
        viewBox="0 0 1200 520"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {finalThreads.map((color, i) => {
          const offset = (i - 2) * 46;
          return (
            <React.Fragment key={color}>
              <path
                className="final-line"
                pathLength={1}
                stroke={color}
                style={{ "--i": i } as React.CSSProperties}
                d={`M -40 ${260 + offset * 3.2} C 300 ${260 + offset * 3.2}, 420 ${260 + offset * 0.35}, 600 ${260 + offset * 0.2} S 900 ${260 - offset * 3.2}, 1240 ${260 - offset * 3.2}`}
              />
              <path
                className="final-pulse"
                pathLength={1}
                stroke={color}
                style={{ "--i": i } as React.CSSProperties}
                d={`M -40 ${260 + offset * 3.2} C 300 ${260 + offset * 3.2}, 420 ${260 + offset * 0.35}, 600 ${260 + offset * 0.2} S 900 ${260 - offset * 3.2}, 1240 ${260 - offset * 3.2}`}
              />
            </React.Fragment>
          );
        })}
      </svg>
      <div className="container final-inner reveal">
        <span className="final-knot">
          <img src="/brand-knot.webp" alt="" width="64" height="64" />
        </span>
        <h2 id="final-title">
          Give the next person
          <br />
          <em>a place to start.</em>
        </h2>
        <p>Open the demo workspace and follow Maria’s handover yourself.</p>
        <AppLink className="button button-light">Open OrgFlow</AppLink>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <Brand />
        <nav aria-label="Footer navigation">
          {navigation.map(([label, id]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
          <a href={APP_URL}>
            Sign in <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
        <p>© {new Date().getFullYear()} OrgFlow</p>
      </div>
    </footer>
  );
}

export default function App() {
  useEffect(() => {
    const root = document.documentElement;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      root.classList.remove("motion-ready");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    root.classList.add("motion-ready");
    document.querySelectorAll(".reveal, .reveal-draw").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return (
    <div id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <Hero />
        <Statement />
        <Story />
        <Why />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
