import React, { useRef } from "react";
import { usePausedOffscreen } from "./motion";

/*
 * The hero's product shots: real screens from the OrgFlow iOS app, recorded
 * while Jordan asks how to run Maria's Friday shift. They rise in on load and
 * float gently; the float pauses off screen.
 */
const screens = [
  {
    key: "home",
    src: "/screens/ask-home.webp",
    title: "Ask what your team knows",
    text: "Type a question or just start talking.",
  },
  {
    key: "voice",
    src: "/screens/ask-voice.webp",
    title: "Talk it through",
    text: "A live voice conversation with OrgFlow.",
  },
  {
    key: "answer",
    src: "/screens/ask-answer.webp",
    title: "Start with Maria’s playbook",
    text: "Jordan learns the Friday shift on day one.",
  },
];

export default function Screens() {
  const ref = useRef<HTMLDivElement>(null);
  usePausedOffscreen(ref);
  return (
    <div ref={ref} className="screens">
      {screens.map((screen, i) => (
        <figure
          className={`station station-${screen.key}`}
          key={screen.key}
          style={{ "--s": i } as React.CSSProperties}
        >
          <div className="station-float">
            <div className="phone">
              <img
                src={screen.src}
                alt={`OrgFlow on iPhone: ${screen.title.toLowerCase()}`}
                width={660}
                height={1434}
                loading={i === 0 ? "eager" : "lazy"}
              />
            </div>
          </div>
          <figcaption>
            <strong>{screen.title}</strong>
            <span>{screen.text}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
