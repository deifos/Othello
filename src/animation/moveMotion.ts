export const PLACEMENT_MS = 460;
export const FLIP_MS = 480;
export const CAPTURE_START_MS = 100;
export const CAPTURE_STEP_MS = 140;
export const MAX_STAGGER_MS = 63 * CAPTURE_STEP_MS;
export const MOVE_SETTLE_MS = CAPTURE_START_MS + MAX_STAGGER_MS + FLIP_MS;
export const CPU_THINK_MS = MOVE_SETTLE_MS + 100;

type Pose = {
  lift: number;
  depth: number;
  width: number;
  height: number;
  rotation: number;
};
type Stop = readonly [
  at: number,
  lift: number,
  depth: number,
  width: number,
  height: number,
];
const placement: readonly Stop[] = [
  [0, 0.6, -0.24, 0.84, 1.16],
  [0.32, 0, 0, 1.13, 0.76],
  [0.59, 0.15, -0.055, 0.97, 1.06],
  [0.82, 0, 0, 1.04, 0.93],
  [1, 0, 0, 1, 1],
];
const capture: readonly Stop[] = [
  [0, 0, 0, 1, 1],
  [0.12, 0, 0, 1.055, 0.86],
  [0.48, 0.38, -0.07, 0.98, 1.035],
  [0.76, 0.12, -0.025, 0.985, 1.035],
  [0.88, 0, 0, 1.07, 0.87],
  [1, 0, 0, 1, 1],
];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** One set of poses defines the soft landing and the continuous half turn. */
export function sampleMovePose(progress: number, placing: boolean): Pose {
  const p = clamp(progress);
  const stops = placing ? placement : capture;
  let last = stops[0];
  let next = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      last = stops[i - 1];
      next = stops[i];
      break;
    }
  }
  const eased = smooth(clamp((p - last[0]) / (next[0] - last[0])));
  const mix = (index: 1 | 2 | 3 | 4) =>
    last[index] + (next[index] - last[index]) * eased;
  return {
    lift: mix(1),
    depth: mix(2),
    width: mix(3),
    height: mix(4),
    rotation: placing ? 0 : Math.PI * smooth(clamp((p - 0.12) / 0.76)),
  };
}

/** Sort near to far, with a stable tile order for captures at the same distance. */
export function captureDelay(index: number, placedAt: number, captures?: readonly number[]) {
  const distance = (tile: number) => Math.max(
    Math.abs((tile % 8) - (placedAt % 8)),
    Math.abs(Math.floor(tile / 8) - Math.floor(placedAt / 8)),
  );
  const order = captures
    ? [...captures].sort((a, b) => distance(a) - distance(b) || a - b).indexOf(index)
    : distance(index) - 1;
  return CAPTURE_START_MS + Math.max(0, order) * CAPTURE_STEP_MS;
}

export function moveSettleMs(captureCount: number) {
  return Math.max(PLACEMENT_MS, CAPTURE_START_MS + Math.max(0, captureCount - 1) * CAPTURE_STEP_MS + FLIP_MS);
}

export function boardMoveSettleMs(before: readonly number[], after: readonly number[]) {
  return moveSettleMs(after.filter((value, index) => value && before[index] && value !== before[index]).length);
}
