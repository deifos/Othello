import { useId } from "react";
import { Leaf, Sparkles, Volume2 } from "lucide-react";
import "./sound-style-picker.css";

type SoundStyle = "dreamy" | "zen";

interface SoundStylePickerProps {
  value: SoundStyle;
  enabled: boolean;
  onChange: (style: SoundStyle) => void;
  onPreview: (style: SoundStyle) => void;
}

const soundStyles = [
  {
    id: "dreamy",
    name: "Dreamy",
    description: "Soft, bright chimes",
    Icon: Sparkles,
  },
  {
    id: "zen",
    name: "Zen",
    description: "Quiet, warm tones",
    Icon: Leaf,
  },
] as const;

export default function SoundStylePicker({
  value,
  enabled,
  onChange,
  onPreview,
}: SoundStylePickerProps) {
  const id = useId();
  const mutedNoteId = `${id}-muted`;

  return (
    <fieldset className="sound-style-picker">
      <legend>Sound style</legend>
      <div className="sound-style-options">
        {soundStyles.map(({ id: style, name, description, Icon }) => (
          <div
            key={style}
            className={`sound-style-option${value === style ? " is-selected" : ""}`}
          >
            <label className="sound-style-label">
              <input
                type="radio"
                name={`${id}-sound-style`}
                value={style}
                checked={value === style}
                aria-label={name}
                aria-describedby={`${id}-${style}-description`}
                onChange={() => onChange(style)}
              />
              <span className="sound-style-copy">
                <span className="sound-style-name">
                  <Icon size={14} aria-hidden="true" />
                  {name}
                </span>
                <span
                  className="sound-style-description"
                  id={`${id}-${style}-description`}
                >
                  {description}
                </span>
              </span>
            </label>
            <button
              type="button"
              className="sound-style-preview"
              aria-label={`Preview ${name} sound`}
              aria-describedby={enabled ? undefined : mutedNoteId}
              title={`Preview ${name} sound`}
              disabled={!enabled}
              onClick={() => onPreview(style)}
            >
              <Volume2 size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {!enabled && (
        <p className="sound-style-note" id={mutedNoteId}>
          Turn on Game sounds to preview.
        </p>
      )}
    </fieldset>
  );
}
