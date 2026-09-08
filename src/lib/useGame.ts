import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyMove,
  createBoard,
  getLegalMoves,
  getNextTurn,
  getScore,
} from "../game/engine";
import type { Player } from "../game/engine";
import { readStored, writeStored } from "./storage";
import { CAPTURE_START_MS, boardMoveSettleMs } from "../animation/moveMotion";
import { playGameSound } from "./gameAudio";
export type Difficulty = "easy" | "normal" | "hard";
interface Snapshot {
  board: number[];
  turn: Player | null;
  moves: number[];
  passed: Player | null;
}
export interface GameState extends Snapshot {
  id: string;
  history: Snapshot[];
  elapsed: number;
  difficulty: Difficulty;
  finished: boolean;
  surrendered: boolean;
  started: boolean;
}
function fresh(difficulty: Difficulty = "normal"): GameState {
  return {
    id: crypto.randomUUID(),
    board: createBoard(),
    turn: 1,
    moves: [],
    passed: null,
    history: [],
    elapsed: 0,
    difficulty,
    finished: false,
    surrendered: false,
    started: false,
  };
}
function valid(v: unknown) {
  const s = v as GameState;
  return (
    !!s &&
    typeof s.id === "string" &&
    Array.isArray(s.board) &&
    s.board.length === 64 &&
    s.board.every((c) => [0, 1, 2].includes(c)) &&
    [1, 2, null].includes(s.turn) &&
    Array.isArray(s.moves) &&
    s.moves.every((n) => Number.isInteger(n) && n >= 0 && n < 64) &&
    Array.isArray(s.history) &&
    s.history.every(
      (h) =>
        Array.isArray(h.board) &&
        h.board.length === 64 &&
        [1, 2, null].includes(h.turn) &&
        Array.isArray(h.moves),
    ) &&
    Number.isFinite(s.elapsed) &&
    s.elapsed >= 0 &&
    ["easy", "normal", "hard"].includes(s.difficulty) &&
    typeof s.finished === "boolean" &&
    typeof s.surrendered === "boolean" &&
    typeof s.started === "boolean"
  );
}
export function useGame(active: boolean, sound: boolean) {
  const [state, setState] = useState<GameState>(() =>
    readStored("flip.game", fresh(), valid),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const previousMotionBoard = useRef(state.board);
  const motionReadyAt = useRef(0);
  useEffect(() => {
    const before = previousMotionBoard.current;
    previousMotionBoard.current = state.board;
    motionReadyAt.current = performance.now() + boardMoveSettleMs(before, state.board);
  }, [state.board]);
  const previousAudioState = useRef(state);
  useEffect(() => {
    const before = previousAudioState.current;
    previousAudioState.current = state;
    if (!sound || !active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const placed = state.id === before.id && state.moves.length > before.moves.length;
    if (placed) {
      playGameSound("place");
      timers.push(setTimeout(() => playGameSound("flip"), CAPTURE_START_MS));
    }
    else if (state.started && (state.id !== before.id || !before.started))
      playGameSound("start");
    else if (state.id === before.id && state.moves.length < before.moves.length)
      playGameSound("undo");
    if (state.id === before.id && state.finished && !before.finished) {
      const score = getScore(state.board);
      const result = state.surrendered || score.black < score.white
        ? "loss"
        : score.black > score.white ? "win" : "draw";
      timers.push(setTimeout(() => playGameSound(result), placed ? boardMoveSettleMs(before.board, state.board) : 0));
    }
    return () => timers.forEach(clearTimeout);
  }, [state.board, state.id, state.finished, state.started, state.surrendered, active, sound]);
  useEffect(() => writeStored("flip.game", state), [state]);
  useEffect(() => {
    if (!active || state.finished || !state.started) return;
    const id = setInterval(() => {
      if (!document.hidden) setState((s) => ({ ...s, elapsed: s.elapsed + 1 }));
    }, 1000);
    return () => clearInterval(id);
  }, [active, state.finished, state.started]);
  const move = useCallback((index: number, cpu = false) => {
    setState((s) => {
      if (s.finished || s.turn === null || s.turn !== (cpu ? 2 : 1)) return s;
      const legal = getLegalMoves(s.board, s.turn);
      if (!legal.some((m) => m.index === index)) return s;
      const board = applyMove(s.board, index, s.turn);
      const next = getNextTurn(board, s.turn);
      const history = cpu
        ? s.history
        : [
            ...s.history,
            { board: s.board, turn: s.turn, moves: s.moves, passed: s.passed },
          ];
      return {
        ...s,
        board,
        turn: next.turn,
        passed: next.passed,
        finished: next.turn === null,
        moves: [...s.moves, index],
        history,
        started: true,
      };
    });
    setSelected(null);
  }, []);
  useEffect(() => {
    if (!active || state.turn !== 2 || state.finished) return;
    setBusy(true);
    let worker: Worker | undefined;
    const id = state.id + ":" + state.moves.length;
    let timer: ReturnType<typeof setTimeout>;

    let ended = false;
    const finish = (index: number | null) => {
      if (ended) return;
      ended = true;
      const choices = getLegalMoves(state.board, 2);
      const safeIndex = choices.some((m) => m.index === index)
        ? index
        : (choices[0]?.index ?? null);
      timer = setTimeout(
        () => {
          if (safeIndex !== null) move(safeIndex, true);
          setBusy(false);
        },
        Math.max(80, motionReadyAt.current + 100 - performance.now()),
      );
    };
    try {
      worker = new Worker(new URL("../game/cpu.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (
        e: MessageEvent<{ id: string; index: number | null; error?: string }>,
      ) => {
        if (e.data.id === id) finish(e.data.error ? null : e.data.index);
      };
      worker.onerror = () => finish(null);
      worker.postMessage({
        id,
        board: state.board,
        player: 2,
        difficulty: state.difficulty,
      });
    } catch {
      // Some embedded browsers block workers. A legal reply keeps the match usable.
      finish(null);
    }
    const timeout = setTimeout(
      () => finish(getLegalMoves(state.board, 2)[0]?.index ?? null),
      4500,
    );
    return () => {
      worker?.terminate();
      clearTimeout(timer);
      clearTimeout(timeout);
      setBusy(false);
    };
  }, [
    active,
    state.id,
    state.moves.length,
    state.turn,
    state.finished,
    state.difficulty,
    move,
  ]);
  const reset = (difficulty = state.difficulty) => {
    setState({ ...fresh(difficulty), started: true });
    setSelected(null);
  };
  const undo = () => {
    setState((s) => {
      const prev = s.history.at(-1);
      return prev
        ? {
            ...s,
            ...prev,
            history: s.history.slice(0, -1),
            finished: false,
            surrendered: false,
          }
        : s;
    });
    setSelected(null);
  };
  const surrender = () =>
    setState((s) =>
      s.finished ? s : { ...s, finished: true, turn: null, surrendered: true },
    );
  const start = () => setState((s) => ({ ...s, started: true }));
  return {
    state,
    selected,
    setSelected,
    busy,
    move,
    reset,
    undo,
    surrender,
    start,
    score: getScore(state.board),
    legalMoves:
      state.turn === 1 && !state.finished ? getLegalMoves(state.board, 1) : [],
  };
}
