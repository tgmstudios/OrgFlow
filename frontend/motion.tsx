import React, { useEffect, useState } from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domMax,
  m,
} from "motion/react";

/** Shared curves, mirrored from the CSS tokens in style.css. */
export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  drawer: [0.32, 0.72, 0, 1],
} as const;

export { AnimatePresence, m };

/** Motion features plus the user's reduced-motion preference for every animated child. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Height + opacity reveal for panels that open in place (an accordion, not a popover). */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  // Clip only while animating, so shadows and focus rings show once settled.
  const [settled, setSettled] = useState(open);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="collapse"
          className={"collapse" + (className ? " " + className : "")}
          style={{ overflow: settled ? "visible" : "hidden" }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={(def: any) => setSettled(def?.height === "auto")}
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: "auto",
            opacity: 1,
            transition: {
              height: { duration: 0.24, ease: ease.out },
              opacity: { duration: 0.2, delay: 0.04, ease: "easeOut" },
            },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: {
              height: { duration: 0.18, ease: ease.out },
              opacity: { duration: 0.12, ease: "easeOut" },
            },
          }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** The sliding "on" pill inside a segmented control. One `id` per control. */
export function SegmentPill({ id }: { id: string }) {
  return (
    <m.span
      layoutId={id}
      className="seg-pill"
      aria-hidden="true"
      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
    />
  );
}

/** Exit for a card in a reflowing list; siblings slide into place via `layout`. */
export const cardExit = {
  layout: true,
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.16, ease: ease.out },
  },
  transition: { layout: { type: "spring", duration: 0.35, bounce: 0 } },
} as const;

/** Exit for a row in a stacked list: fade while its height collapses. */
export const rowExit = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: {
    opacity: 0,
    height: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    borderBottomWidth: 0,
    transition: { duration: 0.2, ease: ease.out },
  },
  style: { overflow: "hidden" },
} as const;

/**
 * Keeps an element mounted for its exit animation. `closing` is true while it
 * plays; pass `exitMs = 0` to unmount immediately (keyboard-initiated closes).
 */
export function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!exitMs) {
      setMounted(false);
      return;
    }
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return { mounted: open || mounted, closing: !open && mounted };
}

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
