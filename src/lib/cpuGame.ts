import { isBoard, type Difficulty, type Player } from "../game/engine";
import { createRulesGame, isRulesGame, playRulesMove, undoClassicPractice, useRulesAbility, type GameMode, type RulesCpuAction, type RulesGame } from "../game/enhanced";

export interface SavedCpuGame {
  id: string; rules: RulesGame; elapsed: number; difficulty: Difficulty;
  finished: boolean; surrendered: boolean; started: boolean;
}
export function freshCpuGame(difficulty: Difficulty = "normal", mode: GameMode = "classic", started = false): SavedCpuGame {
  return { id: crypto.randomUUID(), rules: createRulesGame(mode), elapsed: 0, difficulty, finished: false, surrendered: false, started };
}
function replayClassic(moves: unknown): RulesGame | null {
  if (!Array.isArray(moves) || moves.length > 60 || !moves.every(index => Number.isInteger(index) && index >= 0 && index < 64)) return null;
  let rules = createRulesGame("classic");
  try { for (const index of moves) rules = playRulesMove(rules, index); }
  catch { return null; }
  return rules;
}
export function restoreCpuGame(value: unknown): SavedCpuGame | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (typeof s.id !== "string" || !s.id || !["easy", "normal", "hard"].includes(String(s.difficulty)) ||
      !Number.isFinite(s.elapsed) || Number(s.elapsed) < 0 || typeof s.finished !== "boolean" || typeof s.surrendered !== "boolean" || typeof s.started !== "boolean") return null;
  let rules: RulesGame;
  if (s.rules !== undefined) {
    if (!isRulesGame(s.rules)) return null;
    rules = s.rules;
    if (rules.mode === "classic") {
      const replayed = replayClassic(rules.moves);
      if (!replayed || !rules.board.every((cell, index) => cell === replayed.board[index]) ||
          (rules.turn !== replayed.turn && !(s.surrendered && rules.turn === null))) return null;
      rules = replayed;
    }
  } else {
    // Keep existing Classic saves when the two-mode format is introduced.
    if (!isBoard(s.board) || ![1, 2, null].includes(s.turn as Player | null)) return null;
    const replayed = replayClassic(s.moves);
    if (!replayed || !s.board.every((cell, index) => cell === replayed.board[index]) ||
        (s.turn !== replayed.turn && !(s.surrendered && s.turn === null))) return null;
    rules = replayed;
  }
  return { id: s.id, rules, elapsed: Number(s.elapsed), difficulty: s.difficulty as Difficulty, finished: s.finished || s.surrendered || rules.turn === null, surrendered: s.surrendered, started: s.started };
}
export function applyCpuAction(state: SavedCpuGame, action: RulesCpuAction, actor: Player): SavedCpuGame {
  if (!state.started || state.finished || state.rules.turn !== actor) return state;
  try {
    const rules = action.type === "move" ? playRulesMove(state.rules, action.index) : useRulesAbility(state.rules, action.ability, action.target);
    return { ...state, rules, finished: rules.turn === null };
  } catch { return state; }
}
export function undoCpuGame(state: SavedCpuGame): SavedCpuGame {
  if (state.finished || !state.started) return state;
  if (state.rules.mode === "enhanced") return applyCpuAction(state, { type: "ability", ability: "undo" }, 1);
  const rules = undoClassicPractice(state.rules, 1);
  return rules === state.rules ? state : { ...state, rules, finished: false, surrendered: false };
}
