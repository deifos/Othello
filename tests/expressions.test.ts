import { describe, expect, it, vi } from "vitest";
import {
  advanceExpression,
  createExpressionState,
  reactExpression,
} from "../src/animation/expressions";

describe("pill expression timing", () => {
  it("closes and opens the eyes through a short, natural blink", () => {
    const initial = createExpressionState(19, 1000);
    const start = initial.blinkAt;
    let state = advanceExpression(initial, start);
    expect(state.blink).toBe("half");
    state = advanceExpression(state, start + 40);
    expect(state.blink).toBe("closed");
    state = advanceExpression(state, start + 119);
    expect(state.blink).toBe("closed");
    state = advanceExpression(state, start + 120);
    expect(state.blink).toBe("half");
    state = advanceExpression(state, start + 160);
    expect(state.blink).toBe("open");
    expect(state.blinkAt).toBeGreaterThanOrEqual(start + 3160);
    expect(state.blinkAt).toBeLessThan(start + 6160);
    expect(initial.blink).toBe("open");
  });

  it("spreads initial blinks and faces across pills with separate seeds", () => {
    const states = Array.from({ length: 64 }, (_, seed) =>
      createExpressionState(seed, 0),
    );
    expect(new Set(states.map((state) => state.blinkAt)).size).toBe(64);
    expect(new Set(states.map((state) => state.idleAt)).size).toBe(64);
    expect(
      Math.max(...states.map((state) => state.blinkAt)) -
        Math.min(...states.map((state) => state.blinkAt)),
    ).toBeGreaterThan(2500);
    for (const state of states) {
      expect(state.blinkAt).toBeGreaterThanOrEqual(3000);
      expect(state.blinkAt).toBeLessThan(6000);
      expect(state.idleAt).toBeGreaterThanOrEqual(4000);
      expect(state.idleAt).toBeLessThan(9000);
    }
  });

  it("uses friendly varied idle faces without repeating the current face", () => {
    let state = createExpressionState(41, 0);
    const counts = new Map<string, number>();
    for (let index = 0; index < 500; index++) {
      const previous = state.expression;
      const now = state.idleAt;
      state = advanceExpression(state, now);
      expect(state.expression).not.toBe(previous);
      expect(["sad", "surprised"]).not.toContain(state.expression);
      expect(state.idleAt - now).toBeGreaterThanOrEqual(4000);
      expect(state.idleAt - now).toBeLessThan(9000);
      counts.set(state.expression, (counts.get(state.expression) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([
      "curious",
      "grin",
      "happy",
      "sleepy",
      "smile",
      "wink",
    ]);
    expect(
      (counts.get("happy") ?? 0) + (counts.get("smile") ?? 0),
    ).toBeGreaterThan(230);
  });

  it("gives reactions priority, cancels a blink, and resets idle timers on expiry", () => {
    const initial = createExpressionState(20, 0);
    const blinking = advanceExpression(initial, initial.blinkAt + 40);
    expect(blinking.blink).toBe("closed");
    const now = initial.blinkAt + 45;
    const sad = reactExpression(blinking, "sad", 600, now);
    expect(sad.expression).toBe("sad");
    expect(sad.blink).toBe("open");
    expect(advanceExpression(sad, now + 599)).toBe(sad);
    const recovered = advanceExpression(sad, now + 600);
    expect(recovered.expression).toBe("happy");
    expect(recovered.blink).toBe("open");
    expect(recovered.reactionUntil).toBeNull();
    expect(recovered.blinkAt).toBeGreaterThanOrEqual(now + 3600);
    expect(recovered.idleAt).toBeGreaterThanOrEqual(now + 4600);
    expect(sad.expression).toBe("sad");
  });

  it("replaces an active reaction when a new gameplay event arrives", () => {
    const initial = createExpressionState(8, 0);
    const sad = reactExpression(initial, "sad", 900, 100);
    const happy = reactExpression(sad, "happy", 500, 400);
    expect(happy.expression).toBe("happy");
    expect(happy.nextAt).toBe(900);
    expect(advanceExpression(happy, 899)).toBe(happy);
    expect(advanceExpression(happy, 900).reactionUntil).toBeNull();
  });

  it("skips missed animation cycles after a long clock jump", () => {
    const initial = createExpressionState(91, 0);
    const now = 10 * 24 * 60 * 60 * 1000;
    const result = advanceExpression(initial, now);
    expect(result.blink).toBe("open");
    expect(result.nextAt).toBeGreaterThan(now);
    expect(result.blinkAt - now).toBeLessThan(6000);
    expect(result.idleAt - now).toBeLessThan(9000);
    const reaction = reactExpression(initial, "surprised", 700, 50);
    const recovered = advanceExpression(reaction, now);
    expect(recovered.expression).toBe("happy");
    expect(recovered.nextAt).toBeGreaterThan(now);
  });

  it("always gives the renderer a future deadline at a due tick", () => {
    let state = createExpressionState(56, 0);
    for (let index = 0; index < 1000; index++) {
      const now = state.nextAt;
      state = advanceExpression(state, now);
      expect(state.nextAt).toBeGreaterThan(now);
    }
  });

  it("does not allocate or change a face before a visible change is due", () => {
    const state = createExpressionState(16, 0);
    expect(advanceExpression(state, state.nextAt - 1)).toBe(state);
  });

  it("is deterministic and does not read or modify the global random generator", () => {
    const globalRandom = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Animation must not consume global randomness");
    });
    try {
      let first = createExpressionState(77, 100);
      let second = createExpressionState(77, 100);
      for (let index = 0; index < 80; index++) {
        first = advanceExpression(first, first.nextAt);
        // Advance a third pill between updates; it cannot change either stream.
        const other = createExpressionState(index, 0);
        advanceExpression(other, 80000);
        second = advanceExpression(second, second.nextAt);
        expect(first).toEqual(second);
      }
      expect(globalRandom).not.toHaveBeenCalled();
      expect(Math.random).toBe(globalRandom);
    } finally {
      globalRandom.mockRestore();
    }
  });
});
