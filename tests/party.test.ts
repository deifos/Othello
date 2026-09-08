import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Party from "partykit/server";
import OthelloRoom from "../party/server";
import { applyMove, createBoard, getLegalMoves, getNextTurn, getScore } from "../src/game/engine";
import type { Player } from "../src/game/engine";
import { PROTOCOL_VERSION, RECONNECT_GRACE_MS } from "../src/game/protocol";
import type { MatchSnapshot, ServerMessage } from "../src/game/protocol";

const BLACK_TOKEN = "a".repeat(64);
const WHITE_TOKEN = "b".repeat(64);
let requestNumber = 0;

class MemoryStorage {
  values = new Map<string, unknown>();
  alarm: number | null = null;
  failNextWrite = false;
  beforeWrite: (() => Promise<void>) | null = null;

  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) {
    if (this.failNextWrite) { this.failNextWrite = false; throw new Error("Disk unavailable"); }
    if (this.beforeWrite) { const hold = this.beforeWrite; this.beforeWrite = null; await hold(); }
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string) { return this.values.delete(key); }
  async setAlarm(value: number) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
}

class Socket {
  messages: ServerMessage[] = [];
  closed: { code?: number; reason?: string } | null = null;
  constructor(readonly id: string) {}
  send(value: string) { this.messages.push(JSON.parse(value)); }
  close(code?: number, reason?: string) { this.closed = { code, reason }; }
  get connection() { return this as unknown as Party.Connection; }
  get snapshot(): MatchSnapshot {
    const message = [...this.messages].reverse().find((item) => item.type === "snapshot" || item.type === "welcome");
    if (!message || (message.type !== "snapshot" && message.type !== "welcome")) throw new Error("No snapshot");
    return message.snapshot;
  }
  get rejection() { return [...this.messages].reverse().find((item) => item.type === "rejected"); }
}

async function harness(storage = new MemoryStorage(), roomCode = "ABC234") {
  const room = { id: roomCode, storage } as unknown as Party.Room;
  const server = new OthelloRoom(room);
  await server.onStart();
  let socketNumber = 0;
  async function connect(id = `socket-${++socketNumber}`) {
    const socket = new Socket(id);
    await server.onConnect(socket.connection);
    return socket;
  }
  async function raw(socket: Socket, value: unknown) {
    await server.onMessage(JSON.stringify(value), socket.connection);
  }
  async function join(socket: Socket, token: string, create: boolean, extra: Record<string, unknown> = {}) {
    await raw(socket, { version: PROTOCOL_VERSION, type: "join", requestId: `request_${++requestNumber}`, token, name: token === BLACK_TOKEN ? "Black Pal" : "White Pal", styleId: "classic", create, ...extra });
  }
  async function send(socket: Socket, type: string, extra: Record<string, unknown> = {}) {
    const command = { version: PROTOCOL_VERSION, type, requestId: `request_${++requestNumber}`, matchId: socket.snapshot.matchId, expectedRevision: socket.snapshot.revision, ...extra };
    await raw(socket, command);
    return command;
  }
  async function pair(start = true) {
    const black = await connect();
    await join(black, BLACK_TOKEN, true);
    const white = await connect();
    await join(white, WHITE_TOKEN, false);
    if (start) { await send(black, "ready"); await send(white, "ready"); }
    return { black, white };
  }
  return { storage, server, connect, raw, join, send, pair };
}

beforeEach(() => { requestNumber = 0; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => vi.useRealTimers());

describe("authoritative PartyKit rooms", () => {
  it("requires explicit creation and a valid room code", async () => {
    const h = await harness();
    const stranger = await h.connect();
    await h.join(stranger, BLACK_TOKEN, false);
    expect(stranger.rejection).toMatchObject({ code: "room-not-found" });
    expect(h.storage.values.size).toBe(0);
    expect(stranger.messages.some((item) => item.type === "snapshot")).toBe(false);
    const invalid = await harness(new MemoryStorage(), "A0?234");
    expect((await invalid.connect()).closed?.code).toBe(4001);
    expect(invalid.storage.values.size).toBe(0);
  });

  it("assigns seats and keeps private tokens, hashes, and room updates from strangers", async () => {
    const h = await harness();
    const observer = await h.connect();
    const { black, white } = await h.pair(false);
    expect(black.snapshot.players.map((player) => player.color)).toEqual([1, 2]);
    const welcome = black.messages.find((item) => item.type === "welcome");
    expect(welcome).toMatchObject({ playerId: black.snapshot.players[0].id });
    expect(observer.messages).toEqual([]);
    await h.join(observer, "c".repeat(64), false);
    expect(observer.rejection).toMatchObject({ code: "room-full" });
    await h.join(observer, "d".repeat(64), true);
    expect(observer.rejection).toMatchObject({ code: "room-exists" });
    const stored = JSON.stringify([...h.storage.values.values()]);
    expect(stored).not.toContain(BLACK_TOKEN);
    expect(stored).not.toContain(WHITE_TOKEN);
    const publicData = JSON.stringify([...black.messages, ...white.messages, ...observer.messages]);
    expect(publicData).not.toContain("tokenHash");
    expect(publicData).not.toContain(BLACK_TOKEN);
    expect(publicData).not.toContain(WHITE_TOKEN);
    const hashed = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BLACK_TOKEN))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(stored).toContain(hashed);
    expect(publicData).not.toContain(hashed);
  });

  it("starts only when both players are ready, and does not trust client-supplied players or boards", async () => {
    const h = await harness();
    const { black, white } = await h.pair(false);
    await h.send(black, "move", { index: 19 });
    expect(black.rejection).toMatchObject({ code: "not-playing" });
    await h.send(black, "ready");
    expect(black.snapshot.phase).toBe("waiting");
    await h.send(white, "ready");
    expect(white.snapshot.phase).toBe("playing");
    expect(white.snapshot.turn).toBe(1);
    const initial = black.snapshot;
    await h.send(white, "move", { index: 19 });
    expect(white.rejection).toMatchObject({ code: "not-your-turn" });
    await h.send(white, "move", { index: 19, player: 1 });
    expect(white.rejection).toMatchObject({ code: "invalid-request" });
    await h.send(black, "move", { index: 19, board: Array(64).fill(1) });
    expect(black.rejection).toMatchObject({ code: "invalid-request" });
    await h.send(black, "move", { index: 0 });
    expect(black.rejection).toMatchObject({ code: "invalid-move" });
    expect(black.snapshot.board).toEqual(initial.board);
    expect(black.snapshot.revision).toBe(initial.revision);
  });

  it("runs an entire two-player match, applies forced passes, and computes the final result", async () => {
    const h = await harness();
    const { black, white } = await h.pair();
    let expectedBoard = createBoard();
    let turn: Player | null = 1;
    let moves = 0;
    let passes = 0;
    while (turn) {
      const socket = turn === 1 ? black : white;
      const move = getLegalMoves(expectedBoard, turn)[0];
      const request = await h.send(socket, "move", { index: move.index });
      expectedBoard = applyMove(expectedBoard, move.index, turn);
      const next = getNextTurn(expectedBoard, turn);
      if (next.passed) passes++;
      moves++;
      expect(socket.snapshot.board).toEqual(expectedBoard);
      expect(white.snapshot).toEqual(black.snapshot);
      expect(socket.snapshot.lastMove).toEqual({ ...move, player: turn });
      expect(socket.snapshot.passed).toBe(next.passed);
      expect(socket.messages.at(-1)).toMatchObject({ type: "snapshot", acceptedRequestId: request.requestId });
      turn = next.turn;
      expect(moves).toBeLessThanOrEqual(60);
    }
    const score = getScore(expectedBoard);
    expect(passes).toBeGreaterThan(0);
    expect(black.snapshot.phase).toBe("finished");
    expect(black.snapshot.moveCount).toBe(moves);
    expect(black.snapshot.result).toEqual({ winner: score.black === score.white ? null : score.black > score.white ? 1 : 2, reason: "complete" });
    expect(black.snapshot.endedAt).not.toBeNull();
  });

  it("rejects stale versions and revisions, resyncs, and acknowledges duplicates without applying twice", async () => {
    const h = await harness();
    const { black, white } = await h.pair();
    const old = black.snapshot;
    const accepted = await h.send(black, "move", { index: 19 });
    const moved = black.snapshot;
    await h.raw(black, accepted);
    expect(black.snapshot).toEqual(moved);
    expect(black.messages.at(-1)).toMatchObject({ acceptedRequestId: accepted.requestId });
    await h.send(white, "move", { index: getLegalMoves(moved.board, 2)[0].index, expectedRevision: old.revision });
    expect(white.rejection).toMatchObject({ code: "stale-revision" });
    expect(white.snapshot).toEqual(moved);
    await h.send(white, "sync", { matchId: "previous-match", expectedRevision: 0 });
    expect(white.messages.at(-1)).toMatchObject({ type: "snapshot", snapshot: moved, acceptedRequestId: expect.any(String) });
    await h.send(white, "move", { index: 18, version: 1 });
    expect(white.rejection).toMatchObject({ code: "invalid-request" });
    expect(white.snapshot.board).toEqual(moved.board);
  });

  it("serializes concurrent writes and never broadcasts a move before it is saved", async () => {
    const h = await harness();
    const { black, white } = await h.pair();
    let release!: () => void;
    let entered!: () => void;
    const isWriting = new Promise<void>((resolve) => { entered = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    h.storage.beforeWrite = async () => { entered(); await hold; };
    const first = h.send(black, "move", { index: 19 });
    await isWriting;
    const second = h.send(black, "move", { index: 26 });
    expect(black.snapshot.moveCount).toBe(0);
    expect(white.snapshot.moveCount).toBe(0);
    release();
    await Promise.all([first, second]);
    expect(black.snapshot.moveCount).toBe(1);
    expect(black.rejection).toMatchObject({ code: "stale-revision" });
    const saved = [...h.storage.values.values()][0] as { snapshot: MatchSnapshot };
    expect(saved.snapshot.board).toEqual(black.snapshot.board);
  });

  it("recovers from a failed storage write without changing or broadcasting the board", async () => {
    const h = await harness();
    const { black } = await h.pair();
    const before = black.snapshot;
    h.storage.failNextWrite = true;
    const failed = await h.send(black, "move", { index: 19 });
    expect(black.rejection).toMatchObject({ code: "invalid-request" });
    expect(black.snapshot.board).toEqual(before.board);
    expect(black.snapshot.revision).toBe(before.revision);
    await h.raw(black, failed);
    expect(black.snapshot.moveCount).toBe(1);
    expect(black.snapshot.board).toEqual(applyMove(before.board, 19, 1));
  });

  it("retains a seat across reconnects and counts all tabs before pausing the match", async () => {
    const h = await harness();
    const { black, white } = await h.pair();
    const seatId = black.snapshot.players[0].id;
    const extra = await h.connect();
    await h.join(extra, BLACK_TOKEN, false);
    expect(extra.snapshot.players).toHaveLength(2);
    await h.server.onClose(black.connection);
    expect(white.snapshot.players[0].connected).toBe(true);
    await h.server.onClose(extra.connection);
    expect(white.snapshot.players[0]).toMatchObject({ connected: false, disconnectedAt: Date.now() });
    await h.send(white, "move", { index: 19 });
    expect(white.rejection).toMatchObject({ code: "opponent-offline" });
    vi.setSystemTime(Date.now() + RECONNECT_GRACE_MS - 1);
    const returned = await h.connect();
    await h.join(returned, BLACK_TOKEN, false);
    expect(returned.messages.find((item) => item.type === "welcome")).toMatchObject({ playerId: seatId });
    expect(returned.snapshot.players[0]).toMatchObject({ connected: true, disconnectedAt: null });
    await h.send(returned, "move", { index: 19 });
    expect(white.snapshot.moveCount).toBe(1);
    await h.server.onAlarm();
    expect(white.snapshot.phase).toBe("playing");
  });

  it("awards a disconnect win only to a connected opponent; otherwise the match is abandoned", async () => {
    for (const disconnectBoth of [false, true]) {
      const h = await harness();
      const { black, white } = await h.pair();
      await h.server.onClose(black.connection);
      if (disconnectBoth) await h.server.onClose(white.connection);
      vi.setSystemTime(Date.now() + RECONNECT_GRACE_MS);
      await h.server.onAlarm();
      const saved = [...h.storage.values.values()][0] as { snapshot: MatchSnapshot };
      expect(saved.snapshot.phase).toBe("finished");
      expect(saved.snapshot.turn).toBeNull();
      expect(saved.snapshot.result).toEqual({ winner: disconnectBoth ? null : 2, reason: disconnectBoth ? "abandoned" : "disconnect" });
      if (!disconnectBoth) expect(white.snapshot.result).toEqual(saved.snapshot.result);
    }
  });

  it("preserves the game and command receipts across a server restart", async () => {
    const h = await harness();
    const { black } = await h.pair();
    const accepted = await h.send(black, "move", { index: 19 });
    const before = black.snapshot;
    const restarted = await harness(h.storage);
    const returnedBlack = await restarted.connect();
    await restarted.join(returnedBlack, BLACK_TOKEN, false);
    expect(returnedBlack.snapshot.board).toEqual(before.board);
    expect(returnedBlack.snapshot.players[1].connected).toBe(false);
    const returnedWhite = await restarted.connect();
    await restarted.join(returnedWhite, WHITE_TOKEN, false);
    await restarted.raw(returnedBlack, accepted);
    expect(returnedBlack.snapshot.moveCount).toBe(1);
    expect(returnedBlack.messages.at(-1)).toMatchObject({ acceptedRequestId: accepted.requestId });
    await restarted.send(returnedWhite, "move", { index: getLegalMoves(before.board, 2)[0].index });
    expect(returnedBlack.snapshot.moveCount).toBe(2);
  });

  it("surrenders, requires both rematch votes, swaps colors, and preserves old command deduplication", async () => {
    const h = await harness();
    const { black, white } = await h.pair();
    const firstId = black.snapshot.matchId;
    await h.send(black, "surrender");
    expect(white.snapshot.result).toEqual({ winner: 2, reason: "surrender" });
    await h.send(black, "rematch");
    expect(black.snapshot.phase).toBe("finished");
    expect(black.snapshot.players[0].wantsRematch).toBe(true);
    const accepted = await h.send(white, "rematch");
    expect(white.snapshot.matchId).not.toBe(firstId);
    expect(white.snapshot.players.map((player) => player.color)).toEqual([2, 1]);
    expect(white.snapshot.board).toEqual(createBoard());
    expect(white.snapshot.phase).toBe("playing");
    expect(white.snapshot.result).toBeNull();
    const newId = white.snapshot.matchId;
    await h.raw(white, accepted);
    expect(white.snapshot.matchId).toBe(newId);
    await h.send(white, "move", { index: 19 });
    expect(black.snapshot.moveCount).toBe(1);
  });

  it("relinquishes a waiting seat in every tab and allows a new friend to join", async () => {
    const h = await harness();
    const { black, white } = await h.pair(false);
    const extra = await h.connect();
    await h.join(extra, BLACK_TOKEN, false);
    await h.send(white, "ready");
    await h.send(black, "leave");
    expect(black.messages.at(-1)).toMatchObject({ type: "left" });
    expect(extra.messages.at(-1)).toMatchObject({ type: "left" });
    expect(black.closed?.code).toBe(1000);
    expect(white.snapshot.players).toHaveLength(1);
    expect(white.snapshot.players[0].ready).toBe(false);
    const newcomer = await h.connect();
    await h.join(newcomer, "c".repeat(64), false);
    expect(newcomer.snapshot.players).toHaveLength(2);
    expect(newcomer.snapshot.players[1].color).toBe(1);
  });

  it("forfeits a match on explicit leave, and removes an empty waiting room", async () => {
    const h = await harness();
    const { black, white } = await h.pair();
    await h.send(black, "leave");
    expect(black.messages.at(-1)).toMatchObject({ type: "left" });
    expect(white.snapshot.result).toEqual({ winner: 2, reason: "surrender" });
    const empty = await harness();
    const solo = await empty.connect();
    await empty.join(solo, BLACK_TOKEN, true);
    await empty.send(solo, "leave");
    expect(empty.storage.values.size).toBe(0);
    expect(empty.storage.alarm).toBeNull();
  });

  it("expires waiting seats, closes unjoined sockets, and clears idle rooms", async () => {
    const h = await harness();
    const { black, white } = await h.pair(false);
    const pending = await h.connect();
    vi.setSystemTime(Date.now() + 10_000);
    await h.server.onAlarm();
    expect(pending.closed?.reason).toBe("Join timed out");
    expect(black.closed).toBeNull();
    await h.server.onClose(black.connection);
    vi.setSystemTime(Date.now() + RECONNECT_GRACE_MS);
    await h.server.onAlarm();
    expect(white.snapshot.players).toHaveLength(1);
    vi.setSystemTime(Date.now() + 30 * 60_000);
    await h.server.onAlarm();
    expect(white.messages.at(-1)).toMatchObject({ type: "left" });
    expect(h.storage.values.size).toBe(0);
    expect(h.storage.alarm).toBeNull();
  });

  it("bounds malformed payloads and request floods without changing the board", async () => {
    const h = await harness();
    const { black } = await h.pair();
    const before = black.snapshot;
    await h.server.onMessage("x".repeat(4097), black.connection);
    expect(black.rejection).toMatchObject({ code: "invalid-request" });
    await h.server.onMessage(new Uint8Array([1, 2]), black.connection);
    expect(black.rejection).toMatchObject({ code: "invalid-request" });
    for (let i = 0; i < 65; i++) await h.send(black, "sync");
    expect(black.rejection).toMatchObject({ code: "rate-limited" });
    expect(black.snapshot.board).toEqual(before.board);
    vi.setSystemTime(Date.now() + 10_000);
    await h.send(black, "move", { index: 19 });
    expect(black.snapshot.moveCount).toBe(1);
  });

  it("does not let a slow storage write create an unbounded command queue", async () => {
    const h = await harness();
    const { black } = await h.pair();
    let release!: () => void;
    let entered!: () => void;
    const isWriting = new Promise<void>((resolve) => { entered = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    h.storage.beforeWrite = async () => { entered(); await hold; };
    const first = h.send(black, "move", { index: 19 });
    await isWriting;
    const queued = Array.from({ length: 30 }, () => h.send(black, "sync"));
    expect(black.rejection).toMatchObject({ code: "rate-limited" });
    expect(black.snapshot.moveCount).toBe(0);
    release();
    await Promise.all([first, ...queued]);
    expect(black.snapshot.moveCount).toBe(1);
  });
});
