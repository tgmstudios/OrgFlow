import { useEffect, useState, type RefObject } from "react";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True while the element intersects the viewport (or once, with `once`). */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, threshold = 0, rootMargin = "0px" } = {},
) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, once, threshold, rootMargin]);
  return inView;
}

/**
 * Writes how far an element has travelled through the viewport into a CSS
 * custom property (0 to 1). 0 when its top reaches `from` (a fraction of the
 * viewport height), 1 when its bottom reaches `to`. Work happens in one
 * requestAnimationFrame per scroll, and only while the element is near view.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  { from = 0.85, to = 0.45, property = "--progress" } = {},
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion()) {
      element.style.setProperty(property, "1");
      return;
    }
    let frame = 0;
    let near = true;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      const distance = rect.height + viewport * (from - to);
      const value = Math.min(
        1,
        Math.max(0, (viewport * from - rect.top) / Math.max(1, distance)),
      );
      element.style.setProperty(property, value.toFixed(4));
    };
    const schedule = () => {
      if (near && !frame) frame = requestAnimationFrame(update);
    };
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              near = !!entry?.isIntersecting;
              schedule();
            },
            { rootMargin: "25% 0px" },
          )
        : null;
    observer?.observe(element);
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, from, to, property]);
}

/**
 * Pauses CSS and SVG (SMIL) animations inside an element whenever it is off
 * screen or the tab is hidden, and keeps them paused with reduced motion.
 */
export function usePausedOffscreen(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const svgs = () => Array.from(element.querySelectorAll("svg"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const apply = () => {
      const run = visible && !document.hidden && !reduce.matches;
      element.classList.toggle("is-paused", !run);
      for (const svg of svgs()) {
        if (run) svg.unpauseAnimations?.();
        else svg.pauseAnimations?.();
      }
    };
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              visible = !!entry?.isIntersecting;
              apply();
            },
            { rootMargin: "10% 0px" },
          )
        : null;
    observer?.observe(element);
    document.addEventListener("visibilitychange", apply);
    reduce.addEventListener?.("change", apply);
    apply();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", apply);
      reduce.removeEventListener?.("change", apply);
    };
  }, [ref]);
}

/** Types `text` out while `run` is true; shows it whole with reduced motion. */
export function useTyped(text: string, run: boolean, charactersPerTick = 2) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!run) {
      setCount(0);
      return;
    }
    if (prefersReducedMotion()) {
      setCount(text.length);
      return;
    }
    let current = 0;
    const timer = window.setInterval(() => {
      current = Math.min(text.length, current + charactersPerTick);
      setCount(current);
      if (current >= text.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [text, run, charactersPerTick]);
  return count;
}
