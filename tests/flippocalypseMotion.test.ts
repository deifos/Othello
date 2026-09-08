import { describe, it, expect } from "vitest";
import { FLIP_MS } from "../src/animation/moveMotion";
import { FLIPPOCALYPSE_MS, enhancedCaptureDelay, isFlippocalypseMove, sampleFlippocalypsePose } from "../src/animation/flippocalypseMotion";

describe("Flippocalypse motion", () => {
  const before = Array.from({ length: 64 }, (_, index) => index >= 25 && index <= 30 ? 2 : index === 31 ? 1 : 0);
  const after = before.map((value, index) => index >= 24 && index <= 30 ? 1 : value);
  it("requires an Enhanced placement with six captures and ignores restore / undo", () => {
    expect(isFlippocalypseMove(before, after, "enhanced")).toBe(true);
    expect(isFlippocalypseMove(before, after, "classic")).toBe(false);
    expect(isFlippocalypseMove(after, before, "enhanced")).toBe(false);
    expect(isFlippocalypseMove(before, before, "enhanced")).toBe(false);
    expect(isFlippocalypseMove(before, after.map((value, index) => index === 25 ? 2 : value), "enhanced")).toBe(false);
    expect(isFlippocalypseMove(before, after.map((value, index) => index === 1 ? 1 : value), "enhanced")).toBe(false);
  });
  it("finishes every capture before the turn unlocks even on the largest board", () => {
    for (const captures of [[25, 26, 27, 28, 29, 30], Array.from({ length: 63 }, (_, index) => index + 1)]) {
      const delays = captures.map((index) => enhancedCaptureDelay(index, 0, captures));
      expect(Math.max(...delays) + FLIP_MS).toBeLessThan(FLIPPOCALYPSE_MS);
      expect(new Set(delays).size).toBe(captures.length);
    }
  });
  it("enlarges the attacker briefly and restores exact size without a jump", () => {
    for (const attacker of [true, false]) {
      expect(sampleFlippocalypsePose(0, attacker)).toEqual({ scale: 1, lift: 0, depth: -0 });
      const pose = sampleFlippocalypsePose(1, attacker);
      expect(pose.scale).toBe(1);
      expect(Math.abs(pose.lift)).toBeLessThan(1e-10);
      expect(pose.depth).toBe(-0);
      for (let step = 0; step <= 100; step++) {
        const current = sampleFlippocalypsePose(step / 100, attacker);
        expect(current.scale).toBeGreaterThanOrEqual(1);
        expect(current.scale).toBeLessThanOrEqual(1.9);
      }
    }
    expect(sampleFlippocalypsePose(.3, true).scale).toBeGreaterThan(1.8);
  });
});
