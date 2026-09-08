import { chooseCpuMove } from "./engine";
import type { Board, Difficulty, Player } from "./engine";
import { chooseRulesCpuAction, type RulesCpuAction, type RulesGame } from "./enhanced";

export interface CpuRequest {
  id: number | string;
  board: Board;
  player: Player;
  difficulty: Difficulty;
  rules?: RulesGame;
}

export interface CpuResponse {
  id: number | string;
  index: number | null;
  error?: string;
  action?: RulesCpuAction | null;
}

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CpuRequest>) => void) | null;
  postMessage: (response: CpuResponse) => void;
};

worker.onmessage = ({ data }) => {
  try {
    if (data.rules) {
      const action = chooseRulesCpuAction(data.rules, data.difficulty);
      worker.postMessage({ id: data.id, index: action?.type === "move" ? action.index : null, action });
      return;
    }
    const index = chooseCpuMove(data.board, data.player, data.difficulty);
    worker.postMessage({ id: data.id, index });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      index: null,
      error: error instanceof Error ? error.message : "CPU move failed.",
    });
  }
};
