/** The signature capture finishes in one brief beat, even on a full board. */
export const FLIPPOCALYPSE_MS = 1150;
export const FLIPPOCALYPSE_CAPTURE_START_MS = 280;

export function enhancedCaptureDelay(index: number, placedAt: number, captures: readonly number[]) {
  const distance = (tile: number) => Math.max(Math.abs(tile % 8 - placedAt % 8), Math.abs(Math.floor(tile / 8) - Math.floor(placedAt / 8)));
  const order = [...captures].sort((a, b) => distance(a) - distance(b) || a - b).indexOf(index);
  return FLIPPOCALYPSE_CAPTURE_START_MS + Math.max(0, order) / Math.max(1, captures.length - 1) * 240;
}

/** Only a single new placement can launch the effect. Restore/Undo cannot. */
export function isFlippocalypseMove(before: readonly number[], after: readonly number[], mode?: string): boolean {
  if (mode !== "enhanced" || before.length !== 64 || after.length !== 64) return false;
  let added = 0;
  let captured = 0;
  for (let index = 0; index < 64; index++) {
    if (before[index] && !after[index]) return false;
    if (!before[index] && after[index]) added++;
    else if (before[index] && after[index] !== before[index]) captured++;
  }
  return added === 1 && captured >= 6;
}

export function sampleFlippocalypsePose(progress: number, attacker: boolean) {
  const p = Math.max(0, Math.min(1, progress));
  const entrance = Math.min(1, p / 0.2);
  const exit = Math.max(0, Math.min(1, (0.72 - p) / 0.24));
  const envelope = entrance * entrance * (3 - 2 * entrance) * exit * exit * (3 - 2 * exit);
  return attacker
    ? { scale: 1 + envelope * 0.9, lift: envelope * 0.26, depth: -envelope * 0.14 }
    : { scale: 1 + envelope * 0.16, lift: Math.sin(Math.min(1, p / 0.55) * Math.PI) * 0.22, depth: -envelope * 0.13 };
}
