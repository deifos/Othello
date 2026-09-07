import { useEffect, useId, useRef, useState } from "react";
import {
  advanceExpression,
  createExpressionState,
  reactExpression,
  type ExpressionState,
} from "../animation/expressions";
import {
  getFaceFeatures,
  type BlinkPhase,
  type Expression,
} from "../styles/expressions";
import "./hero-garden.css";

type Face = { expression: Expression; blink: BlinkPhase };
type Faces = readonly [Face, Face];
const calmFaces: Faces = [
  { expression: "happy", blink: "open" },
  { expression: "happy", blink: "open" },
];

/** The art and faces share one view box, so they stay aligned at every size. */
export default function HeroGarden({
  reducedMotion = false,
  className = "",
}: {
  reducedMotion?: boolean;
  className?: string;
}) {
  const faceId = useId().replace(/:/g, "");
  const element = useRef<HTMLDivElement>(null);
  const greet = useRef<(index: 0 | 1) => void>(() => {});
  const [faces, setFaces] = useState<Faces>(calmFaces);

  useEffect(() => {
    const root = element.current;
    if (!root) return;
    setFaces(calmFaces);
    const seeds = crypto.getRandomValues(new Uint32Array(2));
    const freshStates = (): [ExpressionState, ExpressionState] => {
      const now = performance.now();
      return [
        createExpressionState(seeds[0], now),
        createExpressionState(seeds[1], now),
      ];
    };
    let states = freshStates();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inView = true;
    let paused = true;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");

    const publish = () => {
      setFaces((previous) => {
        if (
          previous.every(
            (face, index) =>
              face.expression === states[index].expression &&
              face.blink === states[index].blink,
          )
        ) {
          return previous;
        }
        return [
          { expression: states[0].expression, blink: states[0].blink },
          { expression: states[1].expression, blink: states[1].blink },
        ];
      });
    };

    // One deadline timer serves both faces. Nothing runs between face changes.
    const schedule = () => {
      clearTimeout(timer);
      timer = undefined;
      if (paused) return;
      const now = performance.now();
      states = [
        advanceExpression(states[0], now),
        advanceExpression(states[1], now),
      ];
      publish();
      timer = setTimeout(
        schedule,
        Math.max(16, Math.min(states[0].nextAt, states[1].nextAt) - now),
      );
    };

    const refresh = () => {
      const shouldPause =
        reducedMotion ||
        motion.matches ||
        document.documentElement.dataset.motion === "reduced" ||
        document.hidden ||
        !inView;
      if (paused === shouldPause) return;
      paused = shouldPause;
      clearTimeout(timer);
      timer = undefined;
      states = freshStates();
      setFaces(calmFaces);
      if (!paused) schedule();
    };

    greet.current = (index) => {
      if (paused) return;
      states[index] = reactExpression(
        states[index],
        index === 0 ? "wink" : "grin",
        1200,
        performance.now(),
      );
      schedule();
    };
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      refresh();
    });
    const motionSetting = new MutationObserver(refresh);
    visibility.observe(root);
    motionSetting.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    motion.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();

    return () => {
      clearTimeout(timer);
      visibility.disconnect();
      motionSetting.disconnect();
      motion.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      greet.current = () => {};
    };
  }, [reducedMotion]);

  return (
    <div
      ref={element}
      className={`hero-garden ${className}`.trim()}
      aria-hidden="true"
    >
      <img
        className="hero-garden__art"
        src="/assets/hero-garden-live-v3.webp"
        width="1536"
        height="1024"
        alt=""
        fetchPriority="high"
        draggable="false"
      />
      <svg
        className="hero-garden__faces"
        viewBox="0 0 1536 1024"
        focusable="false"
      >
        <defs>
          <radialGradient id={`hero-eye-${faceId}`} cx="32%" cy="24%" r="76%">
            <stop stopColor="#665c47" />
            <stop offset=".45" stopColor="#2b2b20" />
            <stop offset="1" stopColor="#151b15" />
          </radialGradient>
          <linearGradient id={`hero-mouth-${faceId}`} x2="0" y2="1">
            <stop stopColor="#26231a" />
            <stop offset="1" stopColor="#594331" />
          </linearGradient>
        </defs>
        <circle
          className="hero-garden__greeting"
          cx="730"
          cy="755"
          r="140"
          onPointerEnter={() => greet.current(0)}
        />
        <circle
          className="hero-garden__greeting"
          cx="1005"
          cy="770"
          r="132"
          onPointerEnter={() => greet.current(1)}
        />
        {faces.map((face, index) => (
          <g
            key={index}
            className="hero-garden__face"
            data-pill={index === 0 ? "black" : "white"}
            data-expression={face.expression}
            data-blink={face.blink}
            transform={
              index === 0
                ? "translate(744 739) rotate(2) scale(3.24 2.25) translate(-50 -53)"
                : "translate(983 756) rotate(9) scale(3.1 2.25) translate(-50 -53)"
            }
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {getFaceFeatures(face.expression, face.blink, index === 0).map(
              (feature, featureIndex) => (
                <path
                  key={featureIndex}
                  {...feature}
                  fill={
                    feature.fill === "#34352c"
                      ? `url(#hero-eye-${faceId})`
                      : feature.fill === "#48382c"
                        ? `url(#hero-mouth-${faceId})`
                        : feature.fill
                  }
                />
              ),
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
