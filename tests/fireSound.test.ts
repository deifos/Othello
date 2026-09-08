import { describe, expect, it, vi } from "vitest";
import { createFireVoice, renderFireSound } from "../src/lib/fireSound";

function mockContext(state = "running") {
  const sources: Array<{ onended: (() => void) | null; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }> = [];
  const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state,
    sampleRate: 48000,
    destination: {},
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: vi.fn(() => {
      const source = { buffer: null, onended: null as (() => void) | null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
      sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => gain),
  };
  return { context: context as unknown as AudioContext, raw: context, sources, gain };
}

describe("fire sweep sound", () => {
  it.each(["zen", "dreamy"] as const)("renders a quiet, bounded %s effect with soft edges", (style) => {
    const sampleRate = 48000;
    const sound = renderFireSound(style, sampleRate);
    expect(sound.length / sampleRate).toBeGreaterThanOrEqual(0.9);
    expect(sound.length / sampleRate).toBeLessThanOrEqual(1.1);
    let peak = 0;
    let energy = 0;
    expect(sound.every(Number.isFinite)).toBe(true);
    for (const sample of sound) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    expect(peak).toBeLessThan(0.28);
    expect(peak).toBeGreaterThan(0.025);
    expect(Math.sqrt(energy / sound.length)).toBeGreaterThan(0.01);
    expect(Math.abs(sound[0])).toBeLessThan(0.0001);
    expect(Math.abs(sound[sound.length - 1])).toBeLessThan(0.0001);
  });

  it("gives Zen and Dreamy different fire textures", () => {
    expect(renderFireSound("zen", 24000)).not.toEqual(renderFireSound("dreamy", 24000));
  });

  it("uses one source and caches the sound; natural completion releases all nodes", () => {
    const { context, raw, sources, gain } = mockContext();
    const stop = createFireVoice(context, "zen");
    expect(raw.createBufferSource).toHaveBeenCalledOnce();
    expect(sources[0].start).toHaveBeenCalledOnce();
    sources[0].onended?.();
    stop?.();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    const stopNext = createFireVoice(context, "zen");
    expect(raw.createBuffer).toHaveBeenCalledOnce();
    stopNext?.();
  });

  it("never schedules sound on a suspended context and contains device failures", () => {
    const suspended = mockContext("suspended");
    expect(createFireVoice(suspended.context, "zen")).toBeUndefined();
    expect(suspended.raw.createBuffer).not.toHaveBeenCalled();
    const broken = mockContext();
    broken.raw.createGain.mockImplementation(() => { throw new Error("Audio output removed"); });
    expect(() => createFireVoice(broken.context, "dreamy")).not.toThrow();
    expect(broken.sources[0].disconnect).toHaveBeenCalledOnce();
  });
});
