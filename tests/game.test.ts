import { describe, expect, it } from "vitest";
import {
  applyMove,
  chooseCpuMove,
  createBoard,
  getFlips,
  getLegalMoves,
  getNextTurn,
  getScore,
  isBoard,
  opponent,
} from "../src/game/engine";
import type { Board, Player } from "../src/game/engine";

describe("Othello rules", () => {
  it("starts with four center pieces and the four legal black moves", () => {
    const board = createBoard();
    expect(getScore(board)).toEqual({ black: 2, white: 2, empty: 60 });
    expect(getLegalMoves(board, 1).map((move) => move.index)).toEqual([
      19, 26, 37, 44,
    ]);
    expect(getLegalMoves(board, 2).map((move) => move.index)).toEqual([
      20, 29, 34, 43,
    ]);
  });

  it("captures in all eight directions without changing the input", () => {
    const board = Array<number>(64).fill(0);
    const expected: number[] = [];
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      const adjacent = (3 + dr) * 8 + 3 + dc;
      board[adjacent] = 2;
      expected.push(adjacent);
      board[(3 + dr * 2) * 8 + 3 + dc * 2] = 1;
    }
    const before = board.slice();
    expect(getFlips(board, 27, 1).sort((a, b) => a - b)).toEqual(
      expected.sort((a, b) => a - b),
    );
    expect(getScore(applyMove(board, 27, 1))).toEqual({
      black: 17,
      white: 0,
      empty: 47,
    });
    expect(board).toEqual(before);
  });

  it("captures a complete line but does not wrap across a row", () => {
    const board = Array<number>(64).fill(0);
    board[0] = 1;
    for (let i = 1; i < 7; i++) board[i] = 2;
    expect(getFlips(board, 7, 1)).toEqual([6, 5, 4, 3, 2, 1]);
    const edge = Array<number>(64).fill(0);
    edge[6] = 1;
    edge[7] = 2;
    expect(getFlips(edge, 8, 1)).toEqual([]);
  });

  it("rejects occupied, unbounded, unbracketed, and malformed moves", () => {
    const board = createBoard();
    for (const index of [-1, 64, 19.5, NaN, 0, 27])
      expect(() => applyMove(board, index, 1)).toThrow();
    expect(() => applyMove([], 19, 1)).toThrow();
    expect(isBoard(Array(64).fill(3))).toBe(false);
    expect(isBoard(Array(64))).toBe(false);
    expect(isBoard(board)).toBe(true);
    expect(getScore(board)).toEqual({ black: 2, white: 2, empty: 60 });
  });

  it("passes a player with no legal move and lets the other player continue", () => {
    const board = Array<number>(64).fill(1);
    board[0] = 0;
    board[1] = 2;
    expect(getLegalMoves(board, 2)).toEqual([]);
    expect(getNextTurn(board, 1)).toEqual({ turn: 1, passed: 2 });
    expect(getNextTurn(applyMove(board, 0, 1), 1)).toEqual({
      turn: null,
      passed: null,
    });
  });

  it("ends when neither player can move, even if the board is not full", () => {
    const board = Array<number>(64).fill(1);
    board[0] = 0;
    expect(getNextTurn(board, 1)).toEqual({ turn: null, passed: null });
    expect(chooseCpuMove(board, 1, "hard")).toBeNull();
    expect(chooseCpuMove(board, 2, "normal")).toBeNull();
  });
});

describe("CPU", () => {
  it.each(["easy", "normal", "hard"] as const)(
    "returns a legal and deterministic %s move",
    (difficulty) => {
      const board = createBoard();
      const before = board.slice();
      const move = chooseCpuMove(board, 1, difficulty);
      expect([19, 26, 37, 44]).toContain(move);
      expect(chooseCpuMove(board, 1, difficulty)).toBe(move);
      expect(board).toEqual(before);
    },
  );

  it("finishes complete legal games, including passes, with consistent scores", () => {
    for (let seed = 0; seed < 4; seed++) {
      let board: Board = createBoard();
      let turn: Player | null = 1;
      let placed = 0;
      while (turn !== null) {
        const player: Player = turn;
        const legal = getLegalMoves(board, player);
        expect(legal.length).toBeGreaterThan(0);
        const index =
          player === 2
            ? chooseCpuMove(board, player, "easy")!
            : legal[(placed * 7 + seed * 3) % legal.length].index;
        expect(legal.some((move) => move.index === index)).toBe(true);
        const prior = getScore(board);
        board = applyMove(board, index, player);
        const score = getScore(board);
        expect(score.empty).toBe(prior.empty - 1);
        expect(score.black + score.white + score.empty).toBe(64);
        turn = getNextTurn(board, player).turn;
        placed++;
        expect(placed).toBeLessThanOrEqual(60);
      }
      expect(getLegalMoves(board, 1)).toEqual([]);
      expect(getLegalMoves(board, 2)).toEqual([]);
      expect(getScore(board).empty).toBe(60 - placed);
    }
  });

  it("solves a small endgame against an independent exhaustive search", () => {
    let board = createBoard();
    let player: Player = 1;
    while (getScore(board).empty > 6) {
      const moves = getLegalMoves(board, player);
      if (!moves.length) {
        player = opponent(player);
        if (!getLegalMoves(board, player).length) break;
        continue;
      }
      board = applyMove(board, moves[moves.length - 1].index, player);
      player = opponent(player);
    }
    const legal = getLegalMoves(board, player);
    expect(legal.length).toBeGreaterThan(0);

    function exact(position: Board, turn: Player, perspective: Player): number {
      const moves = getLegalMoves(position, turn);
      const other = opponent(turn);
      if (!moves.length) {
        if (getLegalMoves(position, other).length)
          return exact(position, other, perspective);
        const score = getScore(position);
        return perspective === 1
          ? score.black - score.white
          : score.white - score.black;
      }
      const values = moves.map(({ index }) =>
        exact(applyMove(position, index, turn), other, perspective),
      );
      return turn === perspective ? Math.max(...values) : Math.min(...values);
    }

    const bestScore = Math.max(
      ...legal.map(({ index }) =>
        exact(applyMove(board, index, player), opponent(player), player),
      ),
    );
    const cpuIndex = chooseCpuMove(board, player, "hard")!;
    expect(
      exact(applyMove(board, cpuIndex, player), opponent(player), player),
    ).toBe(bestScore);
  });
});
