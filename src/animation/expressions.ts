import type { BlinkPhase, Expression } from "../styles/expressions";

/** All times and durations are in milliseconds, from the same monotonic clock. */
export interface ExpressionState {
  readonly expression: Expression;
  readonly blink: BlinkPhase;
  readonly nextAt: number;
  readonly idleAt: number;
  /** The scheduled start of the next blink, or the start of a blink in progress. */
  readonly blinkAt: number;
  readonly reactionUntil: number | null;
  readonly randomState: number;
}

const IDLE_EXPRESSIONS: ReadonlyArray<readonly [Expression, number]> = [
  ["happy", 30],
  ["smile", 28],
  ["grin", 15],
  ["wink", 8],
  ["curious", 12],
  ["sleepy", 7],
];

// Each pill has its own random stream. Animation never consumes game randomness.
function random(randomState: number): [number, number] {
  const next = (randomState + 0x6d2b79f5) >>> 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [next, ((value ^ (value >>> 14)) >>> 0) / 4294967296];
}

function scheduleIdle(randomState: number, now: number): ExpressionState {
  const [afterBlink, blinkRandom] = random(randomState);
  const [afterIdle, idleRandom] = random(afterBlink);
  const blinkAt = now + 3000 + blinkRandom * 3000;
  const idleAt = now + 4000 + idleRandom * 5000;
  return {
    expression: "happy",
    blink: "open",
    nextAt: Math.min(blinkAt, idleAt),
    blinkAt,
    idleAt,
    reactionUntil: null,
    randomState: afterIdle,
  };
}

export function createExpressionState(
  seed: number,
  now: number,
): ExpressionState {
  return scheduleIdle(seed >>> 0, now);
}

function pickIdleExpression(current: Expression, value: number): Expression {
  const total = IDLE_EXPRESSIONS.reduce(
    (sum, [expression, weight]) => sum + (expression === current ? 0 : weight),
    0,
  );
  let target = value * total;
  for (const [expression, weight] of IDLE_EXPRESSIONS) {
    if (expression === current) continue;
    target -= weight;
    if (target < 0) return expression;
  }
  return current === "happy" ? "smile" : "happy";
}

/** Advance only due changes. A hidden tab skips old events instead of replaying them. */
export function advanceExpression(
  state: ExpressionState,
  now: number,
): ExpressionState {
  if (now < state.nextAt) return state;
  if (state.reactionUntil !== null) return scheduleIdle(state.randomState, now);

  let { expression, idleAt, blinkAt, randomState } = state;
  if (now >= idleAt) {
    const [afterFace, faceRandom] = random(randomState);
    const [afterTimer, timerRandom] = random(afterFace);
    expression = pickIdleExpression(expression, faceRandom);
    idleAt = now + 4000 + timerRandom * 5000;
    randomState = afterTimer;
  }

  let blink: BlinkPhase = "open";
  let nextBlinkAt = blinkAt;
  const elapsed = now - blinkAt;
  if (elapsed >= 160) {
    const [nextRandom, timerRandom] = random(randomState);
    randomState = nextRandom;
    blinkAt = now + 3000 + timerRandom * 3000;
    nextBlinkAt = blinkAt;
  } else if (elapsed >= 120) {
    blink = "half";
    nextBlinkAt = blinkAt + 160;
  } else if (elapsed >= 40) {
    blink = "closed";
    nextBlinkAt = blinkAt + 120;
  } else if (elapsed >= 0) {
    blink = "half";
    nextBlinkAt = blinkAt + 40;
  }

  return {
    expression,
    blink,
    nextAt: Math.min(idleAt, nextBlinkAt),
    idleAt,
    blinkAt,
    reactionUntil: null,
    randomState,
  };
}

/** Gameplay reactions take priority and keep the eyes open until they expire. */
export function reactExpression(
  state: ExpressionState,
  expression: Expression,
  duration: number,
  now: number,
): ExpressionState {
  if (!(duration > 0) || !Number.isFinite(duration)) {
    return scheduleIdle(state.randomState, now);
  }
  const reactionUntil = now + duration;
  return {
    ...state,
    expression,
    blink: "open",
    nextAt: reactionUntil,
    idleAt: Infinity,
    blinkAt: Infinity,
    reactionUntil,
  };
}
