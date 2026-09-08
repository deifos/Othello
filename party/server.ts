import type * as Party from "partykit/server";
import { applyMove, createBoard, getFlips, getNextTurn, getScore, opponent } from "../src/game/engine";
import type { Player } from "../src/game/engine";
import { PROTOCOL_VERSION, RECONNECT_GRACE_MS, ROOM_CODE_PATTERN } from "../src/game/protocol";
import type { ClientCommand, JoinCommand, MatchSnapshot, RejectionCode, ServerMessage } from "../src/game/protocol";
import { CHARACTER_STYLES } from "../src/styles/characters";

type RoomConnection = Pick<Party.Connection, "id" | "send" | "close">;

const STORAGE_KEY = "match-v2";
const JOIN_TIMEOUT_MS = 10_000;
const WAITING_TTL_MS = 30 * 60_000;
const PLAYING_TTL_MS = 2 * 60 * 60_000;
const FINISHED_TTL_MS = 30 * 60_000;
const MAX_CONNECTIONS = 12;
const MAX_SEAT_CONNECTIONS = 4;
const MAX_ACCEPTED_REQUESTS = 256;
const STYLES = new Set(CHARACTER_STYLES.map((style) => style.id));

interface StoredMatch {
  schema: 2;
  snapshot: MatchSnapshot;
  /** Hashes and command receipts are never sent to a client. */
  tokenHashes: Record<string, string>;
  accepted: { playerId: string; matchId: string; requestId: string }[];
  expiresAt: number;
}

interface Session {
  connection: RoomConnection;
  playerId: string | null;
  joinDeadline: number;
  windowStarted: number;
  messages: number;
  pendingMessages: number;
}

function requestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validJoin(value: Record<string, unknown>): value is Record<string, unknown> & JoinCommand {
  return hasOnly(value, ["version", "type", "requestId", "token", "name", "styleId", "create"])
    && typeof value.token === "string" && /^[a-f0-9]{64}$/i.test(value.token)
    && typeof value.name === "string" && value.name.trim().length > 0 && Array.from(value.name).length <= 24
    && !/[\u0000-\u001f\u007f]/.test(value.name)
    && typeof value.styleId === "string" && STYLES.has(value.styleId)
    && typeof value.create === "boolean";
}

function validCommand(value: Record<string, unknown>): value is Record<string, unknown> & ClientCommand {
  return ["move", "ready", "surrender", "rematch", "leave", "sync"].includes(String(value.type))
    && hasOnly(value, ["version", "type", "requestId", "matchId", "expectedRevision", ...(value.type === "move" ? ["index"] : [])])
    && typeof value.matchId === "string" && value.matchId.length > 0 && value.matchId.length <= 80
    && Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= 0
    && (value.type !== "move" || (Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < 64));
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token.toLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The room owns all game state. Clients send intent, never boards or scores. */
export default class OthelloRoom implements Party.Server {
  readonly options = { hibernate: false };
  private record: StoredMatch | null = null;
  private sessions = new Map<string, Session>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly room: Pick<Party.Room, "id" | "storage">) {}

  static async onFetch(request: Party.Request, lobby: Party.FetchLobby) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) {
        return Response.json({ error: "This origin is not allowed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      // PartyKit caches the first stub host. Validate the public origin before
      // forwarding, so local host aliases do not inherit that cached host.
      const headers = new Headers(Array.from(request.headers.entries()));
      headers.delete("origin");
      const forwarded = new Request(request as unknown as Request, { headers });
      const response = await lobby.parties.practice.get("global").fetch(url.pathname + url.search, forwarded);
      if (!origin) return response;
      const result = new Response(response.body, response);
      result.headers.set("Access-Control-Allow-Origin", origin);
      result.headers.append("Vary", "Origin");
      return result;
    }
    return undefined;
  }

  static onBeforeConnect(request: Party.Request, lobby: Party.Lobby) {
    return ROOM_CODE_PATTERN.test(lobby.id)
      ? request
      : new Response("Use a six-character room code.", { status: 400 });
  }

  private serial(work: () => Promise<void>) {
    const next = this.queue.then(work);
    // A failed storage write must not block later connections or commands.
    this.queue = next.catch(() => undefined);
    return next;
  }

  onStart() {
    return this.serial(async () => {
      this.record = await this.room.storage.get<StoredMatch>(STORAGE_KEY) ?? null;
      if (this.record) {
        const next = structuredClone(this.record);
        let changed = false;
        for (const player of next.snapshot.players) {
          if (player.connected) {
            player.connected = false;
            player.disconnectedAt = Date.now();
            changed = true;
          }
        }
        if (changed) {
          next.snapshot.revision++;
          next.snapshot.updatedAt = Date.now();
          await this.save(next);
        }
      }
      await this.expire();
      await this.scheduleAlarm();
    });
  }

  onConnect(connection: RoomConnection) {
    return this.serial(async () => {
      if (!ROOM_CODE_PATTERN.test(this.room.id) || this.sessions.size >= MAX_CONNECTIONS) {
        this.send(connection, { version: PROTOCOL_VERSION, type: "rejected", requestId: "", code: "rate-limited", message: "This room has too many connections. Try again shortly.", revision: this.record?.snapshot.revision ?? 0 });
        connection.close(4001, "Connection not available");
        return;
      }
      const now = Date.now();
      this.sessions.set(connection.id, { connection, playerId: null, joinDeadline: now + JOIN_TIMEOUT_MS, windowStarted: now, messages: 0, pendingMessages: 0 });
      await this.scheduleAlarm();
    });
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, connection: RoomConnection) {
    const session = this.sessions.get(connection.id);
    if (!session) return Promise.resolve();
    const now = Date.now();
    if (now - session.windowStarted >= 10_000) {
      session.windowStarted = now;
      session.messages = 0;
    }
    // Bound the queue before a storage write or token hash can yield to more frames.
    if (++session.messages > (session.playerId ? 60 : 12) || session.pendingMessages >= 16) {
      this.reject(session, "", "rate-limited", "Too many requests. Wait a moment, then try again.");
      return Promise.resolve();
    }
    if (typeof message !== "string" || message.length > 4096) {
      this.reject(session, "", "invalid-request", "Send a valid game command.");
      return Promise.resolve();
    }
    session.pendingMessages++;
    const pending = this.serial(async () => {
      await this.expire();
      if (this.sessions.get(connection.id) !== session) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(message);
      } catch {
        this.reject(session, "", "invalid-request", "Send a valid game command.");
        return;
      }
      const id = isObject(parsed) && requestId(parsed.requestId) ? parsed.requestId : "";
      if (!isObject(parsed) || parsed.version !== PROTOCOL_VERSION || !id) {
        this.reject(session, id, "invalid-request", "This command is not supported. Reload the game.");
        return;
      }
      try {
        if (parsed.type === "join") {
          if (!validJoin(parsed)) this.reject(session, id, "invalid-request", "Check your name, pill style, and room details.");
          else await this.join(session, parsed);
        } else if (!validCommand(parsed)) {
          this.reject(session, id, "invalid-request", "This game command is not valid.");
        } else {
          await this.command(session, parsed);
        }
      } catch {
        // No private data or storage error details cross the WebSocket boundary.
        this.reject(session, id, "invalid-request", "The move could not be saved. Try again.");
      }
    });
    return pending.finally(() => { session.pendingMessages--; });
  }

  onClose(connection: RoomConnection) {
    // Complete the WebSocket close handshake, including abrupt reloads.
    try { connection.close(1000, "Connection closed"); } catch { /* Already closed. */ }
    return this.serial(async () => {
      const session = this.sessions.get(connection.id);
      this.sessions.delete(connection.id);
      if (session?.playerId && this.record && !this.hasConnectedSeat(session.playerId)) {
        const next = structuredClone(this.record);
        const player = next.snapshot.players.find((item) => item.id === session.playerId);
        if (player?.connected) {
          player.connected = false;
          player.disconnectedAt = Date.now();
          this.touch(next);
          await this.save(next);
          this.broadcast();
        }
      }
      await this.scheduleAlarm();
    });
  }

  onError(connection: RoomConnection) {
    return this.onClose(connection);
  }

  onAlarm() {
    return this.serial(async () => {
      await this.expire();
      await this.scheduleAlarm();
    });
  }

  onRequest() {
    // This endpoint discloses no room state, identity, or private seat key.
    return new Response(JSON.stringify({ service: "Flip Buddies multiplayer", version: PROTOCOL_VERSION }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  private snapshot(): MatchSnapshot {
    return { ...this.record!.snapshot, serverTime: Date.now() };
  }

  private send(connection: RoomConnection, message: ServerMessage) {
    try { connection.send(JSON.stringify(message)); } catch { /* onClose handles presence. */ }
  }

  private sendSnapshot(session: Session, acceptedRequestId?: string) {
    if (!this.record || !session.playerId) return;
    this.send(session.connection, { version: PROTOCOL_VERSION, type: "snapshot", snapshot: this.snapshot(), ...(acceptedRequestId ? { acceptedRequestId } : {}) });
  }

  private broadcast(acceptedRequestId?: string) {
    for (const session of this.sessions.values()) {
      if (session.playerId) this.sendSnapshot(session, acceptedRequestId);
    }
  }

  private reject(session: Session, id: string, code: RejectionCode, message: string) {
    this.send(session.connection, { version: PROTOCOL_VERSION, type: "rejected", requestId: id, code, message, revision: this.record?.snapshot.revision ?? 0 });
    // Rejections repair a stale client, but unauthenticated clients see no board.
    if (session.playerId) this.sendSnapshot(session);
  }

  private hasConnectedSeat(playerId: string) {
    return [...this.sessions.values()].some((session) => session.playerId === playerId);
  }

  private touch(next: StoredMatch) {
    const now = Date.now();
    next.snapshot.revision++;
    next.snapshot.updatedAt = now;
    next.expiresAt = now + (next.snapshot.phase === "playing" ? PLAYING_TTL_MS : next.snapshot.phase === "finished" ? FINISHED_TTL_MS : WAITING_TTL_MS);
  }

  private async save(next: StoredMatch) {
    // Assign only after persistence. A failed write cannot publish an uncommitted move.
    await this.room.storage.put(STORAGE_KEY, next);
    this.record = next;
  }

  private startIfReady(next: StoredMatch) {
    const snapshot = next.snapshot;
    if (snapshot.phase === "waiting" && snapshot.players.length === 2 && snapshot.players.every((player) => player.ready && player.connected)) {
      snapshot.phase = "playing";
      snapshot.turn = 1;
      snapshot.startedAt = Date.now();
    }
  }

  private async join(session: Session, command: JoinCommand) {
    const tokenHash = await hashToken(command.token);
    const existing = this.record?.snapshot.players.find((player) => this.record?.tokenHashes[player.id] === tokenHash);
    if (session.playerId && session.playerId !== existing?.id) {
      this.reject(session, command.requestId, "unauthorized", "Leave your current seat before joining again.");
      return;
    }
    if (!this.record && !command.create) {
      this.reject(session, command.requestId, "room-not-found", "This room was not found. Check the code or create a new room.");
      return;
    }
    if (this.record && !existing && command.create) {
      this.reject(session, command.requestId, "room-exists", "This room code is in use. Create a room with a new code.");
      return;
    }
    if (this.record && !existing && (this.record.snapshot.players.length >= 2 || this.record.snapshot.phase !== "waiting")) {
      this.reject(session, command.requestId, "room-full", "This room already has two players.");
      return;
    }
    if (existing && [...this.sessions.values()].filter((item) => item.playerId === existing.id && item !== session).length >= MAX_SEAT_CONNECTIONS) {
      this.reject(session, command.requestId, "rate-limited", "Your pill is open in too many tabs. Close one tab and try again.");
      return;
    }
    const now = Date.now();
    const next: StoredMatch = this.record ? structuredClone(this.record) : {
      schema: 2,
      snapshot: {
        roomCode: this.room.id, matchId: crypto.randomUUID(), revision: 0, board: createBoard(), turn: null,
        players: [], phase: "waiting", result: null, lastMove: null, passed: null, moveCount: 0,
        startedAt: null, endedAt: null, updatedAt: now, serverTime: now,
      },
      tokenHashes: {}, accepted: [], expiresAt: now + WAITING_TTL_MS,
    };
    let player = next.snapshot.players.find((item) => item.id === existing?.id);
    if (!player) {
      const color: Player = next.snapshot.players.some((item) => item.color === 1) ? 2 : 1;
      player = { id: crypto.randomUUID(), name: command.name.trim(), styleId: command.styleId, color, connected: true, ready: false, wantsRematch: false, disconnectedAt: null };
      next.snapshot.players.push(player);
      next.tokenHashes[player.id] = tokenHash;
    } else {
      player.connected = true;
      player.disconnectedAt = null;
      if (next.snapshot.phase === "waiting") {
        player.name = command.name.trim();
        player.styleId = command.styleId;
      }
    }
    this.startIfReady(next);
    this.touch(next);
    await this.save(next);
    session.playerId = player.id;
    this.send(session.connection, { version: PROTOCOL_VERSION, type: "welcome", playerId: player.id, snapshot: this.snapshot() });
    this.broadcast();
    await this.scheduleAlarm();
  }

  private async command(session: Session, command: ClientCommand) {
    const record = this.record;
    const player = record?.snapshot.players.find((item) => item.id === session.playerId);
    if (!record || !player || !record.tokenHashes[player.id]) {
      this.reject(session, command.requestId, "unauthorized", "Join this room before sending a game command.");
      return;
    }
    if (command.type === "sync" || record.accepted.some((item) => item.playerId === player.id && item.matchId === command.matchId && item.requestId === command.requestId)) {
      this.sendSnapshot(session, command.requestId);
      return;
    }
    if (command.matchId !== record.snapshot.matchId || command.expectedRevision !== record.snapshot.revision) {
      this.reject(session, command.requestId, "stale-revision", "The board has changed. Your game is now up to date.");
      return;
    }
    const next = structuredClone(record);
    const snapshot = next.snapshot;
    const own = snapshot.players.find((item) => item.id === player.id)!;
    const bothConnected = snapshot.players.length === 2 && snapshot.players.every((item) => item.connected);
    if (command.type === "move") {
      if (snapshot.phase !== "playing") {
        this.reject(session, command.requestId, "not-playing", "The match has not started, or it has ended."); return;
      }
      if (!bothConnected) {
        this.reject(session, command.requestId, "opponent-offline", "The match is paused while your friend reconnects."); return;
      }
      if (snapshot.turn !== own.color) {
        this.reject(session, command.requestId, "not-your-turn", "Wait for your turn."); return;
      }
      const flips = getFlips(snapshot.board, command.index, own.color);
      if (!flips.length) {
        this.reject(session, command.requestId, "invalid-move", "Choose a highlighted tile."); return;
      }
      snapshot.board = applyMove(snapshot.board, command.index, own.color);
      Object.assign(snapshot, getNextTurn(snapshot.board, own.color));
      snapshot.lastMove = { index: command.index, flips, player: own.color };
      snapshot.moveCount++;
      if (snapshot.turn === null) {
        const score = getScore(snapshot.board);
        this.finish(next, score.black === score.white ? null : score.black > score.white ? 1 : 2, "complete");
      }
    } else if (command.type === "ready") {
      if (snapshot.phase !== "waiting") {
        this.reject(session, command.requestId, "not-playing", "This match has already started."); return;
      }
      own.ready = true;
      this.startIfReady(next);
    } else if (command.type === "surrender") {
      if (snapshot.phase !== "playing") {
        this.reject(session, command.requestId, "not-playing", "There is no active match to surrender."); return;
      }
      this.finish(next, opponent(own.color), "surrender");
    } else if (command.type === "rematch") {
      if (snapshot.phase !== "finished") {
        this.reject(session, command.requestId, "not-playing", "Finish this match before you play again."); return;
      }
      if (!bothConnected) {
        this.reject(session, command.requestId, "opponent-offline", "Your friend must reconnect before you play again."); return;
      }
      own.wantsRematch = true;
      if (snapshot.players.every((item) => item.wantsRematch)) {
        snapshot.matchId = crypto.randomUUID();
        snapshot.board = createBoard();
        snapshot.phase = "playing";
        snapshot.turn = 1;
        snapshot.result = null;
        snapshot.lastMove = null;
        snapshot.passed = null;
        snapshot.moveCount = 0;
        snapshot.startedAt = Date.now();
        snapshot.endedAt = null;
        for (const item of snapshot.players) {
          item.color = opponent(item.color);
          item.wantsRematch = false;
          item.ready = true;
        }
      }
    } else if (command.type === "leave") {
      if (snapshot.phase === "playing") this.finish(next, opponent(own.color), "surrender");
      if (snapshot.phase === "waiting") {
        snapshot.players = snapshot.players.filter((item) => item.id !== own.id);
        for (const item of snapshot.players) item.ready = false;
      } else {
        own.connected = false;
        own.disconnectedAt = Date.now();
        own.wantsRematch = false;
      }
      delete next.tokenHashes[own.id];
    }
    next.accepted.push({ playerId: player.id, matchId: command.matchId, requestId: command.requestId });
    next.accepted = next.accepted.slice(-MAX_ACCEPTED_REQUESTS);
    this.touch(next);
    await this.save(next);
    if (command.type === "leave") {
      // A seat key may be used in several tabs. Leaving relinquishes the whole seat.
      for (const [id, item] of this.sessions) {
        if (item.playerId === player.id) {
          this.send(item.connection, { version: PROTOCOL_VERSION, type: "left" });
          this.sessions.delete(id);
          item.connection.close(1000, "Left room");
        }
      }
      if (!next.snapshot.players.length) await this.clearRoom();
      else this.broadcast(command.requestId);
    } else this.broadcast(command.requestId);
    await this.scheduleAlarm();
  }

  private finish(next: StoredMatch, winner: Player | null, reason: NonNullable<MatchSnapshot["result"]>["reason"]) {
    next.snapshot.phase = "finished";
    next.snapshot.turn = null;
    next.snapshot.result = { winner, reason };
    next.snapshot.endedAt = Date.now();
    next.snapshot.passed = null;
    for (const player of next.snapshot.players) player.wantsRematch = false;
  }

  private async expire() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (!session.playerId && session.joinDeadline <= now) {
        this.sessions.delete(id);
        session.connection.close(4001, "Join timed out");
      }
    }
    if (!this.record) return;
    const next = structuredClone(this.record);
    const snapshot = next.snapshot;
    const expired = snapshot.players.filter((player) => !player.connected && player.disconnectedAt !== null && player.disconnectedAt + RECONNECT_GRACE_MS <= now);
    let changed = false;
    if (snapshot.phase === "playing" && expired.length) {
      const remaining = snapshot.players.find((player) => player.connected);
      this.finish(next, remaining?.color ?? null, remaining ? "disconnect" : "abandoned");
      changed = true;
    } else if (snapshot.phase === "waiting" && expired.length) {
      for (const player of expired) delete next.tokenHashes[player.id];
      snapshot.players = snapshot.players.filter((player) => !expired.some((item) => item.id === player.id));
      for (const player of snapshot.players) player.ready = false;
      changed = true;
    }
    if (this.record.expiresAt <= now) {
      if (snapshot.phase === "playing") {
        this.finish(next, null, "abandoned");
        changed = true;
      } else {
        await this.clearRoom();
        return;
      }
    }
    if (!snapshot.players.length) {
      await this.clearRoom();
    } else if (changed) {
      this.touch(next);
      await this.save(next);
      this.broadcast();
    }
  }

  private async clearRoom() {
    await this.room.storage.delete(STORAGE_KEY);
    this.record = null;
    for (const [id, session] of this.sessions) {
      if (session.playerId) {
        this.send(session.connection, { version: PROTOCOL_VERSION, type: "left" });
        this.sessions.delete(id);
        session.connection.close(1000, "Room expired");
      }
    }
  }

  private async scheduleAlarm() {
    const deadlines = [...this.sessions.values()].filter((session) => !session.playerId).map((session) => session.joinDeadline);
    if (this.record) {
      deadlines.push(this.record.expiresAt);
      if (this.record.snapshot.phase !== "finished") {
        for (const player of this.record.snapshot.players) {
          if (!player.connected && player.disconnectedAt !== null) deadlines.push(player.disconnectedAt + RECONNECT_GRACE_MS);
        }
      }
    }
    if (deadlines.length) await this.room.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
    else await this.room.storage.deleteAlarm();
  }
}
