export const MUSIC_TRACKS = [
  { id: "heart", title: "A Little Strategy, A Lot of Heart", file: "a-little-strategy-a-lot-of-heart.mp3", scene: "menu" },
  { id: "strategy", title: "A Little Strategy", file: "a-little-strategy.mp3", scene: "menu" },
  { id: "corners-1", title: "Corners Are Keepers · 1", file: "corners-are-keepers-1.mp3", scene: "match" },
  { id: "corners-2", title: "Corners Are Keepers · 2", file: "corners-are-keepers-2.mp3", scene: "match" },
  { id: "victory", title: "Flip-pocalypse!", file: "flip-pocalypse-victory.mp3", scene: "victory" },
] as const;

export type MusicStatus = "waiting" | "playing" | "paused" | "off" | "error";
export interface MusicOptions {
  enabled: boolean;
  volume: number;
  scene: "menu" | "match";
  /** A human win, identified by match. Losses and draws use null. */
  victoryId: string | null;
}
type Track = (typeof MUSIC_TRACKS)[number];
export interface MusicSnapshot {
  trackId: Track["id"];
  trackTitle: string;
  status: MusicStatus;
}

/** One streaming media element; song files are not requested before user input. */
export class MusicPlayer {
  private options: MusicOptions = { enabled: true, volume: 0.25, scene: "menu", victoryId: null };
  private track: Track = MUSIC_TRACKS[0];
  private snapshot: MusicSnapshot = { trackId: this.track.id, trackTitle: this.track.title, status: "waiting" };
  private listeners = new Set<() => void>();
  private celebrated = new Set<string>();
  private audio: HTMLAudioElement | undefined;
  private loaded: Track["id"] | undefined;
  private active = false;
  private activated = false;
  private pending = false;
  private failed = false;
  private transitioning = false;
  private revision = 0;
  private frame = 0;

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(status: MusicStatus) {
    if (this.snapshot.status === status && this.snapshot.trackId === this.track.id) return;
    this.snapshot = { trackId: this.track.id, trackTitle: this.track.title, status };
    this.listeners.forEach((listener) => listener());
  }

  configure(options: MusicOptions) {
    const previous = this.options;
    this.options = { ...options, volume: Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : 0.25 };
    if (options.enabled && !previous.enabled) this.failed = false;
    if (options.victoryId && !this.celebrated.has(options.victoryId)) {
      this.celebrated.add(options.victoryId);
      this.choose(MUSIC_TRACKS[4]);
    } else if (options.scene !== previous.scene || (previous.victoryId && !options.victoryId)) {
      this.choose(MUSIC_TRACKS.find((track) => track.scene === options.scene)!);
    } else {
      this.sync();
    }
  }

  start() {
    this.active = true;
    document.addEventListener("pointerdown", this.gesture, true);
    document.addEventListener("keydown", this.gesture, true);
    document.addEventListener("visibilitychange", this.visibility);
    this.sync();
    return () => this.stop();
  }

  /** Also called directly by the music controls within a user action. */
  activate = () => {
    if (!this.active || !this.options.enabled || document.hidden) return;
    this.activated = true;
    this.sync();
  };

  next = () => {
    if (!this.options.enabled) return;
    const playlist = MUSIC_TRACKS.filter((track) => track.scene === this.options.scene);
    const index = playlist.findIndex((track) => track.id === this.track.id);
    this.choose(playlist[(index + 1) % playlist.length]);
  };

  private gesture = (event: Event) => {
    if (event.isTrusted && !this.activated) this.activate();
  };
  private visibility = () => this.sync();
  private ended = () => {
    // Victory plays once, then the menu themes continue on the result screen.
    this.next();
  };
  private error = () => {
    this.failed = true;
    this.pause();
    this.publish("error");
  };

  private allowed() {
    return this.active && this.activated && this.options.enabled && this.options.volume > 0 && !document.hidden;
  }

  private choose(track: Track) {
    this.track = track;
    this.failed = false;
    this.revision += 1;
    this.pending = false;
    this.cancelFade();
    this.sync();
  }

  private cancelFade() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.transitioning = false;
  }

  private fade(target: number, duration: number, done?: () => void) {
    this.cancelFade();
    const audio = this.audio;
    if (!audio) return;
    const from = audio.volume;
    const start = performance.now();
    const step = () => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      // Smooth endpoints prevent an abrupt change in loudness.
      audio.volume = from + (target - from) * (progress * progress * (3 - 2 * progress));
      if (progress < 1) this.frame = requestAnimationFrame(step);
      else {
        this.frame = 0;
        this.transitioning = false;
        done?.();
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  private pause() {
    this.revision += 1;
    this.pending = false;
    this.cancelFade();
    this.audio?.pause();
  }

  private sync() {
    if (!this.allowed()) {
      this.pause();
      this.publish(!this.options.enabled ? "off" : !this.activated ? "waiting" : "paused");
      return;
    }
    if (this.failed) {
      this.publish("error");
      return;
    }
    if (this.transitioning || this.pending) return;
    if (this.loaded !== this.track.id) {
      this.publish("waiting");
      if (this.audio && !this.audio.paused) {
        this.fade(0, 320, () => this.loadAndPlay());
        this.transitioning = true;
      } else this.loadAndPlay();
    } else if (this.audio?.paused) this.play();
    else if (this.audio) {
      this.publish("playing");
      this.fade(this.options.volume, 180);
    }
  }

  private loadAndPlay() {
    if (!this.allowed()) return;
    try {
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.preload = "none";
        this.audio.addEventListener("ended", this.ended);
        this.audio.addEventListener("error", this.error);
      }
      this.audio.pause();
      this.audio.src = `/audio/music/${this.track.file}`;
      this.audio.volume = 0;
      this.loaded = this.track.id;
      this.play();
    } catch { this.error(); }
  }

  private play() {
    const audio = this.audio;
    if (!audio || !this.allowed()) return;
    const revision = ++this.revision;
    this.pending = true;
    audio.volume = 0;
    try {
      void audio.play().then(() => {
        if (revision !== this.revision) return;
        this.pending = false;
        if (!this.allowed()) { this.pause(); return; }
        this.publish("playing");
        this.fade(this.options.volume, 600);
      }).catch((error: unknown) => {
        if (revision !== this.revision) return;
        this.pending = false;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          this.activated = false;
          this.publish("waiting");
        } else this.error();
      });
    } catch { this.error(); }
  }

  private stop() {
    this.active = false;
    this.activated = false;
    document.removeEventListener("pointerdown", this.gesture, true);
    document.removeEventListener("keydown", this.gesture, true);
    document.removeEventListener("visibilitychange", this.visibility);
    this.pause();
    if (this.audio) {
      this.audio.removeEventListener("ended", this.ended);
      this.audio.removeEventListener("error", this.error);
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = undefined;
      this.loaded = undefined;
    }
    this.publish(this.options.enabled ? "waiting" : "off");
  }
}
