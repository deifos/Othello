import { useEffect, useId, useRef, useState } from "react";
import { usePillJumps } from "../animation/usePillJumps";
import {
  advanceExpression,
  createExpressionState,
} from "../animation/expressions";
import { getCharacterStyle } from "../styles/characters";
import {
  getFaceFeatures,
  type BlinkPhase,
  type Expression,
} from "../styles/expressions";

type AvatarFace = { expression: Expression; blink: BlinkPhase };
type AvatarSubscriber = {
  element: SVGSVGElement;
  seed: number;
  state: ReturnType<typeof createExpressionState>;
  visible: boolean;
  update: (face: AvatarFace) => void;
};

const quietFace: AvatarFace = { expression: "happy", blink: "open" };
const avatarSubscribers = new Set<AvatarSubscriber>();
let avatarTimer: ReturnType<typeof setTimeout> | undefined;
let avatarVisibility: IntersectionObserver | undefined;
let avatarMotionObserver: MutationObserver | undefined;
let avatarMotionQuery: MediaQueryList | undefined;
let avatarsPaused = false;

/** All avatars share one deadline timer; no render loop runs between changes. */
function scheduleAvatars() {
  clearTimeout(avatarTimer);
  avatarTimer = undefined;
  if (avatarsPaused) return;

  const now = performance.now();
  let nextAt = Infinity;
  for (const subscriber of avatarSubscribers) {
    if (!subscriber.visible) continue;
    if (subscriber.state.nextAt <= now) {
      subscriber.state = advanceExpression(subscriber.state, now);
      subscriber.update(subscriber.state);
    }
    nextAt = Math.min(nextAt, subscriber.state.nextAt);
  }
  if (Number.isFinite(nextAt)) {
    avatarTimer = setTimeout(scheduleAvatars, Math.max(16, nextAt - now));
  }
}

function refreshAvatarMotion() {
  const paused =
    document.visibilityState === "hidden" ||
    !!avatarMotionQuery?.matches ||
    document.documentElement.dataset.motion === "reduced";
  if (paused !== avatarsPaused) {
    avatarsPaused = paused;
    const now = performance.now();
    for (const subscriber of avatarSubscribers) {
      subscriber.state = createExpressionState(subscriber.seed, now);
      // Do not leave a face frozen halfway through a blink.
      subscriber.update(quietFace);
    }
  }
  scheduleAvatars();
}

function observeAvatars() {
  avatarMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  avatarMotionQuery.addEventListener("change", refreshAvatarMotion);
  document.addEventListener("visibilitychange", refreshAvatarMotion);
  avatarMotionObserver = new MutationObserver(refreshAvatarMotion);
  avatarMotionObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
  if (typeof IntersectionObserver !== "undefined") {
    avatarVisibility = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        for (const subscriber of avatarSubscribers) {
          if (subscriber.element === entry.target) {
            subscriber.visible = entry.isIntersecting;
          }
        }
      }
      scheduleAvatars();
    });
  }
  refreshAvatarMotion();
}

function subscribeAvatar(subscriber: AvatarSubscriber) {
  subscriber.update(quietFace);
  avatarSubscribers.add(subscriber);
  if (avatarSubscribers.size === 1) observeAvatars();
  avatarVisibility?.observe(subscriber.element);
  scheduleAvatars();
  return () => {
    avatarVisibility?.unobserve(subscriber.element);
    avatarSubscribers.delete(subscriber);
    if (avatarSubscribers.size === 0) {
      clearTimeout(avatarTimer);
      avatarTimer = undefined;
      avatarVisibility?.disconnect();
      avatarVisibility = undefined;
      avatarMotionObserver?.disconnect();
      avatarMotionObserver = undefined;
      avatarMotionQuery?.removeEventListener("change", refreshAvatarMotion);
      avatarMotionQuery = undefined;
      document.removeEventListener("visibilitychange", refreshAvatarMotion);
      avatarsPaused = false;
    } else {
      scheduleAvatars();
    }
  };
}

function avatarSeed(id: string) {
  let seed = 2166136261;
  for (const character of id) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }
  return seed >>> 0;
}

export type PillAvatarProps = {
  styleId?: string;
  color?: "black" | "white";
  size?: number;
  className?: string;
  expression?: Expression;
  blink?: BlinkPhase;
  animated?: boolean;
  reducedMotion?: boolean;
  jumping?: boolean;
};

/** The same face and accessory language as the three dimensional game pieces. */
export default function PillAvatar({
  styleId = "classic",
  color = "white",
  size = 72,
  className = "",
  expression,
  blink,
  animated,
  reducedMotion = false,
  jumping = false,
}: PillAvatarProps) {
  const id = useId().replace(/:/g, "");
  const element = useRef<SVGSVGElement>(null);
  const body = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  usePillJumps(jumping && !reducedMotion, element, body, shadow);
  const [idleFace, setIdleFace] = useState<AvatarFace>(quietFace);
  const animate =
    animated !== false && !reducedMotion && (size > 40 || animated === true);
  useEffect(() => {
    if (!animate || !element.current) return;
    const seed = avatarSeed(id);
    return subscribeAvatar({
      element: element.current,
      seed,
      state: createExpressionState(seed, performance.now()),
      visible: true,
      update: (face) =>
        setIdleFace((previous) =>
          previous.expression === face.expression &&
          previous.blink === face.blink
            ? previous
            : { expression: face.expression, blink: face.blink },
        ),
    });
  }, [animate, id]);
  const face = animate ? idleFace : quietFace;
  const { accessory, accent } = getCharacterStyle(styleId);
  const dark = color === "black";
  const faceFeatures = getFaceFeatures(
    expression ?? face.expression,
    blink ?? face.blink,
    dark,
  );
  const fill = `url(#pill-${id})`;
  const earFill = accessory === "fox" || accessory === "bear" ? accent : fill;
  return (
    <svg
      ref={element}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-pill-jump={jumping ? "enabled" : undefined}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
    >
      <defs>
        <radialGradient id={`pill-${id}`} cx="34%" cy="24%" r="76%">
          {dark ? (
            <>
              <stop stopColor="#666760" />
              <stop offset=".54" stopColor="#3d4039" />
              <stop offset=".86" stopColor="#2e332d" />
              <stop offset="1" stopColor="#42463a" />
            </>
          ) : (
            <>
              <stop stopColor="#fffdf7" />
              <stop offset=".54" stopColor="#faf5e9" />
              <stop offset=".86" stopColor="#e6ddca" />
              <stop offset="1" stopColor="#d2c6af" />
            </>
          )}
        </radialGradient>
        <radialGradient id={`shadow-${id}`}>
          <stop stopColor="#524a30" stopOpacity=".26" />
          <stop offset="1" stopColor="#524a30" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`leaf-${id}`} x2="1" y2="1">
          <stop stopColor="#a6c763" />
          <stop offset="1" stopColor="#669541" />
        </linearGradient>
      </defs>
      <ellipse
        ref={shadow}
        data-pill-shadow=""
        cx="51"
        cy="89"
        rx="40"
        ry="9"
        fill={`url(#shadow-${id})`}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <g
        ref={body}
        data-pill-body=""
        style={{ transformBox: "view-box", transformOrigin: "50px 89px" }}
      >
        {(accessory === "cat" || accessory === "fox") && (
          <g stroke={dark ? "#383d32" : "#d9cbb5"} strokeWidth="1">
            <path d="M18 38 Q11 5 36 24Z" fill={earFill} />
            <path d="M64 24 Q89 5 82 39Z" fill={earFill} />
            <path d="M20 29 L20 18 30 25Z" fill="#efb6a8" />
            <path d="M70 25 L81 18 80 30Z" fill="#efb6a8" />
          </g>
        )}
        {(accessory === "bear" || accessory === "panda") && (
          <g>
            <circle
              cx="23"
              cy="27"
              r="13"
              fill={accessory === "panda" ? "#45483f" : accent}
            />
            <circle
              cx="77"
              cy="27"
              r="13"
              fill={accessory === "panda" ? "#45483f" : accent}
            />
            <circle cx="23" cy="27" r="7" fill="#e4bea2" />
            <circle cx="77" cy="27" r="7" fill="#e4bea2" />
          </g>
        )}
        {accessory === "bunny" && (
          <g stroke="#ddcdbb" strokeWidth="1">
            <ellipse
              cx="33"
              cy="21"
              rx="10"
              ry="23"
              transform="rotate(-12 33 21)"
              fill={fill}
            />
            <ellipse
              cx="68"
              cy="21"
              rx="10"
              ry="23"
              transform="rotate(12 68 21)"
              fill={fill}
            />
            <ellipse
              cx="33"
              cy="18"
              rx="4"
              ry="15"
              transform="rotate(-12 33 18)"
              fill={accent}
            />
            <ellipse
              cx="68"
              cy="18"
              rx="4"
              ry="15"
              transform="rotate(12 68 18)"
              fill={accent}
            />
          </g>
        )}
        {accessory === "frog" && (
          <g>
            <circle cx="26" cy="25" r="12" fill={accent} />
            <circle cx="74" cy="25" r="12" fill={accent} />
            <circle cx="27" cy="24" r="4" fill="#394634" />
            <circle cx="73" cy="24" r="4" fill="#394634" />
            <circle cx="28" cy="22" r="1.5" fill="#fff8e7" />
            <circle cx="74" cy="22" r="1.5" fill="#fff8e7" />
          </g>
        )}
        <path
          d="M50 15 C73 15 89 34 89 57 C89 80 72 92 50 92 C27 92 11 80 11 57 C11 34 27 15 50 15Z"
          fill={fill}
          stroke={dark ? "#40453a" : "#ded4bf"}
          strokeWidth=".8"
        />
        <path
          d="M20 40 C24 26 36 19 47 19"
          fill="none"
          stroke={dark ? "#b4b5a6" : "#fffef8"}
          strokeOpacity={dark ? ".19" : ".8"}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {accessory === "panda" && (
          <g fill="#53534a" opacity={dark ? ".6" : "1"}>
            <ellipse
              cx="35"
              cy="54"
              rx="9"
              ry="11"
              transform="rotate(22 35 54)"
            />
            <ellipse
              cx="65"
              cy="54"
              rx="9"
              ry="11"
              transform="rotate(-22 65 54)"
            />
          </g>
        )}
        <g fill="#f0a48d" opacity=".95">
          <ellipse cx="26.5" cy="63" rx="6" ry="3.8" />
          <ellipse cx="73.5" cy="63" rx="6" ry="3.8" />
        </g>
        <g strokeLinecap="round" strokeLinejoin="round">
          {faceFeatures.map((feature, index) => (
            <path key={index} {...feature} />
          ))}
        </g>
        {accessory === "cat" && (
          <g
            fill="none"
            stroke={dark ? "#c8b99e" : "#a3947e"}
            strokeWidth="1"
            strokeLinecap="round"
            opacity=".65"
          >
            <path d="M18 57 L10 55 M18 63 L9 65 M82 57 L90 55 M82 63 L91 65" />
          </g>
        )}
        {accessory === "leaves" && (
          <g>
            <path
              d="M50 22 Q50 12 48 8"
              stroke="#6b9141"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M49 16 C33 17 29 8 30 2 C42 1 49 7 49 16Z"
              fill={`url(#leaf-${id})`}
            />
            <path
              d="M50 13 C50 1 61 -2 70 0 C69 12 60 16 50 13Z"
              fill={`url(#leaf-${id})`}
            />
            <path
              d="M35 6 L46 13 M64 4 L54 10"
              stroke="#729a46"
              strokeWidth="1"
            />
          </g>
        )}
        {accessory === "flower" && (
          <g transform="translate(72 24)">
            <g fill={accent}>
              <ellipse cy="-7" rx="5" ry="7" />
              <ellipse cy="7" rx="5" ry="7" />
              <ellipse cx="-7" rx="7" ry="5" />
              <ellipse cx="7" rx="7" ry="5" />
            </g>
            <circle r="4.5" fill="#f7d679" />
          </g>
        )}
        {accessory === "crown" && (
          <g transform="rotate(-8 50 18)">
            <path
              d="M33 20 L29 2 42 9 50 -2 58 9 71 2 67 20Z"
              fill="#efc34f"
              stroke="#d7a23c"
              strokeWidth="1"
            />
            <path d="M34 18 H66" stroke="#ffe08b" strokeWidth="3" />
            <circle cx="29" cy="2" r="3" fill="#f8d367" />
            <circle cx="50" cy="-2" r="3" fill="#f8d367" />
            <circle cx="71" cy="2" r="3" fill="#f8d367" />
          </g>
        )}
      </g>
    </svg>
  );
}

export { PillAvatar };
