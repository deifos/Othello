import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayer, type MusicOptions } from "../src/lib/music";

class MusicDocument extends EventTarget {
  hidden = false;

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("background music lifecycle", () => {
  let page: MusicDocument;
  let player: MusicPlayer;
  let stop: () => void;
  let options: MusicOptions;
  let elements: TestAudio[];
  let queuedPlays: Promise<void>[];

  class TestAudio extends EventTarget {
    private source = "";
    preload = "auto";
    paused = true;
    volume = 1;
    currentTime = 0;
    play = vi.fn(() => {
      this.paused = false;
      return queuedPlays.shift() ?? Promise.resolve();
    });
    pause = vi.fn(() => { this.paused = true; });
    load = vi.fn();
    removeAttribute = vi.fn((name: string) => {
      if (name === "src") this.source = "";
    });

    constructor() {
      super();
      elements.push(this);
    }

    get src() { return this.source; }
    set src(value: string) {
      this.source = value;
      this.currentTime = 0;
      this.paused = true;
    }

    finish() {
      this.paused = true;
      this.dispatchEvent(new Event("ended"));
    }
  }

  function configure(changes: Partial<MusicOptions>) {
    options = { ...options, ...changes };
    player.configure(options);
  }

  async function settle(milliseconds = 1000) {
    await vi.advanceTimersByTimeAsync(milliseconds);
  }

  function trustedGesture(type = "pointerdown") {
    const handler = vi.mocked(page.addEventListener).mock.calls.find(([event]) => event === type)?.[1] as EventListener;
    handler({ type, isTrusted: true } as Event);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    page = new MusicDocument();
    elements = [];
    queuedPlays = [];
    vi.spyOn(page, "addEventListener");
    vi.stubGlobal("document", page);
    vi.stubGlobal("Audio", TestAudio);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
    options = { enabled: true, volume: 0.25, scene: "menu", victoryId: null };
    player = new MusicPlayer();
    stop = player.start();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests no media until trusted input or explicit activation", async () => {
    configure({ scene: "match" });
    page.dispatchEvent(new Event("pointerdown"));
    page.dispatchEvent(new Event("keydown"));
    await settle();
    expect(elements).toHaveLength(0);
    expect(player.getSnapshot().status).toBe("waiting");

    trustedGesture("keydown");
    await settle();
    expect(elements).toHaveLength(1);
    expect(elements[0].preload).toBe("none");
    expect(elements[0].src).toContain("corners-are-keepers-1.mp3");
    expect(player.getSnapshot().status).toBe("playing");
    expect(elements[0].volume).toBeCloseTo(0.25);
  });

  it("cycles each scene playlist on ended with one media element", async () => {
    player.activate();
    await settle();
    const audio = elements[0];
    expect(audio.src).toContain("a-little-strategy-a-lot-of-heart.mp3");

    audio.finish();
    await settle();
    expect(audio.src).toContain("a-little-strategy.mp3");
    audio.finish();
    await settle();
    expect(audio.src).toContain("a-little-strategy-a-lot-of-heart.mp3");

    configure({ scene: "match" });
    await settle();
    expect(audio.src).toContain("corners-are-keepers-1.mp3");
    audio.finish();
    await settle();
    expect(audio.src).toContain("corners-are-keepers-2.mp3");
    audio.finish();
    await settle();
    expect(audio.src).toContain("corners-are-keepers-1.mp3");
    expect(elements).toHaveLength(1);
  });

  it("plays a victory once per match and returns to the menu playlist", async () => {
    configure({ scene: "match" });
    player.activate();
    await settle();
    const audio = elements[0];

    configure({ scene: "menu", victoryId: "first-win" });
    await settle();
    expect(audio.src).toContain("flip-pocalypse-victory.mp3");
    audio.finish();
    await settle();
    expect(audio.src).toContain("a-little-strategy-a-lot-of-heart.mp3");
    const plays = audio.play.mock.calls.length;
    configure({ victoryId: "first-win" });
    await settle();
    expect(audio.play).toHaveBeenCalledTimes(plays);
    expect(player.getSnapshot().trackId).toBe("heart");

    configure({ scene: "match", victoryId: null });
    await settle();
    configure({ scene: "menu", victoryId: "second-win" });
    await settle();
    expect(audio.src).toContain("flip-pocalypse-victory.mp3");
  });

  it("mute stops playback and cancels a pending play without rewinding", async () => {
    const pending = deferred();
    queuedPlays.push(pending.promise);
    player.activate();
    const audio = elements[0];
    audio.currentTime = 37;
    configure({ enabled: false });
    pending.resolve();
    await settle();

    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);
    expect(player.getSnapshot().status).toBe("off");
    expect(audio.play).toHaveBeenCalledOnce();
    player.activate();
    player.next();
    await settle();
    expect(audio.play).toHaveBeenCalledOnce();

    configure({ enabled: true });
    await settle();
    expect(audio.currentTime).toBe(37);
    expect(audio.paused).toBe(false);
    expect(player.getSnapshot().status).toBe("playing");
  });

  it("pauses while hidden, cancels a fade, and resumes at the same time", async () => {
    player.activate();
    await settle(128);
    const audio = elements[0];
    audio.currentTime = 19;
    page.setHidden(true);
    const volumeAtPause = audio.volume;
    await settle();

    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(volumeAtPause);
    expect(player.getSnapshot().status).toBe("paused");
    trustedGesture();
    expect(audio.play).toHaveBeenCalledOnce();

    page.setHidden(false);
    await settle();
    expect(audio.currentTime).toBe(19);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.volume).toBeCloseTo(0.25);
  });

  it("does not load the next song when the page hides during a transition", async () => {
    player.activate();
    await settle();
    const audio = elements[0];
    configure({ scene: "match" });
    await settle(100);
    page.setHidden(true);
    await settle();
    expect(audio.src).toContain("a-little-strategy-a-lot-of-heart.mp3");
    expect(audio.paused).toBe(true);
    expect(audio.play).toHaveBeenCalledOnce();

    page.setHidden(false);
    await settle();
    expect(audio.src).toContain("corners-are-keepers-1.mp3");
    expect(player.getSnapshot().status).toBe("playing");
  });

  it("keeps rapid scene and next-track changes on the final selected song", async () => {
    player.activate();
    await settle();
    const audio = elements[0];
    configure({ scene: "match" });
    await settle(80);
    player.next();
    await settle(80);
    configure({ scene: "menu" });
    player.next();
    await settle(1500);

    expect(elements).toHaveLength(1);
    expect(audio.src).toContain("a-little-strategy.mp3");
    expect(player.getSnapshot()).toMatchObject({ trackId: "strategy", status: "playing" });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.volume).toBeCloseTo(0.25);
  });

  it("reports playing when a transition returns to the song already loaded", async () => {
    player.activate();
    await settle();
    const audio = elements[0];
    audio.currentTime = 24;
    player.next();
    await settle(80);
    player.next();
    await settle();

    expect(audio.src).toContain("a-little-strategy-a-lot-of-heart.mp3");
    expect(audio.currentTime).toBe(24);
    expect(audio.paused).toBe(false);
    expect(audio.volume).toBeCloseTo(0.25);
    expect(player.getSnapshot()).toMatchObject({ trackId: "heart", status: "playing" });
  });

  it("discards an earlier play failure after a new scene has started", async () => {
    const pending = deferred();
    queuedPlays.push(pending.promise);
    player.activate();
    const audio = elements[0];
    configure({ scene: "match" });
    await settle();
    expect(audio.src).toContain("corners-are-keepers-1.mp3");
    expect(player.getSnapshot().status).toBe("playing");

    pending.reject(new DOMException("The source was changed", "AbortError"));
    await settle();
    expect(elements).toHaveLength(1);
    expect(audio.paused).toBe(false);
    expect(player.getSnapshot()).toMatchObject({ trackId: "corners-1", status: "playing" });
  });

  it("does not resume from a pending play result while the page is hidden", async () => {
    const pending = deferred();
    queuedPlays.push(pending.promise);
    player.activate();
    const audio = elements[0];
    page.setHidden(true);
    pending.resolve();
    await settle();
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(player.getSnapshot().status).toBe("paused");

    page.setHidden(false);
    await settle();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(player.getSnapshot().status).toBe("playing");
  });

  it("allows a trusted retry after the browser blocks autoplay", async () => {
    const blocked = deferred();
    queuedPlays.push(blocked.promise);
    player.activate();
    const audio = elements[0];
    audio.paused = true;
    blocked.reject(new DOMException("User input is required", "NotAllowedError"));
    await settle();
    expect(player.getSnapshot().status).toBe("waiting");
    expect(audio.play).toHaveBeenCalledOnce();

    trustedGesture();
    await settle();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(player.getSnapshot().status).toBe("playing");
  });

  it("contains a media failure and lets the next-track control recover", async () => {
    player.activate();
    await settle();
    const audio = elements[0];
    audio.dispatchEvent(new Event("error"));
    await settle();
    expect(audio.paused).toBe(true);
    expect(player.getSnapshot().status).toBe("error");
    configure({ volume: 0.4 });
    expect(audio.play).toHaveBeenCalledOnce();

    player.next();
    await settle();
    expect(audio.src).toContain("a-little-strategy.mp3");
    expect(player.getSnapshot().status).toBe("playing");
    expect(audio.volume).toBeCloseTo(0.4);
  });

  it("stops at zero volume and resumes without loading another song", async () => {
    player.activate();
    await settle();
    const audio = elements[0];
    audio.currentTime = 61;
    configure({ volume: 0 });
    await settle();
    expect(audio.paused).toBe(true);
    expect(player.getSnapshot().status).toBe("paused");
    configure({ volume: 0.6 });
    await settle();
    expect(audio.currentTime).toBe(61);
    expect(audio.volume).toBeCloseTo(0.6);
    expect(elements).toHaveLength(1);
  });

  it("cleans up a pending player and starts a fresh player after remount", async () => {
    const pending = deferred();
    queuedPlays.push(pending.promise);
    player.activate();
    const oldAudio = elements[0];
    stop();
    expect(oldAudio.paused).toBe(true);
    expect(oldAudio.src).toBe("");
    expect(oldAudio.load).toHaveBeenCalledOnce();
    oldAudio.finish();
    oldAudio.dispatchEvent(new Event("error"));
    expect(player.getSnapshot().trackId).toBe("heart");
    expect(player.getSnapshot().status).toBe("waiting");

    stop = player.start();
    expect(elements).toHaveLength(1);
    player.activate();
    await settle();
    const newAudio = elements[1];
    pending.resolve();
    await settle();
    expect(newAudio.paused).toBe(false);
    expect(newAudio.volume).toBeCloseTo(0.25);
    expect(player.getSnapshot().status).toBe("playing");
    expect(oldAudio.play).toHaveBeenCalledOnce();
  });
});
