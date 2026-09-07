import { chooseCpuMove } from "./engine";
import type { Board, Difficulty, Player } from "./engine";

export interface CpuRequest {
  id: number | string;
  board: Board;
  player: Player;
  difficulty: Difficulty;
}

export interface CpuResponse {
  id: number | string;
  index: number | null;
  error?: string;
}

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CpuRequest>) => void) | null;
  postMessage: (response: CpuResponse) => void;
};

worker.onmessage = ({ data }) => {
  try {
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
