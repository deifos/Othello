import type { Board, Player } from "./engine";

/** Shared wire contract for the next phase. No network service is active in local play. */
export const PROTOCOL_VERSION = 1 as const;

export interface MatchPlayer {
  id: string;
  name: string;
  styleId: string;
  color: Player;
  connected: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  revision: number;
  board: Board;
  turn: Player | null;
  players: MatchPlayer[];
  phase: "waiting" | "playing" | "finished";
  result: {
    winner: Player | null;
    reason: "complete" | "surrender" | "disconnect";
  } | null;
  lastMove: { index: number; flips: number[]; player: Player } | null;
  passed: Player | null;
  startedAt: number | null;
  updatedAt: number;
}

interface CommandEnvelope {
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  matchId: string;
  expectedRevision: number;
}

/** A server derives player identity from the connection, never from a move claim. */
export type ClientCommand = CommandEnvelope &
  (
    | { type: "move"; index: number }
    | { type: "surrender" }
    | { type: "ready"; styleId: string }
    | { type: "rematch" }
    | { type: "sync" }
  );

export type ServerMessage = { version: typeof PROTOCOL_VERSION } & (
  | { type: "snapshot"; snapshot: MatchSnapshot; acceptedRequestId?: string }
  | {
      type: "rejected";
      requestId: string;
      code:
        | "invalid-move"
        | "stale-revision"
        | "not-your-turn"
        | "not-playing"
        | "unauthorized";
      message: string;
      revision: number;
    }
  | { type: "presence"; playerId: string; connected: boolean }
);

export interface TransportConnection {
  matchId: string;
  /** A short-lived token supplied by a future authenticated backend. */
  sessionToken: string;
}

/**
 * Implement this with a PartyKit connection in phase two. The server owns the
 * board, validates legal moves with engine.ts, increments revisions, and writes
 * verified results to a leaderboard. Ignore duplicate request IDs. Reconnect
 * with a full snapshot. Never publish local CPU results as global ranked wins.
 */
export interface MatchTransport {
  connect(connection: TransportConnection): Promise<void>;
  send(command: ClientCommand): Promise<void>;
  subscribe(listener: (message: ServerMessage) => void): () => void;
  disconnect(): void;
}
