import {
  applyMove,
  createBoard,
  getNextTurn,
  getScore,
} from "../src/game/engine";
import type { Difficulty, Player } from "../src/game/engine";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Send a JSON object.");
  return value as Record<string, unknown>;
}

export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value))
    throw new HttpError(400, "Invalid ID.");
  return value;
}

export function playerDetails(value: Record<string, unknown>): {
  name: string;
  styleId: string;
} {
  if (typeof value.name !== "string" || typeof value.styleId !== "string")
    throw new HttpError(400, "A name and style are required.");
  const name = value.name.normalize("NFC").trim().replace(/ +/g, " ");
  if ([...name].length < 1 || [...name].length > 32 || /\p{Cc}/u.test(name)) {
    throw new HttpError(
      400,
      "Use a name of 1 to 32 characters without control characters.",
    );
  }
  const styleId = value.styleId;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(styleId))
    throw new HttpError(400, "Invalid style.");
  return { name, styleId };
}

export interface VerifiedMatch {
  id: string;
  difficulty: Difficulty;
  moves: number[];
  surrendered: boolean;
  black: number;
  white: number;
  outcome: "win" | "loss" | "draw";
  points: number;
}

/** Only the move record is used. Client dates, piece counts, and outcomes are ignored. */
export function verifyMatch(value: unknown): VerifiedMatch {
  const match = object(value);
  const id = identifier(match.id);
  if (!["easy", "normal", "hard"].includes(match.difficulty as string))
    throw new HttpError(400, "Invalid difficulty.");
  if (typeof match.surrendered !== "boolean")
    throw new HttpError(400, "Set the match status.");
  if (
    !Array.isArray(match.moves) ||
    match.moves.length > 60 ||
    !match.moves.every(
      (index) => Number.isInteger(index) && index >= 0 && index < 64,
    )
  ) {
    throw new HttpError(400, "Invalid move record.");
  }
  const moves = match.moves as number[];
  let board = createBoard();
  let turn: Player | null = 1;
  for (const index of moves) {
    if (turn === null)
      throw new HttpError(
        400,
        "The move record continues after the match ended.",
      );
    try {
      board = applyMove(board, index, turn);
    } catch {
      throw new HttpError(400, "The move record contains an illegal move.");
    }
    turn = getNextTurn(board, turn).turn;
  }
  if (!match.surrendered && turn !== null)
    throw new HttpError(400, "The match is not complete.");
  if (match.surrendered && turn === null)
    throw new HttpError(400, "A completed match cannot be surrendered.");
  const { black, white } = getScore(board);
  const outcome = match.surrendered
    ? "loss"
    : black > white
      ? "win"
      : black < white
        ? "loss"
        : "draw";
  return {
    id,
    difficulty: match.difficulty as Difficulty,
    moves,
    surrendered: match.surrendered,
    black,
    white,
    outcome,
    points: outcome === "win" ? 30 : outcome === "draw" ? 10 : 0,
  };
}
