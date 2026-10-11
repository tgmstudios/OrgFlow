import React, { useRef } from "react";
import { Check, FileText, Mail, Mic, Sparkles } from "lucide-react";
import { usePausedOffscreen } from "./motion";

/*
 * The hero's full-bleed "thread map": five knowledge threads in the OrgFlow
 * palette run edge to edge, bend around three product screens, and carry
 * Maria's knowledge (route chips) from her side of the map to Jordan's.
 * Lines draw on with stroke-dashoffset (pathLength = 1), chips ride the lines
 * with SVG animateMotion, and everything pauses off screen. A wide SVG serves
 * desktop and a tall one runs the same map vertically on phones.
 */

const threads = [
  { color: "#2b7672", label: "Rota", ink: "#fff" },
  { color: "#4faaa5", label: "Food orders", ink: "#fff" },
  { color: "#7753ce", label: "Freezer", ink: "#fff" },
  { color: "#a99ae6", label: "Donors", ink: "#202e35" },
  { color: "#f2aa88", label: "Handbook", ink: "#202e35" },
] as const;

const GAP = 18;
const wide = threads.map((_, i) => {
  const y0 = 400 + i * GAP;
  const y1 = y0 - 140;
  return {
    d: `M -20 ${y0} H 350 C 410 ${y0} 430 ${y1} 490 ${y1} H 710 C 770 ${y1} 790 ${y0} 850 ${y0} H 1220`,
    tail: `M -3200 ${y0} H -20 M 1220 ${y0} H 4400`,
  };
});
const tall = threads.map((_, i) => {
  const x0 = 236 + i * GAP;
  const x1 = 70 + i * GAP;
  return {
    d: `M ${x0} -20 V 560 C ${x0} 640 ${x1} 640 ${x1} 720 V 1250 C ${x1} 1330 ${x0} 1330 ${x0} 1410 V 1980`,
    tail: `M ${x0} -2400 V -20 M ${x0} 1980 V 4400`,
  };
});

function Chip({
  index,
  path,
  duration,
}: {
  index: number;
  path: string;
  duration: number;
}) {
  const thread = threads[index]!;
  const width = thread.label.length * 7 + 20;
  return (
    <g className="chip" style={{ "--i": index } as React.CSSProperties}>
      <rect
        x={-width / 2}
        y={-11}
        width={width}
        height={22}
        rx={11}
        fill={thread.color}
      />
      <text y={4} fill={thread.ink}>
        {thread.label}
      </text>
      <animateMotion
        dur={`${duration}s`}
        begin={`${-(index * 3.7 + 1.2)}s`}
        repeatCount="indefinite"
        rotate="0"
      >
        <mpath href={`#${path}`} />
      </animateMotion>
    </g>
  );
}

function Lines({
  id,
  geometry,
  viewBox,
  durations,
  children,
}: {
  id: string;
  geometry: { d: string; tail: string }[];
  viewBox: string;
  durations: number[];
  children: React.ReactNode;
}) {
  return (
    <svg
      className={`map-lines map-${id}`}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
    >
      {children}
      {geometry.map((line, i) => (
        <path
          key={`tail-${i}`}
          className="line-tail"
          stroke={threads[i]!.color}
          d={line.tail}
        />
      ))}
      {geometry.map((line, i) => (
        <path
          key={`line-${i}`}
          id={`${id}-${i}`}
          className="line"
          pathLength={1}
          stroke={threads[i]!.color}
          d={line.d}
          style={{ "--i": i } as React.CSSProperties}
        />
      ))}
      {geometry.map((_, i) => (
        <Chip
          key={`chip-${i}`}
          index={i}
          path={`${id}-${i}`}
          duration={durations[i]!}
        />
      ))}
    </svg>
  );
}

function StatusBar() {
  return (
    <div className="phone-status" aria-hidden="true">
      <span>9:41</span>
      <span className="phone-island" />
      <span className="phone-signal">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function CapturePhone() {
  return (
    <div className="phone">
      <div className="phone-screen">
        <StatusBar />
        <p className="phone-eyebrow">Capture · voice interview</p>
        <p className="phone-title">Maria, in her own words</p>
        <div className="phone-orb">
          <span className="orb-glow" />
          <span className="orb-wave">
            {Array.from({ length: 11 }, (_, i) => (
              <i key={i} style={{ "--b": i } as React.CSSProperties} />
            ))}
          </span>
        </div>
        <p className="phone-rec">
          <span className="rec-dot" /> REC 14:02
        </p>
        <div className="phone-bubble phone-bubble-ai">
          What happens when the freezer alarm goes off on a weekend?
        </div>
        <div className="phone-bubble phone-bubble-person">
          Call Luis first. The spare key is in the lockbox by the loading dock…
        </div>
        <div className="phone-action">
          <Sparkles size={11} aria-hidden="true" /> Draft a playbook
        </div>
      </div>
    </div>
  );
}

function AskPhone() {
  return (
    <div className="phone">
      <div className="phone-screen">
        <StatusBar />
        <p className="phone-eyebrow">Ask</p>
        <div className="phone-bubble phone-bubble-question">
          When is the food bank order due?
        </div>
        <div className="phone-answer">
          <p>
            Every other Tuesday by noon, in the Feeding Valley portal
            <sup>1</sup>. Confirm pickup with Sam the day before<sup>2</sup>.
          </p>
          <span className="phone-verified">
            <Check size={9} aria-hidden="true" /> Quoted from sources
          </span>
        </div>
        <div className="phone-source">
          <b>1</b>
          <FileText size={11} aria-hidden="true" />
          <span>
            Food bank ordering<small>Google Drive</small>
          </span>
        </div>
        <div className="phone-source">
          <b>2</b>
          <Mail size={11} aria-hidden="true" />
          <span>
            Re: Tuesday pickup<small>Gmail · Maria Reyes</small>
          </span>
        </div>
        <div className="phone-input">
          Ask about the pantry…
          <span>
            <Mic size={10} aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

const handoverItems = [
  "Saturday volunteer rota",
  "Food bank ordering",
  "Freezer alarm response",
  "Donor thank-you calls",
];

function TransferPhone() {
  return (
    <div className="phone">
      <div className="phone-screen">
        <StatusBar />
        <p className="phone-eyebrow">Handover · Oct 31</p>
        <div className="phone-people">
          <span className="avatar avatar-maria">MR</span>
          <span className="phone-thread" />
          <span className="avatar avatar-jordan">JL</span>
        </div>
        <div className="phone-names">
          <span>Maria Reyes</span>
          <span>Jordan Lee</span>
        </div>
        <div className="phone-progress">
          <span>18 of 24 items</span>
          <i>
            <b />
          </i>
        </div>
        <ul className="phone-checklist">
          {handoverItems.map((item, i) => (
            <li key={item} style={{ "--c": i } as React.CSSProperties}>
              <span className={i < 3 ? "done" : ""}>
                {i < 3 && <Check size={8} strokeWidth={3} aria-hidden="true" />}
              </span>
              {item}
            </li>
          ))}
        </ul>
        <div className="phone-review">Reviewed by Sam Rivera</div>
      </div>
    </div>
  );
}

const stations = [
  {
    key: "capture",
    title: "Capture what Maria knows",
    text: "A voice interview fills the gaps her files leave.",
    phone: <CapturePhone />,
  },
  {
    key: "ask",
    title: "Ask, and check the source",
    text: "Answers cite the email or document they came from.",
    phone: <AskPhone />,
  },
  {
    key: "transfer",
    title: "Hand it all to Jordan",
    text: "Everything Maria holds, reassigned before her last day.",
    phone: <TransferPhone />,
  },
];

export default function ThreadMap() {
  const ref = useRef<HTMLDivElement>(null);
  usePausedOffscreen(ref);
  return (
    <div
      ref={ref}
      className="thread-map"
    >
      <p className="sr-only">
        Illustration: five knowledge threads carry Maria Reyes’s rota, food bank
        orders, freezer notes, donor calls, and handbook past three OrgFlow
        screens to Jordan Lee.
      </p>
      <Lines
        id="w"
        geometry={wide}
        viewBox="0 0 1200 760"
        durations={[17, 21, 15, 19, 23]}
      >
        <path className="feeder" stroke="#e79a78" pathLength={1} d="M 780 20 V 332" />
        <path className="feeder" stroke="#63bdb7" pathLength={1} d="M 420 742 V 410" />
        <rect className="interchange" x={4} y={388} width={26} height={102} rx={13} />
        <rect className="interchange" x={1170} y={388} width={26} height={102} rx={13} />
        <circle className="stop" cx={780} cy={20} r={9} />
        <circle className="stop" cx={420} cy={742} r={9} />
        <text className="map-label" x={798} y={24}>GMAIL</text>
        <text className="map-label" x={438} y={746}>GOOGLE DRIVE</text>
        <text className="map-label map-label-strong" x={4} y={516}>MARIA REYES</text>
        <text className="map-label" x={4} y={532}>LEAVES OCT 31</text>
        <text className="map-label map-label-strong" x={1196} y={516} textAnchor="end">JORDAN LEE</text>
        <text className="map-label" x={1196} y={532} textAnchor="end">STARTS NOV 1</text>
      </Lines>
      <Lines
        id="t"
        geometry={tall}
        viewBox="0 0 400 1960"
        durations={[24, 29, 21, 27, 32]}
      >
        <path className="feeder" stroke="#e79a78" pathLength={1} d="M 388 300 H 308" />
        <path className="feeder" stroke="#63bdb7" pathLength={1} d="M 12 980 H 70" />
        <rect className="interchange" x={224} y={4} width={96} height={26} rx={13} />
        <rect className="interchange" x={224} y={1930} width={96} height={26} rx={13} />
        <circle className="stop" cx={388} cy={300} r={9} />
        <circle className="stop" cx={12} cy={980} r={9} />
        <text className="map-label" x={394} y={278} textAnchor="end">GMAIL</text>
        <text className="map-label" x={6} y={958}>DRIVE</text>
        <text className="map-label map-label-strong" x={212} y={22} textAnchor="end">FROM MARIA</text>
        <text className="map-label map-label-strong" x={212} y={1948} textAnchor="end">TO JORDAN</text>
      </Lines>
      <div className="stations">
        {stations.map((station, i) => (
          <figure
            className={`station station-${station.key}`}
            key={station.key}
            style={{ "--s": i } as React.CSSProperties}
          >
            <div className="station-float" aria-hidden="true">
              {station.phone}
            </div>
            <figcaption>
              <strong>{station.title}</strong>
              <span>{station.text}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
