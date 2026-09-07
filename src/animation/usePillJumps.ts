import { useEffect, type RefObject } from "react";
import { playGameSound } from "../lib/gameAudio";

type JumpSubscriber = {
  element: SVGSVGElement;
  body: SVGGElement;
  shadow: SVGEllipseElement;
  visible: boolean;
  nextAt: number;
  activeUntil: number;
  generation: number;
  animations: Animation[];
};

const subscribers = new Set<JumpSubscriber>();
const jumpDuration = 620;
let timer: ReturnType<typeof setTimeout> | undefined;
let visibilityObserver: IntersectionObserver | undefined;
let motionObserver: MutationObserver | undefined;
let motionQuery: MediaQueryList | undefined;
let paused = false;

function randomDelay(first = false) {
  return first ? 2000 + Math.random() * 4000 : 5000 + Math.random() * 7000;
}

function stopJump(subscriber: JumpSubscriber) {
  subscriber.generation += 1;
  for (const animation of subscriber.animations) animation.cancel();
  subscriber.animations = [];
  subscriber.activeUntil = 0;
  subscriber.element.dataset.jumping = "false";
}

function startJump(subscriber: JumpSubscriber, now: number, tapped = false) {
  playGameSound("jump");
  const generation = ++subscriber.generation;
  const duration = tapped ? 460 : jumpDuration;
  const lift = tapped ? 12 : 17;
  subscriber.activeUntil = now + duration;
  subscriber.nextAt = Infinity;
  subscriber.element.dataset.jumping = "true";
  const body = subscriber.body.animate(
    [
      { transform: "translateY(0) scale(1, 1)", offset: 0 },
      { transform: "translateY(1px) scale(1.045, .93)", offset: 0.14 },
      { transform: `translateY(-${lift}px) scale(.97, 1.035)`, offset: 0.45 },
      { transform: `translateY(-${lift}px) scale(1, 1)`, offset: 0.51 },
      { transform: "translateY(0) scale(1.05, .92)", offset: 0.82 },
      { transform: "translateY(0) scale(.99, 1.02)", offset: 0.94 },
      { transform: "translateY(0) scale(1, 1)", offset: 1 },
    ],
    { duration, easing: "ease-in-out" },
  );
  const shadow = subscriber.shadow.animate(
    [
      { transform: "scale(1)", opacity: 1, offset: 0 },
      { transform: "scale(1.03, 1)", opacity: 1, offset: 0.14 },
      { transform: "scale(.72, .8)", opacity: 0.48, offset: 0.45 },
      { transform: "scale(.72, .8)", opacity: 0.48, offset: 0.51 },
      { transform: "scale(1.05, 1)", opacity: 1, offset: 0.82 },
      { transform: "scale(1)", opacity: 1, offset: 1 },
    ],
    { duration, easing: "ease-in-out" },
  );
  subscriber.animations = [body, shadow];
  void body.finished.then(
    () => {
      if (!subscribers.has(subscriber) || subscriber.generation !== generation)
        return;
      stopJump(subscriber);
      subscriber.nextAt = performance.now() + randomDelay();
      scheduleJumps();
    },
    () => {},
  );
  // The body controls the shared lifecycle. Consume shadow cancellation too.
  void shadow.finished.catch(() => {});
}

/** A shared deadline timer wakes only when a visible pill is ready to jump. */
function scheduleJumps() {
  clearTimeout(timer);
  timer = undefined;
  if (paused) return;
  const now = performance.now();
  let active = 0;
  let availableAt = Infinity;
  for (const subscriber of subscribers) {
    if (subscriber.activeUntil) {
      active += 1;
      availableAt = Math.min(availableAt, subscriber.activeUntil);
    }
  }

  let nextAt = Infinity;
  for (const subscriber of subscribers) {
    if (!subscriber.visible || subscriber.activeUntil) continue;
    if (subscriber.nextAt <= now) {
      if (active < 2) {
        startJump(subscriber, now);
        active += 1;
        availableAt = Math.min(availableAt, subscriber.activeUntil);
      } else {
        // Stagger an overdue jump instead of starting a whole row at once.
        subscriber.nextAt = availableAt + 100 + Math.random() * 250;
      }
    }
    nextAt = Math.min(nextAt, subscriber.nextAt);
  }
  if (Number.isFinite(nextAt)) {
    timer = setTimeout(scheduleJumps, Math.max(50, nextAt - now));
  }
}

function refreshMotion() {
  const nextPaused =
    document.visibilityState === "hidden" ||
    !!motionQuery?.matches ||
    document.documentElement.dataset.motion === "reduced";
  if (paused !== nextPaused) {
    paused = nextPaused;
    const now = performance.now();
    for (const subscriber of subscribers) {
      stopJump(subscriber);
      subscriber.nextAt = now + randomDelay(true);
    }
  }
  scheduleJumps();
}

function observeJumps() {
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
      const now = performance.now();
      for (const entry of entries) {
        for (const subscriber of subscribers) {
          if (subscriber.element !== entry.target) continue;
          if (subscriber.visible !== entry.isIntersecting) {
            subscriber.visible = entry.isIntersecting;
            stopJump(subscriber);
            subscriber.nextAt = now + randomDelay(true);
          }
        }
      }
      scheduleJumps();
    });
  }
  refreshMotion();
}

export function usePillJumps(
  enabled: boolean,
  element: RefObject<SVGSVGElement | null>,
  body: RefObject<SVGGElement | null>,
  shadow: RefObject<SVGEllipseElement | null>,
) {
  useEffect(() => {
    if (
      !enabled ||
      !element.current ||
      !body.current ||
      !shadow.current ||
      typeof body.current.animate !== "function"
    )
      return;

    const subscriber: JumpSubscriber = {
      element: element.current,
      body: body.current,
      shadow: shadow.current,
      visible: typeof IntersectionObserver === "undefined",
      nextAt: performance.now() + randomDelay(true),
      activeUntil: 0,
      generation: 0,
      animations: [],
    };
    subscriber.element.dataset.jumping = "false";
    subscribers.add(subscriber);
    if (subscribers.size === 1) observeJumps();
    visibilityObserver?.observe(subscriber.element);
    scheduleJumps();

    // Use the existing selection button so pointer and keyboard activation
    // trigger the same hop without adding a nested interactive element.
    const trigger = subscriber.element.closest("button") ?? subscriber.element;
    const tap = () => {
      if (paused || !subscriber.visible || subscriber.activeUntil) return;
      startJump(subscriber, performance.now(), true);
      scheduleJumps();
    };
    trigger.addEventListener("click", tap);

    return () => {
      trigger.removeEventListener("click", tap);
      stopJump(subscriber);
      delete subscriber.element.dataset.jumping;
      subscribers.delete(subscriber);
      visibilityObserver?.unobserve(subscriber.element);
      if (subscribers.size === 0) {
        clearTimeout(timer);
        timer = undefined;
        visibilityObserver?.disconnect();
        visibilityObserver = undefined;
        motionObserver?.disconnect();
        motionObserver = undefined;
        motionQuery?.removeEventListener("change", refreshMotion);
        motionQuery = undefined;
        document.removeEventListener("visibilitychange", refreshMotion);
        paused = false;
      } else {
        scheduleJumps();
      }
    };
  }, [enabled, element, body, shadow]);
}
