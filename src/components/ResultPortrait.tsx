import { useEffect, useId, useRef, type RefObject } from "react";
import type { BlinkPhase, Expression } from "../styles/expressions";
import PillAvatar from "./PillAvatar";
import { playGameSound } from "../lib/gameAudio";
import "./ResultPortrait.css";

export type ResultOutcome = "win" | "loss" | "draw";

type ResultPortraitProps = {
  outcome?: ResultOutcome;
  styleId: string;
  color: "black" | "white";
  expression?: Expression;
  blink?: BlinkPhase;
  reducedMotion?: boolean;
};

const flowers = [
  { fromX: 32, x: 7, y: 4, endX: 0, spin: -110, color: "#fff5cf" },
  { fromX: 65, x: 91, y: 8, endX: 98, spin: 130, color: "#ffd1b9" },
  { fromX: 37, x: 24, y: -12, endX: 15, spin: -180, color: "#ffe3c0" },
  { fromX: 62, x: 74, y: -16, endX: 86, spin: 175, color: "#fff8e5" },
  { fromX: 44, x: 44, y: -19, endX: 29, spin: 85, color: "#ffd4c4" },
  { fromX: 59, x: 61, y: -6, endX: 72, spin: -125, color: "#fff6d8" },
  { fromX: 32, x: 8, y: 28, endX: 3, spin: -75, color: "#f9caa8" },
  { fromX: 68, x: 93, y: 30, endX: 99, spin: 100, color: "#f8d97d" },
];

/** Only deadlines run between short reactions. All movement stays in WAAPI. */
function useResultReaction(
  element: RefObject<HTMLButtonElement | null>,
  outcome: ResultOutcome | undefined,
  reducedMotion: boolean,
) {
  useEffect(() => {
    const root = element.current;
    if (!root) return;
    root.dataset.phase = "idle";

    const body = root.querySelector<SVGGElement>("[data-pill-body]");
    const shadow = root.querySelector<SVGEllipseElement>("[data-pill-shadow]");
    if (!body || !shadow || typeof body.animate !== "function") return;

    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let visible = typeof IntersectionObserver === "undefined";
    let running = false;
    let alive = true;

    function allowed() {
      return (
        alive &&
        !reducedMotion &&
        visible &&
        document.visibilityState !== "hidden" &&
        !motionQuery.matches &&
        document.documentElement.dataset.motion !== "reduced"
      );
    }

    function later(callback: () => void, delay: number) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (allowed()) callback();
      }, delay);
      timers.add(timer);
    }

    function animate(
      target: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const animation = target.animate(frames, { fill: "both", ...options });
      animations.add(animation);
      // A visibility or motion change cancels the sequence immediately.
      void animation.finished.catch(() => {});
      return animation;
    }

    function clearAnimations() {
      for (const animation of animations) animation.cancel();
      animations.clear();
    }

    function clearSequence() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      clearAnimations();
    }

    function rest(duration: number) {
      later(() => {
        clearAnimations();
        root!.dataset.phase = "idle";
        if (outcome === "win" || outcome === "loss")
          later(play, 3200 + Math.random() * 2300);
      }, duration);
    }

    function celebrate() {
      playGameSound("jump");
      root!.dataset.phase = "jump";
      animate(
        body!,
        [
          { transform: "translateY(0) scale(1, 1)", offset: 0 },
          { transform: "translateY(1px) scale(1.055, .91)", offset: 0.12 },
          { transform: "translateY(-19px) scale(.97, 1.045)", offset: 0.34 },
          { transform: "translateY(-18px) scale(1, 1)", offset: 0.4 },
          { transform: "translateY(0) scale(1.055, .91)", offset: 0.62 },
          { transform: "translateY(-7px) scale(.985, 1.025)", offset: 0.77 },
          { transform: "translateY(0) scale(1.025, .955)", offset: 0.91 },
          { transform: "translateY(0) scale(1, 1)", offset: 1 },
        ],
        { duration: 940, easing: "ease-in-out" },
      );
      animate(
        shadow!,
        [
          { transform: "scale(1)", opacity: 1, offset: 0 },
          { transform: "scale(1.04, 1)", opacity: 1, offset: 0.12 },
          { transform: "scale(.68, .8)", opacity: 0.42, offset: 0.34 },
          { transform: "scale(.7, .8)", opacity: 0.45, offset: 0.4 },
          { transform: "scale(1.04, 1)", opacity: 1, offset: 0.62 },
          { transform: "scale(.84, .9)", opacity: 0.7, offset: 0.77 },
          { transform: "scale(1)", opacity: 1, offset: 1 },
        ],
        { duration: 940, easing: "ease-in-out" },
      );
      root!.querySelectorAll<SVGGElement>("[data-result-flower]").forEach(
        (flower, index) => {
          const path = flowers[index];
          const spin = path.spin + (Math.random() - 0.5) * 40;
          animate(
            flower,
            [
              {
                transform: `translate(${path.fromX}px, 41px) rotate(0deg) scale(.2)`,
                opacity: 0,
                offset: 0,
              },
              {
                transform: `translate(${path.fromX}px, 34px) rotate(${spin * 0.12}deg) scale(.72)`,
                opacity: 1,
                offset: 0.12,
              },
              {
                transform: `translate(${path.x}px, ${path.y}px) rotate(${spin * 0.48}deg) scale(1)`,
                opacity: 1,
                offset: 0.44,
              },
              {
                transform: `translate(${path.endX}px, 50px) rotate(${spin * 0.9}deg) scale(.87)`,
                opacity: 0.8,
                offset: 0.82,
              },
              {
                transform: `translate(${path.endX}px, 78px) rotate(${spin}deg) scale(.55)`,
                opacity: 0,
                offset: 1,
              },
            ],
            {
              duration: 1080,
              delay: 180 + (index % 3) * 48,
              easing: "cubic-bezier(.24,.55,.42,1)",
            },
          );
        },
      );
      later(() => {
        root!.dataset.phase = "flowers";
        playGameSound("flowers");
      }, 190);
      rest(1390);
    }

    function cry() {
      const bubble = root!.querySelector<SVGGElement>("[data-result-bubble]");
      if (!bubble) return;
      playGameSound("bubble");
      root!.dataset.phase = "bubble";
      animate(
        body!,
        [
          { transform: "translateY(0) scale(1, 1) rotate(0deg)", offset: 0 },
          { transform: "translateY(1px) scale(1.012, .985) rotate(-.7deg)", offset: 0.2 },
          { transform: "translateY(0) scale(.995, 1.008) rotate(.6deg)", offset: 0.38 },
          { transform: "translateY(1px) scale(1.012, .985) rotate(-.6deg)", offset: 0.57 },
          { transform: "translateY(0) scale(.995, 1.008) rotate(.5deg)", offset: 0.73 },
          { transform: "translateY(1px) scale(1.018, .975) rotate(0deg)", offset: 0.86 },
          { transform: "translateY(0) scale(.99, 1.01) rotate(0deg)", offset: 0.94 },
          { transform: "translateY(0) scale(1, 1) rotate(0deg)", offset: 1 },
        ],
        { duration: 2320, easing: "ease-in-out" },
      );
      animate(
        bubble,
        [
          { transform: "translate(51px, 60px) scale(.04)", opacity: 0, offset: 0 },
          { transform: "translate(51px, 60px) scale(.16)", opacity: 0.85, offset: 0.12 },
          { transform: "translate(51px, 60px) scale(.56, .65) rotate(-3deg)", opacity: 1, offset: 0.46 },
          { transform: "translate(51px, 60px) scale(.96, 1.02) rotate(2deg)", opacity: 1, offset: 0.76 },
          { transform: "translate(51px, 60px) scale(1.055, .965) rotate(-3deg)", opacity: 1, offset: 0.86 },
          { transform: "translate(51px, 60px) scale(.99, 1.045) rotate(2deg)", opacity: 1, offset: 0.94 },
          { transform: "translate(51px, 60px) scale(1.04, 1.04)", opacity: 1, offset: 1 },
        ],
        { duration: 1950, easing: "ease-in-out" },
      );
      root!.querySelectorAll<SVGGElement>("[data-result-tear]").forEach(
        (tear, index) => {
          const x = index === 0 ? 32 : 68;
          animate(
            tear,
            [
              { transform: `translate(${x}px, 57px) scale(.15)`, opacity: 0, offset: 0 },
              { transform: `translate(${x}px, 61px) scale(.85)`, opacity: 0.85, offset: 0.28 },
              { transform: `translate(${x + (index ? 3 : -3)}px, 82px) scale(.7, 1.1)`, opacity: 0.65, offset: 0.8 },
              { transform: `translate(${x + (index ? 4 : -4)}px, 91px) scale(.3)`, opacity: 0, offset: 1 },
            ],
            { duration: 1090, delay: 350 + index * 280, easing: "ease-in" },
          );
        },
      );
      later(() => {
        root!.dataset.phase = "pop";
        playGameSound("pop");
        animate(
          bubble,
          [
            { transform: "translate(51px, 60px) scale(1.04)", opacity: 1 },
            { transform: "translate(51px, 60px) scale(1.18, 1.1)", opacity: 0 },
          ],
          { duration: 120, easing: "ease-out" },
        );
        root!.querySelectorAll<SVGGElement>("[data-result-droplet]").forEach(
          (droplet, index) => {
            const angle = (-160 + index * 54) * Math.PI / 180;
            const x = 66 + Math.cos(angle) * 24;
            const y = 78 + Math.sin(angle) * 21;
            animate(
              droplet,
              [
                { transform: "translate(66px, 78px) scale(.25)", opacity: 0, offset: 0 },
                { transform: `translate(${66 + Math.cos(angle) * 13}px, ${78 + Math.sin(angle) * 12}px) scale(1)`, opacity: 0.85, offset: 0.25 },
                { transform: `translate(${x}px, ${y + 9}px) scale(.45)`, opacity: 0, offset: 1 },
              ],
              { duration: 430, easing: "ease-out" },
            );
          },
        );
      }, 1950);
      rest(2450);
    }

    function play() {
      if (!allowed()) return;
      if (outcome === "win") celebrate();
      else if (outcome === "loss") cry();
    }

    function tap() {
      if (!allowed() || root!.dataset.phase === "tap") return;
      playGameSound("jump");
      // Continue from the current pose if a result reaction is interrupted.
      const bodyPose = getComputedStyle(body!).transform;
      const shadowPose = getComputedStyle(shadow!).transform;
      clearSequence();
      root!.dataset.phase = "tap";
      animate(body!, [
        { transform: bodyPose, offset: 0 },
        { transform: "translateY(1px) scale(1.035, .94)", offset: 0.14 },
        { transform: "translateY(-12px) scale(.985, 1.025)", offset: 0.43 },
        { transform: "translateY(-12px) scale(1, 1)", offset: 0.5 },
        { transform: "translateY(0) scale(1.04, .94)", offset: 0.8 },
        { transform: "translateY(0) scale(1, 1)", offset: 1 },
      ], { duration: 460, easing: "ease-in-out" });
      animate(shadow!, [
        { transform: shadowPose, opacity: 1, offset: 0 },
        { transform: "scale(.8, .86)", opacity: 0.58, offset: 0.43 },
        { transform: "scale(.8, .86)", opacity: 0.58, offset: 0.5 },
        { transform: "scale(1)", opacity: 1, offset: 1 },
      ], { duration: 460, easing: "ease-in-out" });
      rest(460);
    }

    function refresh() {
      if (allowed()) {
        if (running) return;
        running = true;
        root!.dataset.phase = "idle";
        if (outcome === "win" || outcome === "loss")
          later(play, outcome === "win" ? 720 : 1050);
      } else {
        running = false;
        clearSequence();
        root!.dataset.phase = "paused";
      }
    }

    const visibilityObserver = typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          refresh();
        });
    visibilityObserver?.observe(root);
    const motionObserver = new MutationObserver(refresh);
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    motionQuery.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    root.addEventListener("click", tap);
    refresh();

    return () => {
      alive = false;
      clearSequence();
      root.dataset.phase = "idle";
      visibilityObserver?.disconnect();
      motionObserver.disconnect();
      motionQuery.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      root.removeEventListener("click", tap);
    };
  }, [element, outcome, reducedMotion]);
}

export default function ResultPortrait({
  outcome,
  styleId,
  color,
  expression,
  blink,
  reducedMotion = false,
}: ResultPortraitProps) {
  const element = useRef<HTMLButtonElement>(null);
  const id = useId().replace(/:/g, "");
  useResultReaction(element, outcome, reducedMotion);
  return (
    <button
      ref={element}
      type="button"
      className="result-portrait"
      data-result={outcome ?? "none"}
      data-phase="idle"
      aria-label={`Make the ${color} pill jump`}
    >
      <PillAvatar
        size={78}
        color={color}
        styleId={styleId}
        expression={outcome === "win" ? "grin" : outcome === "loss" ? "sad" : outcome === "draw" ? "happy" : expression}
        blink={outcome ? undefined : blink}
        reducedMotion={reducedMotion}
      />
      {(outcome === "win" || outcome === "loss") && (
        <svg className="result-portrait__effects" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          {outcome === "win" ? flowers.map((flower, index) => (
            <g key={index} data-result-flower="" className="result-portrait__particle">
              {index < 6 ? <>
                <g fill={flower.color} stroke="#d5ac6d" strokeOpacity=".2" strokeWidth=".55">
                  <ellipse cy="-4.6" rx="3.1" ry="4.5" />
                  <ellipse cy="4.6" rx="3.1" ry="4.5" />
                  <ellipse cx="-4.6" rx="4.5" ry="3.1" />
                  <ellipse cx="4.6" rx="4.5" ry="3.1" />
                </g>
                <circle r="2.7" fill="#efbc59" />
                <circle cx="-.7" cy="-.8" r="1" fill="#ffe5a1" />
              </> : <path d="M-4 3 C-8-2-2-7 5-5 C7 2 3 6-4 3Z" fill={flower.color} />}
            </g>
          )) : <>
            <defs>
              <radialGradient id={`result-bubble-${id}`} cx="28%" cy="22%" r="85%">
                <stop stopColor="#f5ffff" stopOpacity=".82" />
                <stop offset=".55" stopColor="#c3e8eb" stopOpacity=".42" />
                <stop offset="1" stopColor="#9bcdd6" stopOpacity=".65" />
              </radialGradient>
            </defs>
            {[0, 1].map((tear) => (
              <g key={tear} data-result-tear="" className="result-portrait__particle">
                <path d="M0-5 C-1-2-4 0-4 3 A4 4 0 0 0 4 3 C4 0 1-2 0-5Z" fill="#b7dfe7" />
                <path d="M-1 0 Q-3 3-1 4" fill="none" stroke="#f5ffff" strokeWidth="1.3" strokeLinecap="round" />
              </g>
            ))}
            <g data-result-bubble="" className="result-portrait__particle">
              <path d="M0 0 C5 5 0 8-1 13 C-7 28 3 38 15 37 C28 39 37 25 30 12 C24 0 12 4 0 0Z" fill={`url(#result-bubble-${id})`} stroke="#8fbcc9" strokeOpacity=".8" strokeWidth="1.1" />
              <path d="M9 9 C5 11 3 15 3 19" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="3.2" strokeLinecap="round" />
              <ellipse cx="24" cy="29" rx="3" ry="1.4" fill="#f0ffff" opacity=".65" transform="rotate(-32 24 29)" />
            </g>
            {[0, 1, 2, 3, 4, 5].map((drop) => (
              <g key={drop} data-result-droplet="" className="result-portrait__particle">
                <ellipse rx={drop % 2 ? 1.7 : 2.3} ry={drop % 2 ? 2.8 : 2.3} fill="#add8e2" />
                <circle cx="-.5" cy="-.6" r=".7" fill="#f6ffff" />
              </g>
            ))}
          </>}
        </svg>
      )}
    </button>
  );
}
