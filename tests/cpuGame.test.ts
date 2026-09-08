import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoard, type Player } from "../src/game/engine";
import { createRulesGame, getRulesLegalMoves, isRulesGame, playRulesMove, type RulesGame } from "../src/game/enhanced";
import { applyCpuAction, freshCpuGame, restoreCpuGame, undoCpuGame, type SavedCpuGame } from "../src/lib/cpuGame";

const roundTrip = (state: SavedCpuGame) => restoreCpuGame(JSON.parse(JSON.stringify(state)));

function legacySave(moves = [19, 18]) {
  let rules = createRulesGame("classic");
  for (const index of moves) rules = playRulesMove(rules, index);
  return { id: "old-classic-save", board: rules.board, turn: rules.turn, moves, passed: rules.passed, elapsed: 51, difficulty: "hard", finished: rules.turn === null, surrendered: false, started: true };
}

function earnUndo(): SavedCpuGame {
  const board = createBoard();
  board[1] = board[2] = board[3] = 2; board[4] = 1;
  let state = { ...freshCpuGame("normal", "enhanced", true), rules: createRulesGame("enhanced", { board, turn: 1, moveCount: 0 }) };
  state = applyCpuAction(state, { type: "move", index: 0 }, 1);
  if (state.rules.turn === 2) state = applyCpuAction(state, { type: "move", index: getRulesLegalMoves(state.rules)[0].index }, 2);
  expect(state.rules.canUndo[1]).toBe(true);
  return state;
}

afterEach(() => vi.unstubAllGlobals());

describe("CPU match integration", () => {
  it("creates separate Classic and Enhanced games before the player starts", () => {
    const classic = freshCpuGame();
    const enhanced = freshCpuGame("hard", "enhanced");
    expect(classic.rules.mode).toBe("classic");
    expect(classic.difficulty).toBe("normal");
    expect(enhanced.rules.mode).toBe("enhanced");
    expect(enhanced.difficulty).toBe("hard");
    expect(classic.id).not.toBe(enhanced.id);
    for (const state of [classic, enhanced]) {
      expect(state.started).toBe(false);
      expect(state.finished).toBe(false);
      expect(state.surrendered).toBe(false);
      expect(state.elapsed).toBe(0);
      expect(state.rules.board).toEqual(createBoard());
      expect(state.rules.turn).toBe(1);
      expect(isRulesGame(state.rules)).toBe(true);
    }
  });

  it("does not accept CPU or human moves before Start", () => {
    for (const mode of ["classic", "enhanced"] as const) {
      const state = freshCpuGame("normal", mode);
      for (const actor of [1, 2] as const) expect(applyCpuAction(state, { type: "move", index: 19 }, actor)).toBe(state);
      expect(undoCpuGame(state)).toBe(state);
    }
  });

  it("permits only the current actor and keeps illegal actions unchanged", () => {
    let state = freshCpuGame("normal", "enhanced", true);
    expect(applyCpuAction(state, { type: "move", index: 19 }, 2)).toBe(state);
    expect(applyCpuAction(state, { type: "move", index: 0 }, 1)).toBe(state);
    expect(applyCpuAction(state, { type: "ability", ability: "shield", target: 28 }, 1)).toBe(state);
    state = applyCpuAction(state, { type: "move", index: 19 }, 1);
    expect(state.rules.turn).toBe(2);
    expect(applyCpuAction(state, { type: "move", index: 18 }, 1)).toBe(state);
    const reply = applyCpuAction(state, { type: "move", index: 18 }, 2);
    expect(reply.rules.turn).toBe(1);
    expect(reply.rules.moves).toEqual([19, 18]);
  });

  it("migrates an existing Classic save and keeps free practice Undo working", () => {
    const legacy = legacySave();
    const restored = restoreCpuGame(legacy)!;
    expect(restored).toMatchObject({ id: legacy.id, elapsed: 51, difficulty: "hard", started: true, finished: false });
    expect(restored.rules.mode).toBe("classic");
    expect(restored.rules.board).toEqual(legacy.board);
    expect(restored.rules.moves).toEqual([19, 18]);
    expect(isRulesGame(restored.rules)).toBe(true);
    const undone = undoCpuGame(restored);
    expect(undone.rules.moves).toEqual([]);
    expect(undone.rules.board).toEqual(createBoard());
    expect(undone.elapsed).toBe(51);
    expect(undone.id).toBe(legacy.id);
  });

  it("rejects illegal or inconsistent legacy transcripts before they can crash Undo", () => {
    const legacy = legacySave();
    expect(restoreCpuGame({ ...legacy, moves: [0] })).toBeNull();
    expect(restoreCpuGame({ ...legacy, moves: [19, 19] })).toBeNull();
    expect(restoreCpuGame({ ...legacy, board: createBoard() })).toBeNull();
    expect(restoreCpuGame({ ...legacy, turn: 2 })).toBeNull();
    expect(restoreCpuGame({ ...legacy, moves: Array(61).fill(19) })).toBeNull();
  });

  it("checks current Classic transcripts and keeps legacy surrendered games finished", () => {
    let state = freshCpuGame("normal", "classic", true);
    state = applyCpuAction(state, { type: "move", index: 19 }, 1);
    const invalid = JSON.parse(JSON.stringify(state)) as SavedCpuGame;
    invalid.rules.moves = [0];
    expect(restoreCpuGame(invalid)).toBeNull();
    const legacy = legacySave();
    const surrendered = restoreCpuGame({ ...legacy, turn: null, surrendered: true, finished: false })!;
    expect(surrendered.finished).toBe(true);
    expect(surrendered.surrendered).toBe(true);
    expect(applyCpuAction(surrendered, { type: "move", index: 17 }, 1)).toBe(surrendered);
  });

  it("restores Enhanced tokens and history and spends the earned Undo after reload", () => {
    const state = earnUndo();
    const restored = roundTrip(state)!;
    expect(restored).toEqual(state);
    expect(restored.rules.tokens[1].undo).toBe(true);
    expect(restored.rules.privateState.history).toHaveLength(2);
    const expected = state.rules.privateState.history[0].before;
    const undone = undoCpuGame(restored);
    expect(undone.rules.board).toEqual(expected.board);
    expect(undone.rules.moves).toEqual(expected.moves);
    expect(undone.rules.tokens[1].undo).toBe(false);
    expect(undone.rules.abilityUsed).toBe(true);
    expect(roundTrip(undone)).toEqual(undone);
  });

  it("restores an active shield through reload and expires it after the CPU reply", () => {
    let state = freshCpuGame("normal", "enhanced", true);
    for (let count = 0; count < 60 && !(state.rules.turn === 1 && state.rules.tokens[1].shield); count++) {
      const legal = getRulesLegalMoves(state.rules);
      expect(legal.length).toBeGreaterThan(0);
      state = applyCpuAction(state, { type: "move", index: legal[count % legal.length].index }, state.rules.turn!);
    }
    expect(state.rules.tokens[1].shield).toBe(true);
    const own = state.rules.board.findIndex(cell => cell === 1);
    state = applyCpuAction(state, { type: "ability", ability: "shield", target: own }, 1);
    const restored = roundTrip(state)!;
    expect(restored.rules.effects).toEqual([{ ability: "shield", owner: 1, index: own }]);
    expect(restored.rules.abilityUsed).toBe(true);
    expect(restored.rules.tokens[1].shield).toBe(false);
    state = applyCpuAction(restored, { type: "move", index: getRulesLegalMoves(restored.rules)[0].index }, 1);
    if (state.rules.turn === 2) state = applyCpuAction(state, { type: "move", index: getRulesLegalMoves(state.rules)[0].index }, 2);
    expect(state.rules.effects).toEqual([]);
    expect(roundTrip(state)).toEqual(state);
  });

  it("marks completed boards finished and rejects every action after completion or surrender", () => {
    let state = freshCpuGame("easy", "enhanced", true);
    while (state.rules.turn !== null) {
      state = applyCpuAction(state, { type: "move", index: getRulesLegalMoves(state.rules)[0].index }, state.rules.turn);
    }
    expect(state.finished).toBe(true);
    expect(roundTrip({ ...state, finished: false })?.finished).toBe(true);
    for (const finished of [state, { ...earnUndo(), finished: true, surrendered: true }]) {
      expect(applyCpuAction(finished, { type: "move", index: 19 }, 1)).toBe(finished);
      expect(applyCpuAction(finished, { type: "ability", ability: "undo" }, 1)).toBe(finished);
      expect(undoCpuGame(finished)).toBe(finished);
      expect(roundTrip(finished)?.finished).toBe(true);
    }
  });

  it("rejects malformed settings and Enhanced private state on restore", () => {
    const state = earnUndo();
    for (const value of [null, [], {}, { ...state, elapsed: -1 }, { ...state, elapsed: Infinity }, { ...state, started: "yes" }, { ...state, difficulty: "impossible" }, { ...state, rules: { ...state.rules, privateState: undefined } }]) expect(restoreCpuGame(value)).toBeNull();
    const spent = JSON.parse(JSON.stringify(state)) as SavedCpuGame;
    spent.rules.privateState.spent.push(spent.rules.privateState.bank[1].undo!);
    expect(restoreCpuGame(spent)).toBeNull();
  });

  it("returns an Enhanced ability from the CPU worker and a legal move on the following request", async () => {
    vi.resetModules();
    const replies: Array<{ id: string; action: { type: string; index?: number; ability?: string; target?: number }; error?: string }> = [];
    const scope = { onmessage: null as ((event: MessageEvent) => void) | null, postMessage: (value: typeof replies[number]) => replies.push(value) };
    vi.stubGlobal("self", scope);
    await import("../src/game/cpu.worker");
    let game: RulesGame = createRulesGame("enhanced");
    let found = false;
    for (let count = 0; count < 60 && game.turn !== null; count++) {
      scope.onmessage!({ data: { id: "worker-ability", rules: game, board: game.board, player: game.turn, difficulty: "normal" } } as MessageEvent);
      const reply = replies.at(-1)!;
      expect(reply.error).toBeUndefined();
      expect(reply.id).toBe("worker-ability");
      if (reply.action.type === "ability") {
        const state = applyCpuAction({ ...freshCpuGame("normal", "enhanced", true), rules: game }, reply.action as Parameters<typeof applyCpuAction>[1], game.turn as Player);
        expect(state.rules.abilityUsed).toBe(true);
        scope.onmessage!({ data: { id: "worker-after-ability", rules: state.rules, board: state.rules.board, player: state.rules.turn, difficulty: "normal" } } as MessageEvent);
        const next = replies.at(-1)!;
        expect(next.id).toBe("worker-after-ability");
        expect(next.action.type).toBe("move");
        expect(getRulesLegalMoves(state.rules).some(move => move.index === next.action.index)).toBe(true);
        found = true;
        break;
      }
      game = playRulesMove(game, reply.action.index!);
    }
    expect(found).toBe(true);
  });
});
