/** Pure Othello rules. Black moves first. Board cells use row-major order. */
export type Player = 1 | 2;
export type Board = number[];
export type Difficulty = "easy" | "normal" | "hard";

export interface Move {
  index: number;
  flips: number[];
}

const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

export function opponent(player: Player): Player {
  return player === 1 ? 2 : 1;
}

export function createBoard(): Board {
  const board = Array<number>(64).fill(0);
  board[27] = board[36] = 2;
  board[28] = board[35] = 1;
  return board;
}

/** Reject malformed boards at an external boundary, before using the rules. */
export function isBoard(value: unknown): value is Board {
  if (!Array.isArray(value) || value.length !== 64) return false;
  // Check every index, including holes in a sparse array.
  for (let i = 0; i < 64; i++) {
    if (value[i] !== 0 && value[i] !== 1 && value[i] !== 2) return false;
  }
  return true;
}

export function getFlips(
  board: Board,
  index: number,
  player: Player,
): number[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 64 ||
    board[index] !== 0
  )
    return [];
  const row = Math.floor(index / 8);
  const col = index % 8;
  const other = opponent(player);
  const flips: number[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr;
    let c = col + dc;
    const line: number[] = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === other) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (
      line.length &&
      r >= 0 &&
      r < 8 &&
      c >= 0 &&
      c < 8 &&
      board[r * 8 + c] === player
    ) {
      flips.push(...line);
    }
  }
  return flips;
}

export function getLegalMoves(board: Board, player: Player): Move[] {
  const moves: Move[] = [];
  for (let index = 0; index < 64; index++) {
    if (board[index] !== 0) continue;
    const flips = getFlips(board, index, player);
    if (flips.length) moves.push({ index, flips });
  }
  return moves;
}

function applyKnownMove(board: Board, move: Move, player: Player): Board {
  const next = board.slice();
  next[move.index] = player;
  for (const index of move.flips) next[index] = player;
  return next;
}

/** Return a new board. Illegal moves cannot alter the current board. */
export function applyMove(board: Board, index: number, player: Player): Board {
  if (!isBoard(board) || (player !== 1 && player !== 2))
    throw new Error("Invalid game state.");
  const flips = getFlips(board, index, player);
  if (!flips.length) throw new Error("This tile is not a legal move.");
  return applyKnownMove(board, { index, flips }, player);
}

export function getScore(board: Board): {
  black: number;
  white: number;
  empty: number;
} {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (const cell of board) {
    if (cell === 1) black++;
    else if (cell === 2) white++;
    else empty++;
  }
  return { black, white, empty };
}

/** Call after a move. A game ends when neither player can move, even with empty tiles. */
export function getNextTurn(
  board: Board,
  previousPlayer: Player,
): { turn: Player | null; passed: Player | null } {
  const next = opponent(previousPlayer);
  if (getLegalMoves(board, next).length) return { turn: next, passed: null };
  if (getLegalMoves(board, previousPlayer).length)
    return { turn: previousPlayer, passed: next };
  return { turn: null, passed: null };
}

const WEIGHTS = [
  120, -25, 20, 5, 5, 20, -25, 120, -25, -45, -5, -5, -5, -5, -45, -25, 20, -5,
  15, 3, 3, 15, -5, 20, 5, -5, 3, 3, 3, 3, -5, 5, 5, -5, 3, 3, 3, 3, -5, 5, 20,
  -5, 15, 3, 3, 15, -5, 20, -25, -45, -5, -5, -5, -5, -45, -25, 120, -25, 20, 5,
  5, 20, -25, 120,
];

function evaluate(
  board: Board,
  player: Player,
  ownMoves: number,
  otherMoves: number,
): number {
  const other = opponent(player);
  const { black, white, empty } = getScore(board);
  const difference = player === 1 ? black - white : white - black;
  if (!ownMoves && !otherMoves) {
    return difference === 0
      ? 0
      : Math.sign(difference) * 100_000 + difference * 100;
  }
  let positional = 0;
  let frontier = 0;
  for (let index = 0; index < 64; index++) {
    const cell = board[index];
    if (!cell) continue;
    const sign = cell === player ? 1 : -1;
    positional += WEIGHTS[index] * sign;
    const row = Math.floor(index / 8);
    const col = index % 8;
    if (
      DIRECTIONS.some(([dr, dc]) => {
        const r = row + dr;
        const c = col + dc;
        return r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 0;
      })
    )
      frontier -= sign;
  }
  // Adjacent squares become safe when their corner is held.
  for (const [corner, neighbors] of [
    [0, [1, 8, 9]],
    [7, [6, 14, 15]],
    [56, [48, 49, 57]],
    [63, [54, 55, 62]],
  ] as const) {
    if (!board[corner]) continue;
    for (const index of neighbors) {
      if (board[index] === player) positional += 30;
      else if (board[index] === other) positional -= 30;
    }
  }
  return (
    positional * 2 +
    (ownMoves - otherMoves) * 14 +
    frontier * 6 +
    difference * (empty < 12 ? 18 : empty < 28 ? 3 : -1)
  );
}

function orderedMoves(moves: Move[]): Move[] {
  return moves.sort(
    (a, b) =>
      WEIGHTS[b.index] - WEIGHTS[a.index] ||
      b.flips.length - a.flips.length ||
      a.index - b.index,
  );
}

/**
 * Deterministic, bounded alpha-beta search. Run in cpu.worker.ts to keep input and
 * animations free while the CPU thinks. No clocks or random values enter rules.
 */
export function chooseCpuMove(
  board: Board,
  player: Player,
  difficulty: Difficulty = "normal",
): number | null {
  if (!isBoard(board) || (player !== 1 && player !== 2))
    throw new Error("Invalid game state.");
  const candidates = orderedMoves(getLegalMoves(board, player));
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].index;
  if (difficulty === "easy") {
    // A greedy opponent is approachable, but still recognizes valuable corners.
    return [...candidates].sort(
      (a, b) =>
        b.flips.length * 12 +
          WEIGHTS[b.index] -
          (a.flips.length * 12 + WEIGHTS[a.index]) || a.index - b.index,
    )[0].index;
  }

  const empty = getScore(board).empty;
  const depthLimit =
    difficulty === "hard" ? (empty <= 12 ? empty : 5) : empty <= 8 ? empty : 3;
  const nodeLimit = difficulty === "hard" ? 60_000 : 12_000;
  let nodes = 0;
  let interrupted = false;

  function search(
    position: Board,
    turn: Player,
    depth: number,
    alpha: number,
    beta: number,
  ): number {
    if (++nodes > nodeLimit) {
      interrupted = true;
      return 0;
    }
    const moves = getLegalMoves(position, turn);
    const other = opponent(turn);
    if (!moves.length) {
      if (!getLegalMoves(position, other).length)
        return evaluate(position, turn, 0, 0);
      // A pass consumes no depth: depth counts placements, not turns.
      return -search(position, other, depth, -beta, -alpha);
    }
    if (depth <= 0)
      return evaluate(
        position,
        turn,
        moves.length,
        getLegalMoves(position, other).length,
      );
    let best = -Infinity;
    for (const move of orderedMoves(moves)) {
      const value = -search(
        applyKnownMove(position, move, turn),
        other,
        depth - 1,
        -beta,
        -alpha,
      );
      if (interrupted) return 0;
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return best;
  }

  let bestIndex = candidates[0].index;
  // Commit only complete depths. The node cap therefore cannot produce a partial result.
  for (let depth = 1; depth <= depthLimit; depth++) {
    const ordered = [...candidates].sort(
      (a, b) => Number(b.index === bestIndex) - Number(a.index === bestIndex),
    );
    let iterationBest = bestIndex;
    let bestValue = -Infinity;
    for (const move of ordered) {
      const value = -search(
        applyKnownMove(board, move, player),
        opponent(player),
        depth - 1,
        -Infinity,
        -bestValue,
      );
      if (interrupted) break;
      if (value > bestValue) {
        bestValue = value;
        iterationBest = move.index;
      }
    }
    if (interrupted) break;
    bestIndex = iterationBest;
    if (Math.abs(bestValue) >= 100_000) break;
  }
  return bestIndex;
}
