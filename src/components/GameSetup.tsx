import { Play, Sprout } from "lucide-react";
import type { GameMode } from "../game/enhanced";
import type { Difficulty } from "../game/engine";
import ModePicker from "./ModePicker";

type SetupProps = { mode: GameMode; difficulty: Difficulty; onMode: (mode: GameMode) => void; onDifficulty: (level: Difficulty) => void };
export function GameSetupFields({ mode, difficulty, onMode, onDifficulty }: SetupProps) {
  return <div className="match-setup-fields"><ModePicker value={mode} onChange={onMode} /><label className="field-label">CPU difficulty
    <select value={difficulty} onChange={event => onDifficulty(event.target.value as Difficulty)}><option value="easy">Easy breezy</option><option value="normal">A little challenge</option><option value="hard">Think it through</option></select>
  </label></div>;
}
export default function GameSetup({ onStart, ...props }: SetupProps & { onStart: () => void }) {
  return <section className="cpu-setup"><span className="eyebrow"><Sprout size={17} /> YOUR NEXT LITTLE ADVENTURE</span><h1>Two ways to flip.</h1><p>Choose your mode, meet the little thinker, and make your first move.</p><GameSetupFields {...props} /><button className="button primary" onClick={onStart}><Play size={19} fill="currentColor" /> Start {props.mode === "classic" ? "Classic" : "Enhanced"} game</button></section>;
}
