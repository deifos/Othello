import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createUISFX } = vi.hoisted(() => ({ createUISFX: vi.fn() }));
vi.mock("uisfx", () => ({ createUISFX }));

class AudioDocument extends EventTarget {
  hidden = false;

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function mockPlayer() {
  return {
    unlock: vi.fn().mockResolvedValue(true),
    preload: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    stopAll: vi.fn(),
    setPack: vi.fn(),
    setEnabled: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe("game audio lifecycle", () => {
  let audio: typeof import("../src/lib/gameAudio");
  let player: ReturnType<typeof mockPlayer>;
  let page: AudioDocument;
  let stop: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    createUISFX.mockReset();
    player = mockPlayer();
    createUISFX.mockReturnValue(player);
    page = new AudioDocument();
    vi.spyOn(page, "addEventListener");
    vi.stubGlobal("document", page);
    audio = await import("../src/lib/gameAudio");
    stop = audio.startGameAudio();
  });

  afterEach(() => {
    stop?.();
    vi.unstubAllGlobals();
  });

  it("creates no player until unlock and starts with Zen selected", async () => {
    audio.playGameSound("place");
    page.dispatchEvent(new Event("pointerdown"));
    expect(createUISFX).not.toHaveBeenCalled();

    expect(await audio.unlockGameAudio()).toBe(true);
    expect(createUISFX).toHaveBeenCalledOnce();
    expect(createUISFX).toHaveBeenCalledWith(expect.objectContaining({ pack: "zen", enabled: true }));
    audio.playGameSound("place");
    expect(player.play).toHaveBeenCalledOnce();
  });

  it("mute blocks previews and cancels a sound waiting for unlock", async () => {
    const pending = deferred<boolean>();
    player.unlock.mockReturnValueOnce(pending.promise);
    const unlocked = audio.unlockGameAudio();
    audio.playGameSound("place");
    audio.configureGameAudio(false, "dreamy");
    audio.previewGameSound("zen");
    audio.playGameSound("jump");
    pending.resolve(true);
    await unlocked;

    expect(player.play).not.toHaveBeenCalled();
    expect(player.unlock).toHaveBeenCalledOnce();
    expect(player.setEnabled).toHaveBeenLastCalledWith(false);
    expect(player.stopAll).toHaveBeenCalled();
    audio.configureGameAudio(true, "dreamy");
    await Promise.resolve();
    expect(player.play).not.toHaveBeenCalled();
    audio.playGameSound("jump");
    expect(player.play).toHaveBeenCalledOnce();
  });

  it("restores the selected style after a preview of the other style", async () => {
    await audio.unlockGameAudio();
    audio.previewGameSound("dreamy");

    expect(player.setPack.mock.calls).toEqual([["dreamy"], ["zen"]]);
    expect(player.setPack.mock.invocationCallOrder[0]).toBeLessThan(player.play.mock.invocationCallOrder[0]);
    expect(player.play.mock.invocationCallOrder[0]).toBeLessThan(player.setPack.mock.invocationCallOrder[1]);
    audio.playGameSound("place");
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(player.setPack).toHaveBeenLastCalledWith("zen");
  });

  it("stops voices and pending preload work while the page is hidden", async () => {
    await audio.unlockGameAudio();
    const preloadSignal = player.preload.mock.calls[0][1].signal as AbortSignal;
    audio.playGameSound("place");
    page.setHidden(true);

    expect(preloadSignal.aborted).toBe(true);
    expect(player.stopAll).toHaveBeenCalledOnce();
    audio.playGameSound("jump");
    audio.previewGameSound("zen");
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.unlock).toHaveBeenCalledOnce();
    page.setHidden(false);
    audio.playGameSound("jump");
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it("discards an old unlock and queued sound after unmount", async () => {
    const pending = deferred<boolean>();
    player.unlock.mockReturnValueOnce(pending.promise);
    const oldUnlock = audio.unlockGameAudio();
    audio.playGameSound("place");
    stop?.();
    stop = undefined;
    expect(player.destroy).toHaveBeenCalledOnce();

    const nextPlayer = mockPlayer();
    createUISFX.mockReturnValue(nextPlayer);
    stop = audio.startGameAudio();
    expect(await audio.unlockGameAudio()).toBe(true);
    pending.resolve(true);
    expect(await oldUnlock).toBe(false);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.preload).not.toHaveBeenCalled();
    audio.playGameSound("place");
    expect(nextPlayer.play).toHaveBeenCalledOnce();
  });

  it("allows another unlock after blocked audio and contains playback failures", async () => {
    player.unlock.mockRejectedValueOnce(new Error("Audio is blocked"));
    expect(await audio.unlockGameAudio()).toBe(false);
    audio.playGameSound("place");
    expect(player.play).not.toHaveBeenCalled();
    expect(await audio.unlockGameAudio()).toBe(true);

    player.play.mockImplementation(() => { throw new Error("Audio device unavailable"); });
    expect(() => audio.playGameSound("jump")).not.toThrow();
    expect(() => audio.previewGameSound("dreamy")).not.toThrow();
    expect(player.setPack).toHaveBeenLastCalledWith("zen");
  });

  it("contains player failures during preview restoration and page hiding", async () => {
    await audio.unlockGameAudio();
    player.setPack.mockImplementation((pack: string) => {
      if (pack === "zen") throw new Error("Player is no longer available");
    });
    expect(() => audio.previewGameSound("dreamy")).not.toThrow();

    player.stopAll.mockImplementation(() => { throw new Error("Player is no longer available"); });
    const visibility = vi.mocked(page.addEventListener).mock.calls.find(([type]) => type === "visibilitychange")?.[1] as EventListener;
    page.hidden = true;
    expect(() => visibility(new Event("visibilitychange"))).not.toThrow();
  });
});
