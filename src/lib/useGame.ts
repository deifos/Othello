import { useCallback, useEffect, useRef, useState } from "react";
import { getScore, type Difficulty } from "../game/engine";
import { chooseRulesCpuAction, getRulesLegalMoves, type Ability, type GameMode, type RulesCpuAction } from "../game/enhanced";
import { readStored, writeStored } from "./storage";
import { CAPTURE_START_MS, boardMoveSettleMs } from "../animation/moveMotion";
import { FLIPPOCALYPSE_MS, isFlippocalypseMove } from "../animation/flippocalypseMotion";
import { playGameSound } from "./gameAudio";
import { applyCpuAction, freshCpuGame, restoreCpuGame, undoCpuGame } from "./cpuGame";
export type { Difficulty } from "../game/engine";

export function useGame(active: boolean, sound: boolean) {
  const [saved, setState] = useState(() => restoreCpuGame(readStored<unknown>("flip.game", null)) ?? freshCpuGame());
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const previous = useRef(saved);
  const motionReadyAt = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = saved;
    const burst = isFlippocalypseMove(before.rules.board, saved.rules.board, saved.rules.mode);
    const settle = burst ? FLIPPOCALYPSE_MS : boardMoveSettleMs(before.rules.board, saved.rules.board);
    if (before.rules.board !== saved.rules.board) motionReadyAt.current = performance.now() + settle;
    if (!sound || !active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const placed = saved.id === before.id && saved.rules.moveCount === before.rules.moveCount + 1;
    if (placed) { playGameSound("place"); timers.push(setTimeout(() => playGameSound("flip"), CAPTURE_START_MS)); }
    else if (saved.started && (saved.id !== before.id || !before.started)) playGameSound("start");
    else if (saved.id === before.id && saved.rules.moveCount < before.rules.moveCount) playGameSound("undo");
    else if (saved.rules.abilityUsed && !before.rules.abilityUsed) playGameSound("success");
    if (saved.id === before.id && saved.finished && !before.finished) {
      const score = getScore(saved.rules.board);
      const result = saved.surrendered || score.black < score.white ? "loss" : score.black > score.white ? "win" : "draw";
      timers.push(setTimeout(() => playGameSound(result), placed ? settle : 0));
    }
    return () => timers.forEach(clearTimeout);
  }, [saved.rules, saved.id, saved.finished, saved.started, saved.surrendered, active, sound]);
  useEffect(() => writeStored("flip.game", saved), [saved]);
  useEffect(() => {
    if (!active || saved.finished || !saved.started) return;
    const timer = setInterval(() => { if (!document.hidden) setState(s => ({ ...s, elapsed: s.elapsed + 1 })); }, 1000);
    return () => clearInterval(timer);
  }, [active, saved.finished, saved.started]);
  const act = useCallback((action: RulesCpuAction, cpu = false) => {
    setState(s => applyCpuAction(s, action, cpu ? 2 : 1)); setSelected(null);
  }, []);
  const move = useCallback((index: number, cpu = false) => act({ type: "move", index }, cpu), [act]);
  const useAbility = useCallback((ability: Ability, target?: number) => act({ type: "ability", ability, target }), [act]);
  useEffect(() => {
    if (!active || !saved.started || saved.rules.turn !== 2 || saved.finished) return;
    setBusy(true);
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    const id = crypto.randomUUID();
    const finish = (action: RulesCpuAction | null) => {
      if (ended) return;
      ended = true;
      const valid = action && applyCpuAction(saved, action, 2) !== saved;
      const safe = valid ? action : chooseRulesCpuAction(saved.rules, "easy");
      timer = setTimeout(() => { if (safe) act(safe, true); setBusy(false); }, Math.max(saved.rules.abilityUsed ? 420 : 250, motionReadyAt.current + 120 - performance.now()));
    };
    try {
      worker = new Worker(new URL("../game/cpu.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<{ id: string; action?: RulesCpuAction | null; error?: string }>) => {
        if (e.data.id === id) finish(e.data.error ? null : e.data.action ?? null);
      };
      worker.onerror = () => finish(null);
      worker.postMessage({ id, board: saved.rules.board, player: 2, difficulty: saved.difficulty, rules: saved.rules });
    } catch { finish(null); }
    const timeout = setTimeout(() => finish(null), 4500);
    return () => { ended = true; worker?.terminate(); clearTimeout(timer); clearTimeout(timeout); setBusy(false); };
  }, [active, saved.id, saved.rules, saved.started, saved.finished, saved.difficulty, act]);
  const reset = (difficulty: Difficulty = saved.difficulty, mode: GameMode = saved.rules.mode) => { setState(freshCpuGame(difficulty, mode, true)); setSelected(null); };
  const undo = () => { setState(undoCpuGame); setSelected(null); };
  const surrender = () => setState(s => s.finished ? s : { ...s, finished: true, surrendered: true });
  const start = () => setState(s => ({ ...s, started: true }));
  const state = { ...saved, ...saved.rules, turn: saved.finished ? null : saved.rules.turn };
  return { state, selected, setSelected, busy, move, useAbility, reset, undo, surrender, start,
    canUndo: !saved.finished && (saved.rules.mode === "enhanced" ? saved.rules.canUndo[1] : saved.rules.moves.length > 0),
    score: getScore(saved.rules.board), legalMoves: saved.started && saved.rules.turn === 1 && !saved.finished ? getRulesLegalMoves(saved.rules, 1) : [],
  };
}
