import { describe, expect, it } from "vitest";
import {
  captureDelay,
  CPU_THINK_MS,
  FLIP_MS,
  MOVE_SETTLE_MS,
  sampleMovePose,
  moveSettleMs,
  CAPTURE_STEP_MS,
} from "../src/animation/moveMotion";

describe("move motion contract", () => {
  it("starts every captured pill in sequence, including equal-distance tiles", () => {
    const captures = [43, 28, 19, 35, 29];
    const delays = captures.map(index => captureDelay(index, 27, captures)).sort((a, b) => a - b);
    for (let i = 1; i < delays.length; i++) expect(delays[i] - delays[i - 1]).toBe(CAPTURE_STEP_MS);
    expect(captureDelay(28, 27, captures)).toBeLessThan(captureDelay(29, 27, captures));
    expect(delays.at(-1)! + FLIP_MS).toBe(moveSettleMs(captures.length));
    expect(moveSettleMs(1)).toBeLessThan(moveSettleMs(5));
  });
  it("lands at its original position and size", () => {
    for (const placing of [true, false]) {
      const pose = sampleMovePose(1, placing);
      expect(pose).toMatchObject({ lift: 0, depth: 0, width: 1, height: 1 });
      expect(pose.rotation).toBe(placing ? 0 : Math.PI);
    }
  });
  it("turns continuously through the edge with no midpoint angle jump", () => {
    const before = sampleMovePose(0.499, false).rotation;
    const after = sampleMovePose(0.501, false).rotation;
    expect(before).toBeLessThan(Math.PI / 2);
    expect(after).toBeGreaterThan(Math.PI / 2);
    expect(after - before).toBeLessThan(0.02);
    let previous = 0;
    for (let step = 0; step <= 100; step++) {
      const pose = sampleMovePose(step / 100, false);
      expect(pose.rotation).toBeGreaterThanOrEqual(previous);
      expect(pose.width).toBeGreaterThan(0);
      expect(pose.height).toBeGreaterThan(0);
      previous = pose.rotation;
    }
  });
  it("settles the furthest capture before the CPU can reply", () => {
    for (let placed = 0; placed < 64; placed++)
      for (let captured = 0; captured < 64; captured++) {
        expect(captureDelay(captured, placed) + FLIP_MS).toBeLessThanOrEqual(
          MOVE_SETTLE_MS,
        );
      }
    expect(CPU_THINK_MS).toBeGreaterThan(MOVE_SETTLE_MS);
  });
  it("squashes at contact and makes one small rebound", () => {
    expect(sampleMovePose(0.32, true).width).toBeGreaterThan(1);
    expect(sampleMovePose(0.32, true).height).toBeLessThan(1);
    expect(sampleMovePose(0.59, true).lift).toBeGreaterThan(0);
    expect(sampleMovePose(0.82, true).lift).toBe(0);
  });
});
