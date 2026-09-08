import type { SoundStyle } from "./gameAudio";

export const FIRE_SOUND_SECONDS = 1.04;
const buffers = new WeakMap<BaseAudioContext, Map<SoundStyle, AudioBuffer>>();

/** A soft rush of warm air, with short wood crackles inside the same envelope. */
export function renderFireSound(style: SoundStyle, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.ceil(sampleRate * FIRE_SOUND_SECONDS));
  const dreamy = style === "dreamy";
  let randomState = dreamy ? 0x72b305e1 : 0x138dc421;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x100000000;
  };
  const crackles = Array.from({ length: dreamy ? 14 : 19 }, () => ({
    start: 0.13 + random() * 0.65,
    length: 0.008 + random() * 0.016,
    strength: 0.10 + random() * 0.12,
  }));
  const crackleNoise = new Float32Array(samples.length);
  for (const ember of crackles) {
    const start = Math.floor(ember.start * sampleRate);
    const length = Math.ceil(ember.length * sampleRate);
    for (let offset = 0; offset < length; offset += 1) {
      const shape = Math.sin(Math.PI * offset / length);
      crackleNoise[start + offset] += (random() * 2 - 1) * shape * shape * ember.strength;
    }
  }
  let warmNoise = 0;
  let airNoise = 0;
  let previousCrackle = 0;
  const warmCoefficient = 1 - Math.exp(-2 * Math.PI * 440 / sampleRate);
  const airCoefficient = 1 - Math.exp(-2 * Math.PI * (dreamy ? 3000 : 2200) / sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const progress = time / FIRE_SOUND_SECONDS;
    const noise = random() * 2 - 1;
    // Fixed time constants keep the timbre stable across device sample rates.
    warmNoise += warmCoefficient * (noise - warmNoise);
    airNoise += airCoefficient * (noise - airNoise);
    const swell = Math.sin(Math.PI * progress) ** 1.6;
    const attack = Math.min(1, time / 0.085);
    const flutter = 0.86 + 0.09 * Math.sin(time * 43) + 0.05 * Math.sin(time * 79);
    const sweep = (warmNoise * 0.87 + (airNoise - warmNoise) * (dreamy ? 0.32 : 0.23)) * swell * attack * flutter;
    previousCrackle += 0.35 * (crackleNoise[index] - previousCrackle);
    const fade = Math.min(1, (FIRE_SOUND_SECONDS - time) / 0.12);
    // Soft saturation bounds overlapping crackles without a sharp limiter edge.
    samples[index] = Math.tanh((sweep + previousCrackle * fade) * 1.65) * 0.27;
  }
  return samples;
}

/** Returns an idempotent stop function. One source holds the complete effect. */
export function createFireVoice(context: AudioContext, style: SoundStyle): (() => void) | undefined {
  if (context.state !== "running") return;
  let source: AudioBufferSourceNode | undefined;
  let gain: GainNode | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (source) source.onended = null;
    try { source?.stop(); } catch { /* The source may already have ended. */ }
    try { source?.disconnect(); } catch { /* A closed device is harmless. */ }
    try { gain?.disconnect(); } catch { /* A closed device is harmless. */ }
  };
  try {
    let cache = buffers.get(context);
    if (!cache) {
      cache = new Map();
      buffers.set(context, cache);
    }
    let buffer = cache.get(style);
    if (!buffer) {
      const samples = renderFireSound(style, context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      cache.set(style, buffer);
    }
    source = context.createBufferSource();
    gain = context.createGain();
    gain.gain.value = 0.65;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = stop;
    source.start();
    return stop;
  } catch {
    stop();
    return undefined;
  }
}
