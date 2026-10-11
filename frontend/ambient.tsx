import React, { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

/** Slow-drifting thread-colored light behind the whole app. Decorative only. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora-blob a" />
      <span className="aurora-blob b" />
      <span className="aurora-blob c" />
      <span className="aurora-grain" />
    </div>
  );
}

/**
 * The assistant's presence: the knot floats inside a breathing glow and a slowly
 * turning iridescent halo. It tilts toward the pointer and quickens while working.
 */
export function Orb({ busy = false, size = 96 }: { busy?: boolean; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / innerWidth;
        const dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
        el.style.setProperty("--tilt-x", `${(-dy * 18).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(dx * 18).toFixed(2)}deg`);
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove);
    };
  }, []);
  return (
    <span
      ref={ref}
      className={"orb" + (busy ? " busy" : "")}
      style={{ "--orb": size + "px" } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="orb-halo" />
      <span className="orb-glow" />
      <span className="orb-ring" />
      <span className="orb-knot" />
    </span>
  );
}

/**
 * Types example prompts into a placeholder, holds, then backspaces to the next.
 * Pauses while `paused` (the field has text or focus) and when motion is reduced.
 */
export function useTypewriter(phrases: string[], paused: boolean) {
  const [text, setText] = useState(phrases[0] ?? "");
  const key = phrases.join("|");
  useEffect(() => {
    if (paused || prefersReducedMotion() || phrases.length === 0) {
      setText(phrases[0] ?? "");
      return;
    }
    let i = 0,
      chars = 0,
      deleting = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = phrases[i % phrases.length]!;
      if (!deleting) {
        chars++;
        setText(phrase.slice(0, chars));
        if (chars >= phrase.length) {
          deleting = true;
          timer = setTimeout(tick, 2000);
          return;
        }
        // Human rhythm: a little jitter, a beat after spaces and punctuation.
        const ch = phrase[chars - 1];
        timer = setTimeout(tick, 34 + Math.random() * 46 + (ch === " " ? 40 : /[,.?]/.test(ch!) ? 160 : 0));
      } else {
        chars -= 2;
        if (chars <= 0) {
          chars = 0;
          deleting = false;
          i++;
          setText("");
          timer = setTimeout(tick, 380);
          return;
        }
        setText(phrase.slice(0, chars));
        timer = setTimeout(tick, 18);
      }
    };
    chars = 0;
    setText("");
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [key, paused]);
  return text;
}

type Levels = { input: () => Uint8Array; output: () => Uint8Array };

/**
 * Live voice waveform. While connected it draws the microphone (teal) or the
 * agent's voice (iris) from real frequency data; otherwise it idles as a calm,
 * slowly breathing line so the control never looks dead.
 */
export function VoiceWave({
  status,
  speaking,
  muted,
  levels,
}: {
  status: string;
  speaking: boolean;
  muted: boolean;
  levels: Levels;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ status, speaking, muted, levels });
  live.current = { status, speaking, muted, levels };
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduced = prefersReducedMotion();
    const BARS = 44;
    const heights = new Float32Array(BARS);
    let frame = 0,
      t = 0;
    let sizing = 0;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(c.clientWidth * dpr),
        h = Math.round(c.clientHeight * dpr);
      if (c.width === w && c.height === h) return;
      c.width = w;
      c.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    // Resize the backing store outside the observer callback, so it can't
    // re-trigger layout within the same frame (the "ResizeObserver loop" error).
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(sizing);
      sizing = requestAnimationFrame(resize);
    });
    ro.observe(c);
    const colors = (() => {
      const s = getComputedStyle(c);
      return {
        teal: s.getPropertyValue("--teal").trim() || "#4faaa5",
        iris: s.getPropertyValue("--iris").trim() || "#a99ae6",
        apricot: s.getPropertyValue("--apricot").trim() || "#f2aa88",
        idle: s.getPropertyValue("--control-border").trim() || "#b3bfbe",
      };
    })();
    const draw = () => {
      t += 1 / 60;
      const { status, speaking, muted, levels } = live.current;
      const w = c.clientWidth,
        h = c.clientHeight,
        mid = h / 2;
      const connected = status === "connected";
      let data: Uint8Array | null = null;
      if (connected && !muted) {
        try {
          data = speaking ? levels.output() : levels.input();
        } catch {
          data = null;
        }
      }
      for (let i = 0; i < BARS; i++) {
        // Mirror around the center so the shape reads as a voice, not a spectrum.
        const k = Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2);
        let target: number;
        if (data && data.length) {
          const bin = Math.floor((1 - k) * Math.min(data.length, 96) * 0.85);
          target = (data[bin] ?? 0) / 255;
          target = Math.pow(target, 0.8) * (1 - k * 0.35);
        } else {
          const speed = status === "connecting" ? 3.2 : 1.1;
          target =
            0.08 +
            0.07 * Math.sin(t * speed + i * 0.42) * Math.cos(t * speed * 0.6 - i * 0.19) +
            (status === "connecting" ? 0.12 * Math.max(0, Math.sin(t * 4 - i * 0.35)) : 0);
          target *= 1 - k * 0.5;
        }
        heights[i] = heights[i]! + (Math.max(0.03, target) - heights[i]!) * (reduced ? 1 : 0.28);
      }
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      if (connected && !muted) {
        const main = speaking ? colors.iris : colors.teal;
        grad.addColorStop(0, colors.teal);
        grad.addColorStop(0.5, main);
        grad.addColorStop(1, speaking ? colors.apricot : colors.iris);
      } else {
        grad.addColorStop(0, colors.teal);
        grad.addColorStop(0.5, colors.iris);
        grad.addColorStop(1, colors.apricot);
      }
      ctx.fillStyle = grad;
      ctx.globalAlpha = connected ? (muted ? 0.35 : 1) : 0.7;
      const gap = w / BARS,
        bw = Math.max(2, gap * 0.48);
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(3, heights[i]! * (h - 6));
        const x = i * gap + (gap - bw) / 2;
        ctx.beginPath();
        ctx.roundRect(x, mid - bh / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced || connected) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(sizing);
      ro.disconnect();
    };
  }, []);
  return (
    <canvas
      ref={canvas}
      className={
        "voice-wave" +
        (status === "connected" ? (speaking ? " speaking" : " listening") : "")
      }
      aria-hidden="true"
    />
  );
}

/** Counts from 0 to `value` with an ease-out, once per value change. */
export function CountUp({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) return setShown(value);
    const start = performance.now(),
      a = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - t, 3)));
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{shown}</>;
}
