import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import PillAvatar from "./PillAvatar";
import { playGameSound } from "../lib/gameAudio";
import { CAPTURE_START_MS, MAX_STAGGER_MS, FLIP_MS, PLACEMENT_MS, sampleMovePose } from "../animation/moveMotion";
import "./FallbackPill.css";

/** Omit change for a loaded board or undo. A new id starts one move only. */
export type FallbackPillChange = {
  id: string | number;
  from: number;
  delay: number;
};

export type FallbackPillProps = {
  value: number;
  styleId: string;
  fromStyleId?: string;
  reducedMotion?: boolean;
  change?: FallbackPillChange;
  hopRef?: Ref<FallbackPillHandle>;
  onHopChange?: (active: boolean) => void;
};

export type FallbackPillHandle = {
  hop: () => void;
  stopHop: () => void;
};

type MoveReaction = {
  id: string | number;
  from: number;
  to: number;
  landed: boolean;
};

type MotionSubscriber = {
  element: HTMLSpanElement;
  visible: boolean;
  stop: () => void;
};

const subscribers = new Set<MotionSubscriber>();
let visibilityObserver: IntersectionObserver | undefined;
let motionObserver: MutationObserver | undefined;
let motionQuery: MediaQueryList | undefined;

function motionPaused() {
  return (
    document.visibilityState === "hidden" ||
    !!motionQuery?.matches ||
    document.documentElement.dataset.motion === "reduced"
  );
}

function refreshMotion() {
  if (motionPaused()) for (const subscriber of subscribers) subscriber.stop();
}

/** Fallback pieces share observers. There is no permanent animation loop. */
function subscribeMotion(subscriber: MotionSubscriber) {
  subscribers.add(subscriber);
  if (subscribers.size === 1) {
    motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    motionQuery.addEventListener("change", refreshMotion);
    document.addEventListener("visibilitychange", refreshMotion);
    motionObserver = new MutationObserver(refreshMotion);
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    if (typeof IntersectionObserver !== "undefined") {
      visibilityObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          for (const item of subscribers) {
            if (item.element !== entry.target) continue;
            item.visible = entry.isIntersecting;
            if (!item.visible) item.stop();
          }
        }
      });
    }
  }
  visibilityObserver?.observe(subscriber.element);
  return () => {
    visibilityObserver?.unobserve(subscriber.element);
    subscribers.delete(subscriber);
    if (subscribers.size) return;
    visibilityObserver?.disconnect();
    visibilityObserver = undefined;
    motionObserver?.disconnect();
    motionObserver = undefined;
    motionQuery?.removeEventListener("change", refreshMotion);
    motionQuery = undefined;
    document.removeEventListener("visibilitychange", refreshMotion);
  };
}

const particleCount = 8;
const colorName = (value: number) => (value === 1 ? "black" : "white");

export default function FallbackPill({
  value,
  styleId,
  fromStyleId,
  reducedMotion = false,
  change,
  hopRef,
  onHopChange,
}: FallbackPillProps) {
  const host = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const hopBody = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const observer = useRef<MotionSubscriber | null>(null);
  const cancel = useRef<() => void>(() => {});
  const cancelHop = useRef<(update?: boolean) => void>(() => {});
  const hopping = useRef(false);
  const movingUntil = useRef(0);
  const hopChanged = useRef(onHopChange);
  hopChanged.current = onHopChange;
  const seenChange = useRef<string | number | undefined>(undefined);
  const [reaction, setReaction] = useState<MoveReaction>();
  const [hopHappy, setHopHappy] = useState(false);

  useImperativeHandle(hopRef, () => ({
    stopHop: () => cancelHop.current(),
    hop() {
      if (
        reducedMotion || motionPaused() || !observer.current?.visible ||
        hopping.current || performance.now() < movingUntil.current ||
        !host.current || !hopBody.current || !shadow.current ||
        typeof hopBody.current.animate !== "function"
      ) return;
      const root = host.current;
      const frames = Array.from({ length: 33 }, (_, index) => {
        const progress = index / 32;
        const pose = sampleMovePose(progress, false);
        return {
          offset: progress,
          transform: `translateY(${-pose.lift * 45}%) scale(${pose.width}, ${pose.height})`,
        };
      });
      const bodyAnimation = hopBody.current.animate(frames, {
        duration: 460, easing: "linear", fill: "none",
      });
      const shadowAnimation = shadow.current.animate(
        Array.from({ length: 33 }, (_, index) => {
          const progress = index / 32;
          const pose = sampleMovePose(progress, false);
          return {
            offset: progress,
            transform: `scale(${1 - pose.lift * 0.4})`,
            opacity: 0.8 - pose.lift * 0.55,
          };
        }),
        { duration: 460, easing: "linear", fill: "none" },
      );
      hopping.current = true;
      playGameSound("jump");
      root.dataset.hopping = "true";
      setHopHappy(true);
      hopChanged.current?.(true);
      const stop = (update = true) => {
        if (!hopping.current) return;
        hopping.current = false;
        root.dataset.hopping = "false";
        bodyAnimation.cancel();
        shadowAnimation.cancel();
        if (update) setHopHappy(false);
        hopChanged.current?.(false);
      };
      cancelHop.current = stop;
      void bodyAnimation.finished.then(() => stop()).catch(() => {});
      void shadowAnimation.finished.catch(() => {});
    },
  }));

  useLayoutEffect(() => {
    cancelHop.current();
  }, [value, styleId, fromStyleId, reducedMotion, change?.id]);

  useEffect(() => () => cancelHop.current(false), []);

  useEffect(() => {
    if (!host.current) return;
    const bounds = host.current.getBoundingClientRect();
    const subscriber: MotionSubscriber = {
      element: host.current,
      visible:
        bounds.bottom > 0 &&
        bounds.top < innerHeight &&
        bounds.right > 0 &&
        bounds.left < innerWidth,
      stop: () => {
        cancel.current();
        cancelHop.current();
      },
    };
    observer.current = subscriber;
    const unsubscribe = subscribeMotion(subscriber);
    return () => {
      unsubscribe();
      observer.current = null;
    };
  }, []);

  const changeId = change?.id;
  const from = change?.from;
  const requestedDelay = change?.delay;

  useEffect(() => {
    movingUntil.current = 0;
    setReaction(undefined);
    if (changeId === undefined || from === undefined) return;
    if (seenChange.current === changeId) return;
    if (
      reducedMotion ||
      motionPaused() ||
      !observer.current?.visible ||
      !host.current ||
      !body.current ||
      !shadow.current ||
      typeof body.current.animate !== "function" ||
      from === value
    ) {
      // A move received while motion is off is consumed, never replayed later.
      seenChange.current = changeId;
      return;
    }

    const root = host.current;
    const movingBody = body.current;
    const animations: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let active = true;
    // Mark a move consumed after its first frame. Strict Mode can then clean up
    // and re-run the initial effect without suppressing a newly placed pill.
    const firstFrame = requestAnimationFrame(() => {
      seenChange.current = changeId;
    });
    const stop = (update = true) => {
      active = false;
      movingUntil.current = 0;
      cancelAnimationFrame(firstFrame);
      for (const timer of timers) clearTimeout(timer);
      for (const animation of animations) animation.cancel();
      if (update) {
        seenChange.current = changeId;
        setReaction(undefined);
      }
    };
    cancel.current = stop;
    const delay = Number.isFinite(requestedDelay)
      ? Math.max(0, Math.min(requestedDelay!, CAPTURE_START_MS + MAX_STAGGER_MS))
      : 0;
    const capture = from !== 0;
    const duration = capture ? FLIP_MS : PLACEMENT_MS;
    movingUntil.current = performance.now() + delay + duration;
    setReaction({ id: changeId, from, to: value, landed: false });

    const animate = (
      element: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      const animation = element.animate(keyframes, options);
      animations.push(animation);
      // Cancellation is normal on undo, a new move, or a hidden board.
      void animation.finished.catch(() => {});
      return animation;
    };
    animate(
      movingBody,
      Array.from({ length: 41 }, (_, index) => {
        const progress = index / 40;
        const pose = sampleMovePose(progress, !capture);
        return {
          transform: `translateY(${-pose.lift * 85}%) rotateY(${pose.rotation}rad) scale(${pose.width}, ${pose.height})`,
          opacity: capture ? 1 : Math.min(1, progress * 10),
          offset: progress,
        };
      }),
      { duration, delay, easing: "linear", fill: "backwards" },
    );
    animate(
      shadow.current,
      Array.from({ length: 41 }, (_, index) => {
        const progress = index / 40;
        const pose = sampleMovePose(progress, !capture);
        return {
          transform: `scale(${1 - pose.lift * 0.65})`,
          opacity: 0.8 - pose.lift * 0.7,
          offset: progress,
        };
      }),
      { duration, delay, easing: "linear", fill: "backwards" },
    );

    timers.push(
      setTimeout(
        () => {
          if (!active) return;
          setReaction({ id: changeId, from, to: value, landed: true });
          const size = root.getBoundingClientRect().width;
          root
            .querySelectorAll<HTMLElement>(".fallback-pill__particle")
            .forEach((particle, index) => {
              const angle = (index / particleCount) * Math.PI * 2 - Math.PI / 2;
              const distance = size * (index % 2 ? 0.67 : 0.54);
              const x = Math.cos(angle) * distance;
              const y = Math.sin(angle) * distance * 0.7 - size * 0.24;
              const rotation = index % 2 ? 105 : -75;
              animate(
                particle,
                [
                  {
                    transform: "translate(0, 0) scale(.2)",
                    opacity: 0,
                    offset: 0,
                  },
                  {
                    transform: `translate(${x * 0.45}px, ${y * 0.55}px) rotate(${rotation * 0.4}deg) scale(1)`,
                    opacity: 1,
                    offset: 0.23,
                  },
                  {
                    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(.9)`,
                    opacity: 0.9,
                    offset: 0.64,
                  },
                  {
                    transform: `translate(${x * 1.12}px, ${y + size * 0.19}px) rotate(${rotation * 1.5}deg) scale(.25)`,
                    opacity: 0,
                    offset: 1,
                  },
                ],
                { duration: 600, easing: "ease-out", fill: "none" },
              );
            });
        },
        delay + duration * (capture ? 0.88 : 0.32),
      ),
      setTimeout(() => stop(), delay + duration + 1100),
    );
    return () => {
      stop(false);
      cancel.current = () => {};
    };
  }, [changeId, from, requestedDelay, value, styleId, fromStyleId, reducedMotion]);

  // A stale reaction must never show the wrong color after undo or restoration.
  const move =
    !reducedMotion && reaction?.id === changeId && reaction?.to === value
      ? reaction
      : undefined;
  const capturing = !!move?.from;

  return (
    <span ref={host} className="fallback-pill" aria-hidden="true">
      <span ref={shadow} className="fallback-pill__shadow" />
      <span ref={hopBody} className="fallback-pill__hop">
        <span
          ref={body}
          className="fallback-pill__body"
          style={{ transform: capturing ? "rotateY(180deg)" : undefined }}
        >
          <span className="fallback-pill__side">
            <PillAvatar
              styleId={capturing ? fromStyleId ?? styleId : styleId}
              color={colorName(capturing ? move!.from : value)}
              expression={
                hopHappy ? "grin" : capturing ? "sad" : move ? "grin" : undefined
              }
              blink={move || hopHappy ? "open" : undefined}
              reducedMotion={reducedMotion}
              animated={!move && !hopHappy}
            />
          </span>
          {capturing && (
            <span className="fallback-pill__side fallback-pill__side--back">
              <PillAvatar
                styleId={styleId}
                color={colorName(value)}
                expression={hopHappy || move!.landed ? "grin" : "surprised"}
                blink="open"
                animated={false}
                reducedMotion={reducedMotion}
              />
            </span>
          )}
        </span>
      </span>
      <span className="fallback-pill__particles">
        {Array.from({ length: particleCount }, (_, index) => (
          <span key={index} className="fallback-pill__particle">
            <svg viewBox="0 0 24 24" focusable="false">
              {index % 2 ? (
                <g fill={index % 4 === 1 ? "#ffc7a0" : "#ffd9ab"}>
                  <ellipse cx="12" cy="7" rx="4" ry="6" />
                  <ellipse cx="7" cy="13" rx="6" ry="4" />
                  <ellipse cx="16" cy="14" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="3" fill="#f8b957" />
                </g>
              ) : (
                <path
                  d="M12 1 15 9 23 12 15 15 12 23 9 15 1 12 9 9Z"
                  fill={index % 4 ? "#fff0ae" : "#ffd36a"}
                />
              )}
            </svg>
          </span>
        ))}
      </span>
    </span>
  );
}
