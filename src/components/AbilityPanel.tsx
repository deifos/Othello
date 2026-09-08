import { CornerUpLeft, Flame, Shield, Sparkles, Undo2, X } from "lucide-react";
import type { Ability, RulesView } from "../game/enhanced";
import type { Player } from "../game/engine";
import "./enhanced-game.css";

export type TargetAbility = "shield" | "corner" | null;
export function abilityTargets(rules: RulesView, player: Player, target: TargetAbility): number[] {
  if (target === "shield") return rules.board.flatMap((cell, index) => cell === player ? [index] : []);
  if (target === "corner") return [0, 7, 56, 63].filter(index => rules.board[index] === 0 && !rules.effects.some(effect => effect.ability === "corner" && effect.index === index && effect.owner !== player));
  return [];
}
export const abilityLabel = (ability: Ability) => ability === "corner" ? "Corner Claim" : ability === "shield" ? "Shield" : "Undo";

export default function AbilityPanel({ rules, player, canAct, target, onChoose, onCancel }: {
  rules: RulesView; player: Player; canAct: boolean; target: TargetAbility;
  onChoose: (ability: Ability) => void; onCancel: () => void;
}) {
  if (rules.mode !== "enhanced") return null;
  const other = player === 1 ? 2 : 1;
  const reward = rules.lastReward;
  return <section className="ability-panel" aria-label="Enhanced abilities">
    {rules.lastMove && rules.lastMove.flips.length >= 6 && <div className="flippocalypse-banner" role="status"><Flame size={30} /><div><strong>FLIP-POCALYPSE!</strong><span>{rules.lastMove.player === player ? "You" : "Your opponent"} flipped {rules.lastMove.flips.length} pills!</span></div><span aria-hidden="true">✦</span></div>}
    <div className="ability-heading"><Sparkles size={17} /><strong>Your abilities</strong><span>ENHANCED</span></div>
    {reward && <p className="ability-reward" role="status">{reward.player === player ? "You earned" : "Your opponent earned"} {abilityLabel(reward.ability)}!</p>}
    <div className="ability-buttons">{(["undo", "shield", "corner"] as const).map(ability => {
      const held = rules.tokens[player][ability];
      const hasTarget = ability === "undo" ? rules.canUndo[player] : abilityTargets(rules, player, ability).length > 0;
      const Icon = ability === "undo" ? Undo2 : ability === "shield" ? Shield : CornerUpLeft;
      return <button key={ability} className={`ability-button ${target === ability ? "selected" : ""}`} disabled={!canAct || rules.abilityUsed || !held || !hasTarget}
        onClick={() => onChoose(ability)} aria-pressed={target === ability} title={ability === "undo" ? "Earn with 3+ flips. Replay your previous turn and all replies." : ability === "shield" ? "Earn with 4+ flips in two directions. Protect your pill for one opposing turn." : "Earn with 5+ flips. Reserve an empty corner for one opposing turn."}>
        <Icon size={19} /><span>{abilityLabel(ability)}</span><b>{held ? "1" : "0"}</b>
      </button>;
    })}</div>
    {target ? <div className="ability-instruction" role="status"><p>{target === "shield" ? "Select one of your pills, then choose Protect pill." : "Select an empty corner, then choose Claim corner."}</p><button className="text-link" onClick={onCancel}><X size={15} /> Cancel</button></div>
      : <p className="ability-footnote">{rules.abilityUsed && rules.turn === player ? "Ability used. Now place your pill." : "Use one ability before your move."}</p>}
    <p className="opponent-tokens">Opponent’s tokens: Undo {Number(rules.tokens[other].undo)} · Shield {Number(rules.tokens[other].shield)} · Corner {Number(rules.tokens[other].corner)}</p>
  </section>;
}
