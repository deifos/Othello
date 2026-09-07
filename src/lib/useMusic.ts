import { useEffect, useState, useSyncExternalStore } from "react";
import { MusicPlayer } from "./music";
import type { MusicOptions } from "./music";
import { readStored, writeStored } from "./storage";

export function useMusic(scene: MusicOptions["scene"], victoryId: string | null) {
  const [player] = useState(() => new MusicPlayer());
  const [enabled, setEnabled] = useState(() => readStored("flip.music", true, (v) => typeof v === "boolean"));
  const [volume, setVolume] = useState(() => readStored("flip.musicVolume", 0.25, (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1));
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);

  useEffect(() => {
    player.configure({ enabled, volume, scene, victoryId });
  }, [player, enabled, volume, scene, victoryId]);
  useEffect(() => player.start(), [player]);
  useEffect(() => { writeStored("flip.music", enabled); }, [enabled]);
  useEffect(() => { writeStored("flip.musicVolume", volume); }, [volume]);

  return {
    ...snapshot,
    enabled,
    volume,
    onEnabledChange: (next: boolean) => {
      setEnabled(next);
      player.configure({ enabled: next, volume, scene, victoryId });
      if (next) player.activate();
    },
    onVolumeChange: (next: number) => {
      setVolume(next);
      player.configure({ enabled, volume: next, scene, victoryId });
      player.activate();
    },
    onNext: () => { player.next(); player.activate(); },
  };
}
