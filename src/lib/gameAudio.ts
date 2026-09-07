import { createUISFX, type CueName, type UISFXPlayer } from "uisfx";

export type SoundStyle = "dreamy" | "zen";
export const isSoundStyle = (value: unknown): value is SoundStyle =>
  value === "dreamy" || value === "zen";

const cues = {
  place: "drop",
  flip: "reorder",
  select: "select",
  jump: "release",
  undo: "undo",
  start: "start",
  win: "success",
  draw: "complete",
  loss: "info",
  open: "open",
  close: "close",
  back: "back",
  toggleOn: "toggle-on",
  success: "success",
  flowers: "reward",
  bubble: "expand",
  pop: "snap",
} satisfies Record<string, CueName>;
type GameSound = keyof typeof cues;

let player: UISFXPlayer | undefined;
let enabled = true;
let style: SoundStyle = "zen";
let ready = false;
let unlocking: Promise<boolean> | undefined;
let generation = 0;
let request = 0;
let warming: AbortController | undefined;

function audible() {
  return enabled && typeof document !== "undefined" && !document.hidden;
}

function warmCommonSounds() {
  warming?.abort();
  if (!player || !ready || !audible()) return;
  warming = new AbortController();
  void player.preload(["drop", "release", "select"], {
    signal: warming.signal,
  }).catch(() => {});
}

/** Called from a trusted pointer or keyboard action, never from page load. */
export function unlockGameAudio(): Promise<boolean> {
  if (!audible()) return Promise.resolve(false);
  if (unlocking) return unlocking;
  try {
    player ??= createUISFX({ pack: style, enabled, volume: 0.65, maxVoices: 4 });
    const current = player;
    unlocking = current.unlock().then((unlocked) => {
      if (player !== current) return false;
      const firstUnlock = !ready;
      ready = unlocked;
      if (ready && firstUnlock) warmCommonSounds();
      return ready;
    }).catch(() => false).finally(() => {
      if (player === current) unlocking = undefined;
    });
    return unlocking;
  } catch {
    return Promise.resolve(false);
  }
}

/** App preferences are the only store; UI SFX does not create a second store. */
export function configureGameAudio(nextEnabled: boolean, nextStyle: SoundStyle) {
  if (enabled === nextEnabled && style === nextStyle) return;
  enabled = nextEnabled;
  style = nextStyle;
  generation += 1;
  warming?.abort();
  try {
    player?.stopAll();
    player?.setPack(style);
    player?.setEnabled(enabled);
    warmCommonSounds();
  } catch {
    // Audio must never interrupt a move or a preference change.
  }
}

function play(cue: CueName, previewStyle?: SoundStyle) {
  if (!audible() || !player) return;
  const current = player;
  const token = ++request;
  const version = generation;
  const requestedAt = performance.now();
  const fire = () => {
    if (
      player !== current || !audible() || !ready || version !== generation ||
      token !== request || performance.now() - requestedAt > 250
    ) return;
    try {
      if (previewStyle) {
        current.stopAll();
        current.setPack(previewStyle);
      }
      current.play(cue, { cooldownMs: cue === "release" ? 250 : 90, retrigger: "restart" });
    } catch {
      // Unsupported or blocked audio leaves the visual feedback intact.
    } finally {
      try {
        if (previewStyle) current.setPack(style);
      } catch {
        // A failed preview must not escape into a button event.
      }
    }
  };
  if (ready) fire();
  else void unlocking?.then(fire);
}

export function playGameSound(event: GameSound) {
  play(cues[event]);
}

/** A preview never changes the selected style or turns muted sound back on. */
export function previewGameSound(previewStyle: SoundStyle) {
  if (!audible()) return;
  void unlockGameAudio();
  play("success", previewStyle);
}

export function startGameAudio() {
  const gesture = (event: Event) => {
    if (event.isTrusted) void unlockGameAudio();
  };
  const visibility = () => {
    if (!document.hidden) return;
    generation += 1;
    warming?.abort();
    try { player?.stopAll(); } catch { /* Audio is optional. */ }
  };
  document.addEventListener("pointerdown", gesture, true);
  document.addEventListener("keydown", gesture, true);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    document.removeEventListener("pointerdown", gesture, true);
    document.removeEventListener("keydown", gesture, true);
    document.removeEventListener("visibilitychange", visibility);
    generation += 1;
    warming?.abort();
    const previous = player;
    player = undefined;
    ready = false;
    unlocking = undefined;
    try { void previous?.destroy().catch(() => {}); } catch { /* Audio is optional. */ }
  };
}
