import type { Board, Player } from "./engine";

export const PROTOCOL_VERSION = 2 as const;
export const RECONNECT_GRACE_MS = 60_000;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export interface MatchPlayer {
  id: string;
  name: string;
  styleId: string;
  color: Player;
  connected: boolean;
  ready: boolean;
  wantsRematch: boolean;
  disconnectedAt: number | null;
}

export interface MatchSnapshot {
  roomCode: string;
  matchId: string;
  revision: number;
  board: Board;
  turn: Player | null;
  players: MatchPlayer[];
  phase: "waiting" | "playing" | "finished";
  result: {
    winner: Player | null;
    reason: "complete" | "surrender" | "disconnect" | "abandoned";
  } | null;
  lastMove: { index: number; flips: number[]; player: Player } | null;
  passed: Player | null;
  moveCount: number;
  startedAt: number | null;
  endedAt: number | null;
  updatedAt: number;
  serverTime: number;
}

export interface JoinCommand {
  version: typeof PROTOCOL_VERSION;
  type: "join";
  requestId: string;
  /** A private random 256-bit seat key. Never included in a public snapshot. */
  token: string;
  name: string;
  styleId: string;
  create: boolean;
}

interface CommandEnvelope {
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  matchId: string;
  expectedRevision: number;
}

/** The room derives the player from the authenticated connection. */
export type ClientCommand = CommandEnvelope & (
  | { type: "move"; index: number }
  | { type: "surrender" }
  | { type: "ready" }
  | { type: "rematch" }
  | { type: "leave" }
  | { type: "sync" }
);

export type RejectionCode = "invalid-request" | "invalid-move" | "stale-revision" |
  "not-your-turn" | "not-playing" | "unauthorized" | "room-full" |
  "room-not-found" | "room-exists" | "opponent-offline" | "rate-limited";

export type ServerMessage = { version: typeof PROTOCOL_VERSION } & (
  | { type: "welcome"; playerId: string; snapshot: MatchSnapshot }
  | { type: "snapshot"; snapshot: MatchSnapshot; acceptedRequestId?: string }
  | { type: "rejected"; requestId: string; code: RejectionCode; message: string; revision: number }
  | { type: "left" }
);
