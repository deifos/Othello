import { useId } from "react";
import { Music2, SkipForward, Volume2 } from "lucide-react";
import "./music-settings.css";

interface MusicSettingsProps {
  enabled: boolean;
  volume: number;
  trackTitle: string;
  status: "waiting" | "playing" | "paused" | "off" | "error";
  onEnabledChange: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onNext: () => void;
}

const statusText: Record<MusicSettingsProps["status"], string> = {
  waiting: "Ready to play",
  playing: "Now playing",
  paused: "Paused",
  off: "Music is off",
  error: "Music could not play. Try the next song.",
};

export default function MusicSettings({
  enabled,
  volume,
  trackTitle,
  status,
  onEnabledChange,
  onVolumeChange,
  onNext,
}: MusicSettingsProps) {
  const id = useId();
  const percentage = Math.round(Math.min(1, Math.max(0, volume)) * 100);

  return (
    <fieldset className="music-settings">
      <legend className="music-settings-legend">Music</legend>
      <label className="music-settings-toggle">
        <span>
          <Music2 size={18} aria-hidden="true" />
          Background music
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
      </label>

      <div className="music-settings-player">
        <div className="music-settings-track" role="status" aria-live="polite">
          <span className="music-settings-status">{statusText[status]}</span>
          <span className="music-settings-title">
            {trackTitle || "Your original soundtrack"}
          </span>
        </div>
        <button
          className="music-settings-next"
          type="button"
          aria-label="Next song"
          title="Next song"
          disabled={!enabled}
          onClick={onNext}
        >
          <SkipForward size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="music-settings-volume-heading">
        <label htmlFor={`${id}-volume`}>
          <Volume2 size={14} aria-hidden="true" />
          Music volume
        </label>
        <output htmlFor={`${id}-volume`}>{percentage}%</output>
      </div>
      <input
        className="music-settings-volume"
        id={`${id}-volume`}
        type="range"
        min="0"
        max="100"
        step="1"
        value={percentage}
        aria-valuetext={`${percentage}%`}
        onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
      />
      <p className="music-settings-note">
        Menu and match songs change automatically. A win plays your victory song.
      </p>
    </fieldset>
  );
}
