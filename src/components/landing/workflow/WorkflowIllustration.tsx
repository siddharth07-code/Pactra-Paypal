"use client";

import React, { useId } from "react";
import gsap from "gsap";

const scenes = {
  mandate: {
    title: "Procurement mandate",
    description: "Budget, delivery and supplier criteria converge into a procurement mandate.",
    inputs: [["Budget"], ["Delivery"], ["Supplier", "criteria"]],
    review: null,
    output: ["Procurement", "mandate"],
  },
  negotiation: {
    title: "Supplier negotiation",
    description: "AI evaluates three supplier offers against purchasing limits and selects a proposal.",
    inputs: [["Supplier A"], ["Supplier B"], ["Supplier C"]],
    review: ["AI", "evaluation"],
    output: ["Selected", "proposal"],
  },
  audit: {
    title: "Agreement verification",
    description: "The agreement passes through policy checks to produce tamper-evident evidence.",
    inputs: [["Agreement"]],
    review: ["Policy", "checks"],
    output: ["Tamper-evident", "evidence"],
  },
  settlement: {
    title: "PayPal settlement",
    description: "The signed agreement goes through buyer approval and payment checks before reaching PayPal.",
    inputs: [["Signed", "agreement"]],
    review: ["Approval", "checks"],
    output: ["PayPal"],
  },
} as const;

const symbols = {
  budget: "M5 7h18v14H5z M5 7l14-4v4 M17 12h6v5h-6z",
  delivery: "M3 7h14v12H3z M17 11h5l4 4v4h-9 M7 22h1 M21 22h1",
  supplier: "M5 24V8l9-4 9 4v16 M3 24h22 M10 11h1m6 0h1m-8 5h1m6 0h1m-5 8v-4h4v4",
  document: "M7 3h10l5 5v17H7z M17 3v6h5 M11 13h7m-7 4h7m-7 4h4",
  signed: "M5 3h12l5 5v17H5z M17 3v6h5 M9 12h8m-8 4h6 M9 21l3-2 2 2 4-1",
  evaluation: "M14 3v5m0 12v5M3 14h5m12 0h5 M14 8l6 6-6 6-6-6z",
  checks: "M7 4h14v20H7z M10 11l1 1 3-3m-4 9 1 1 3-3 M16 11h2m-2 7h2",
  evidence: "M14 3l9 4v6c0 5-4 9-9 12-5-3-9-7-9-12V7z M10 14l3 3 5-6",
  proposal: "M7 3h10l5 5v17H7z M17 3v6h5 M11 17l2 2 5-5",
  paypal: "M9 4h8c4 0 5 3 4 6s-3 5-7 5h-3l-2 8H5z M15 15l-2 10h4l2-7c4 0 7-2 7-6 0-2-1-3-3-4",
};

const sceneSymbols = {
  mandate: { inputs: ["budget", "delivery", "supplier"], review: "checks", output: "document" },
  negotiation: { inputs: ["document", "document", "document"], review: "evaluation", output: "proposal" },
  audit: { inputs: ["document"], review: "checks", output: "evidence" },
  settlement: { inputs: ["signed"], review: "checks", output: "paypal" },
} as const satisfies Record<keyof typeof scenes, {
  inputs: readonly (keyof typeof symbols)[];
  review: keyof typeof symbols;
  output: keyof typeof symbols;
}>;

function Symbol({ name, x, y }: { name: keyof typeof symbols; x: number; y: number }) {
  return <path className="workflow-symbol" d={symbols[name]} transform={`translate(${x} ${y})`} />;
}

function FlowLine({ path, output = false }: { path: string; output?: boolean }) {
  return <>
    <path className="workflow-line" d={path} />
    <path className="workflow-trace" data-route={output ? "output" : "input"} d={path} pathLength="1" />
  </>;
}

function Stage({ x, width, label, symbol, stage }: {
  x: number;
  width: number;
  label: readonly string[];
  symbol: keyof typeof symbols;
  stage: "input" | "review" | "result";
}) {
  const center = x + width / 2;
  return <g data-stage={stage} className={stage === "result" ? "workflow-result" : undefined}>
    <rect className="workflow-stage" x={x} y="54" width={width} height="102" rx="5" />
    <Symbol name={symbol} x={center - 14} y={69} />
    <text x={center} y={label.length === 1 ? 127 : 117} textAnchor="middle">
      {label.map((line, index) => <tspan key={line} x={center} dy={index === 0 ? 0 : 18}>{line}</tspan>)}
    </text>
  </g>;
}

export function WorkflowIllustration({ scene }: { scene: keyof typeof scenes }) {
  const { title, description, inputs, review, output } = scenes[scene];
  const icons = sceneSymbols[scene];
  const converges = scene === "mandate" || scene === "negotiation";
  const resultX = review ? 292 : 254;
  const targetX = review ? 185 : resultX;
  const id = useId();

  return <div className="workflow-illustration">
    <svg id={id} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} viewBox="0 0 432 196">
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-description`}>{description}</desc>
      <g>
        {converges ? inputs.map((input, index) => {
          const y = 47 + index * 58;
          return <FlowLine key={input[0]} path={`M151 ${y} H160 Q170 ${y} 170 ${y + (105 - y) / 2} T185 105 H${targetX}`} />;
        }) : <FlowLine path={`M137 105 H${targetX}`} />}
        {review && <FlowLine path="M271 105 H292" output />}
        {converges ? inputs.map((input, index) => {
          const y = 47 + index * 58;
          return <g key={input[0]} data-stage="input">
            <rect className="workflow-stage" x="18" y={y - 22} width="133" height="44" rx="5" />
            <Symbol name={icons.inputs[index]} x={26} y={y - 14} />
            <text x="62" y={input.length === 1 ? y + 5 : y - 3}>
              {input.map((line, index) => <tspan key={line} x="62" dy={index === 0 ? 0 : 16}>{line}</tspan>)}
            </text>
          </g>;
        }) : <Stage x={18} width={119} label={inputs[0]} symbol={icons.inputs[0]} stage="input" />}
        {review && <Stage x={185} width={86} label={review} symbol={icons.review} stage="review" />}
        <Stage x={resultX} width={414 - resultX} label={output} symbol={icons.output} stage="result" />
      </g>
    </svg>
    <button type="button" className="workflow-play" aria-controls={id} aria-label={`Trace flow: ${title}`}>
      <span aria-hidden="true">↻</span> Trace flow
    </button>
  </div>;
}

export function createWorkflowTrace(panel: HTMLElement) {
  const inputCards = panel.querySelectorAll('[data-stage="input"] .workflow-stage');
  const inputRoutes = panel.querySelectorAll('[data-route="input"]');
  const reviewCard = panel.querySelector('[data-stage="review"] .workflow-stage');
  const outputRoute = panel.querySelector('[data-route="output"]');
  const resultCard = panel.querySelector('[data-stage="result"] .workflow-stage');
  const timeline = gsap.timeline({ paused: true });
  const pulse = { fill: "#725b72", stroke: "#fae0ef", duration: .23, repeat: 1, yoyo: true, ease: "sine.inOut" };

  timeline
    .to(inputCards, { ...pulse, stagger: .06 }, 0)
    .to(inputRoutes, { opacity: 1, duration: .1, stagger: .06 }, .14)
    .to(inputRoutes, { strokeDashoffset: -1, duration: .51, stagger: .06, ease: "none" }, .14)
    .to(inputRoutes, { opacity: 0, duration: .14, stagger: .06 }, .54);

  if (reviewCard && outputRoute) {
    timeline
      .to(reviewCard, pulse, .72)
      .to(outputRoute, { opacity: 1, duration: .1 }, .89)
      .to(outputRoute, { strokeDashoffset: -1, duration: .26, ease: "none" }, .89)
      .to(outputRoute, { opacity: 0, duration: .11 }, 1.05);
  }

  if (resultCard) {
    timeline.to(resultCard, { ...pulse, strokeWidth: 2, duration: .29 }, outputRoute ? 1.12 : .72);
  }
  return timeline;
}
