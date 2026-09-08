import { Flame, Sprout } from "lucide-react";
import { useId } from "react";
import type { GameMode } from "../game/enhanced";
import "./enhanced-game.css";

export default function ModePicker({ value, onChange, disabled = false }: { value: GameMode; onChange: (mode: GameMode) => void; disabled?: boolean }) {
  const groupId = useId();
  return <fieldset className="mode-picker" disabled={disabled}>
    <legend>Choose your game</legend>
    <div className="mode-options">{(["classic", "enhanced"] as const).map(mode => <label key={mode} className={`mode-option ${value === mode ? "selected" : ""}`}>
      <input type="radio" name={`game-mode-${groupId}`} value={mode} checked={value === mode} onChange={() => onChange(mode)} />
      {mode === "classic" ? <Sprout size={23} /> : <Flame size={23} />}
      <span><strong>{mode === "classic" ? "Classic" : "Enhanced"}</strong><small>{mode === "classic" ? "The original strategy game" : "Earn abilities. Make a little chaos."}</small></span>
    </label>)}</div>
    {value === "enhanced" && <div className="mode-rules">
      <p><strong>3+ flips → Undo</strong><span>Replay your last turn and its replies.</span></p>
      <p><strong>4+ in two directions → Shield</strong><span>Protect one pill for your opponent’s next turn.</span></p>
      <p><strong>5+ flips → Corner Claim</strong><span>Block one empty corner for one opposing turn.</span></p>
      <small>One token of each kind. One reward per move, with Corner Claim first, then Shield, then Undo. Use one ability per turn. New tokens are ready on your next turn.</small>
      <details><summary>How Enhanced Undo works</summary><p>Use it before your move to return to the start of your previous turn. That move and all replies are removed. The token stays spent, and rewards from those moves are removed. Repeating the same capture does not earn that reward again.</p></details>
    </div>}
  </fieldset>;
}
