import PartySocket, { type PartySocketOptions } from "partysocket";
import { isBoard, type Player } from "../game/engine";
import {
  PROTOCOL_VERSION, ROOM_CODE_PATTERN,
  type ClientCommand, type MatchPlayer, type MatchSnapshot,
  type RejectionCode, type ServerMessage,
} from "../game/protocol";
import type { Profile } from "./storage";

export type MultiplayerStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
export interface MultiplayerState {
  roomCode: string | null;
  snapshot: MatchSnapshot | null;
  playerId: string | null;
  status: MultiplayerStatus;
  error: string | null;
  pending: boolean;
}
export interface PartyEndpoint { host: string; protocol: "ws" | "wss" }

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_KEY = "flip.multiplayerSeat";
const REQUEST_TIMEOUT = 8_000;
const CONNECTION_TIMEOUT = 15_000;
const HEARTBEAT_INTERVAL = 18_000;
let memoryToken: string | undefined;

/** Accept a room code or an actual invite URL, without silently changing invalid input. */
export function normalizeRoomCode(input: string): string | null {
  const value = input.trim();
  if (ROOM_CODE_PATTERN.test(value.toUpperCase())) return value.toUpperCase();
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const match = /^#multiplayer\/([A-HJ-NP-Z2-9]{6})\/?$/i.exec(url.hash);
    return match ? match[1].toUpperCase() : null;
  } catch { return null; }
}

export function createInviteUrl(code: string, base = window.location.href): string {
  if (!ROOM_CODE_PATTERN.test(code)) throw new Error("Invalid room code");
  const url = new URL(base);
  url.search = '';
  url.username = '';
  url.password = '';
  url.hash = `multiplayer/${code}`;
  return url.href;
}

export function resolvePartyHost(
  configured: string | undefined,
  development: boolean,
  location: { hostname: string; protocol: string; host?: string },
): PartyEndpoint | null {
  const value = configured?.trim();
  if (value === 'same-origin') return { host: location.host ?? location.hostname, protocol: location.protocol === 'https:' ? 'wss' : 'ws' };
  if (!value) return development
    ? { host: `${location.hostname.includes(':') ? `[${location.hostname.replace(/^\[|\]$/g, '')}]` : location.hostname}:1999`, protocol: location.protocol === 'https:' ? 'wss' : 'ws' }
    : null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
    return { host: url.host, protocol: local && location.protocol !== 'https:' && !/^(https|wss):\/\//i.test(value) ? 'ws' : 'wss' };
  } catch { return null; }
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function getSeatToken(): string {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && /^[a-f0-9]{64}$/.test(stored)) {
      memoryToken = stored;
      return stored;
    }
  } catch { /* Use the same private key in this tab if storage is blocked. */ }
  memoryToken ??= randomHex(32);
  try { localStorage.setItem(TOKEN_KEY, memoryToken); } catch { /* In-memory fallback. */ }
  return memoryToken;
}
function createCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte & 31]).join('');
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}
function player(value: unknown): value is Player { return value === 1 || value === 2; }
function timestamp(value: unknown): boolean { return value === null || integer(value); }
function validPlayer(value: unknown): value is MatchPlayer {
  return object(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100 &&
    typeof value.name === 'string' && value.name.length > 0 && Array.from(value.name).length <= 24 &&
    typeof value.styleId === 'string' && value.styleId.length > 0 && value.styleId.length <= 80 &&
    player(value.color) && typeof value.connected === 'boolean' && typeof value.ready === 'boolean' &&
    typeof value.wantsRematch === 'boolean' && timestamp(value.disconnectedAt);
}
export function isMatchSnapshot(value: unknown): value is MatchSnapshot {
  if (!object(value) || typeof value.roomCode !== 'string' || !ROOM_CODE_PATTERN.test(value.roomCode) ||
    typeof value.matchId !== 'string' || !value.matchId || value.matchId.length > 100 || !integer(value.revision) ||
    !isBoard(value.board) || !(value.turn === null || player(value.turn)) ||
    !Array.isArray(value.players) || value.players.length > 2 || !value.players.every(validPlayer) ||
    new Set(value.players.map(p => p.id)).size !== value.players.length ||
    new Set(value.players.map(p => p.color)).size !== value.players.length ||
    !['waiting', 'playing', 'finished'].includes(value.phase as string) ||
    !(value.passed === null || player(value.passed)) || !integer(value.moveCount, 0, 60) ||
    !timestamp(value.startedAt) || !timestamp(value.endedAt) || !integer(value.updatedAt) || !integer(value.serverTime)) return false;
  if (value.lastMove !== null && (!object(value.lastMove) || !integer(value.lastMove.index, 0, 63) ||
    !player(value.lastMove.player) || !Array.isArray(value.lastMove.flips) ||
    !value.lastMove.flips.every(index => integer(index, 0, 63)) ||
    new Set(value.lastMove.flips).size !== value.lastMove.flips.length)) return false;
  if (value.result !== null && (!object(value.result) || !(value.result.winner === null || player(value.result.winner)) ||
    !['complete', 'surrender', 'disconnect', 'abandoned'].includes(value.result.reason as string))) return false;
  if (value.phase === 'finished') return value.turn === null && value.result !== null && value.endedAt !== null;
  if (value.result !== null || value.endedAt !== null) return false;
  return value.phase !== 'playing' || (value.players.length === 2 && player(value.turn) && value.startedAt !== null);
}

const rejectionMessages: Record<RejectionCode, string> = {
  'invalid-request': 'This request could not be used. Update the board and try again.',
  'invalid-move': 'That tile cannot capture a pill. Select a highlighted tile.',
  'stale-revision': 'The board changed. Your board is being updated.',
  'not-your-turn': 'Please wait for your turn.',
  'not-playing': 'The match is not in progress.',
  'unauthorized': 'Your seat could not be restored. Leave this room and join again.',
  'room-full': 'This room already has two players. Create a new room to play.',
  'room-not-found': 'This room does not exist. Check the room code or create a room.',
  'room-exists': 'That room code is already in use. Please create another room.',
  'opponent-offline': 'Your friend is reconnecting. Play resumes when they return.',
  'rate-limited': 'Please wait a moment before you try again.',
};
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string' || data.length > 30_000) return null;
  let message: unknown;
  try { message = JSON.parse(data); } catch { return null; }
  if (!object(message) || message.version !== PROTOCOL_VERSION) return null;
  switch (message.type) {
    case 'welcome': return typeof message.playerId === 'string' && isMatchSnapshot(message.snapshot) &&
      message.snapshot.players.some(p => p.id === message.playerId) ? message as unknown as ServerMessage : null;
    case 'snapshot': return isMatchSnapshot(message.snapshot) &&
      (message.acceptedRequestId === undefined || typeof message.acceptedRequestId === 'string') ? message as unknown as ServerMessage : null;
    case 'rejected': return typeof message.requestId === 'string' && typeof message.code === 'string' &&
      Object.hasOwn(rejectionMessages, message.code) && typeof message.message === 'string' && integer(message.revision) ? message as unknown as ServerMessage : null;
    case 'left': return message as unknown as ServerMessage;
    default: return null;
  }
}

export interface RoomSocket {
  readonly readyState: number;
  send(data: string): unknown;
  close(code?: number, reason?: string): void;
  reconnect(): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
type SocketFactory = (options: PartySocketOptions) => RoomSocket;
const initialState: MultiplayerState = { roomCode: null, snapshot: null, playerId: null, status: 'idle', error: null, pending: false };

/** Owns one authenticated room connection. Commands are never kept for later replay. */
export class MultiplayerClient {
  private state: MultiplayerState = initialState;
  private listeners = new Set<() => void>();
  private socket: RoomSocket | null = null;
  private detach: (() => void) | null = null;
  private welcomed = false;
  private createIntent = false;
  private createAttempts = 0;
  private joinRequest = '';
  private seenMatches = new Set<string>();
  private pendingRequest: { id: string; type: ClientCommand['type']; heartbeat: boolean } | null = null;
  private requestTimer: ReturnType<typeof setTimeout> | undefined;
  private connectionTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private leaving = false;
  private leaveRetries = 0;
  private suspended = false;
  private online = true;

  constructor(
    private profile: Profile,
    private endpoint: PartyEndpoint | null,
    private socketFactory: SocketFactory = options => new PartySocket(options),
    private seatToken = getSeatToken,
  ) {}

  getSnapshot = (): MultiplayerState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setProfile(profile: Profile): void { this.profile = profile; }
  private update(next: Partial<MultiplayerState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }
  private clearPending(): void {
    clearTimeout(this.requestTimer);
    this.pendingRequest = null;
    if (this.state.pending) this.update({ pending: false });
  }
  private stopHeartbeat(): void {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.online || this.suspended || this.leaving || !this.welcomed || this.state.status !== 'connected' || this.pendingRequest) return;
      if (this.socket?.readyState !== 1) { this.connect(); return; }
      this.sendCommand('sync', undefined, true);
    }, HEARTBEAT_INTERVAL);
  }
  private closeSocket(): void {
    this.stopHeartbeat();
    clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
    this.clearPending();
    this.welcomed = false;
    this.detach?.(); this.detach = null;
    const socket = this.socket; this.socket = null;
    try { socket?.close(1000, 'Client disconnected'); } catch { /* Already closed. */ }
  }
  private fail(message: string): void {
    this.closeSocket();
    this.update({ status: 'error', error: message });
  }
  private waitForConnection(): void {
    // Repeated failed reconnects must not postpone the user-visible timeout forever.
    if (this.connectionTimer !== undefined) return;
    this.connectionTimer = setTimeout(() => {
      this.connectionTimer = undefined;
      this.fail('The room could not be reached. Check your connection, then select Try again.');
    }, CONNECTION_TIMEOUT);
  }
  private connect(): void {
    this.closeSocket();
    if (!this.state.roomCode || this.suspended) return;
    if (!this.online) {
      this.update({ status: 'reconnecting', error: 'You are offline. We will reconnect when your connection returns.' });
      return;
    }
    if (!this.endpoint) {
      this.fail('Online play is not set up on this site yet. The site owner must connect the PartyKit server.');
      return;
    }
    this.leaving = false;
    this.update({ status: this.state.playerId ? 'reconnecting' : 'connecting', error: null });
    let socket: RoomSocket;
    try {
      socket = this.socketFactory({ ...this.endpoint, room: this.state.roomCode, party: 'main',
        maxEnqueuedMessages: 0, minReconnectionDelay: 500, maxReconnectionDelay: 3_000, connectionTimeout: 8_000,
        shouldReconnectOnClose: event => event.code !== 4001 && event.code !== 4003,
      });
    } catch { this.fail('The room could not be opened. Check your connection, then select Try again.'); return; }
    this.socket = socket;
    const open: EventListener = () => {
      if (this.socket !== socket) return;
      this.welcomed = false;
      this.clearPending();
      this.joinRequest = randomHex(12);
      this.waitForConnection();
      try {
        if (socket.readyState !== 1) return;
        socket.send(JSON.stringify({ version: PROTOCOL_VERSION, type: 'join', requestId: this.joinRequest,
          token: this.seatToken(), name: this.profile.name, styleId: this.profile.styleId, create: this.createIntent }));
      } catch { this.fail('The room could not be joined. Select Try again.'); }
    };
    const message: EventListener = event => {
      if (this.socket !== socket) return;
      this.receive((event as MessageEvent).data);
    };
    const closed: EventListener = event => {
      if (this.socket !== socket) return;
      if (this.leaving) { this.finishLeave(); return; }
      this.welcomed = false;
      this.stopHeartbeat();
      this.clearPending();
      const code = (event as CloseEvent).code;
      if (code === 4001 || code === 4003) { this.fail('The server closed this connection. Close any extra game tabs, then select Try again.'); return; }
      this.update({ status: 'reconnecting', error: 'Connection lost. We are reconnecting to your seat.' });
      this.waitForConnection();
    };
    const error: EventListener = () => {
      if (this.socket !== socket || this.leaving) return;
      this.welcomed = false;
      this.stopHeartbeat();
      this.clearPending();
      this.update({ status: 'reconnecting', error: 'The room could not be reached. We are trying again.' });
      this.waitForConnection();
    };
    const events: [string, EventListener][] = [['open', open], ['message', message], ['close', closed], ['error', error]];
    events.forEach(([name, handler]) => socket.addEventListener(name, handler));
    this.detach = () => events.forEach(([name, handler]) => socket.removeEventListener(name, handler));
    this.waitForConnection();
  }
  private acceptSnapshot(snapshot: MatchSnapshot, welcome = false): boolean {
    if (snapshot.roomCode !== this.state.roomCode) return false;
    const previous = this.state.snapshot;
    if (previous?.matchId === snapshot.matchId && previous.revision > snapshot.revision) return false;
    if (previous?.matchId !== snapshot.matchId && this.seenMatches.has(snapshot.matchId)) return false;
    if (!welcome && this.state.playerId && !snapshot.players.some(p => p.id === this.state.playerId)) return false;
    this.seenMatches.add(snapshot.matchId);
    this.update({ snapshot });
    return true;
  }
  private receive(data: unknown): void {
    const message = parseServerMessage(data);
    if (!message) { this.fail('The room sent data this version cannot read. Reload the page to update the game.'); return; }
    // The server also sends this when the room expires or the same seat leaves in another tab.
    if (message.type === 'left') { if (this.leaving || this.welcomed) this.finishLeave(); return; }
    if (message.type === 'welcome') {
      if (!this.acceptSnapshot(message.snapshot, true)) return;
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
      this.clearPending();
      this.welcomed = true;
      this.createIntent = false;
      this.update({ playerId: message.playerId, status: 'connected', error: null });
      this.startHeartbeat();
      return;
    }
    if (message.type === 'snapshot') {
      if (!this.welcomed) return;
      const accepted = this.acceptSnapshot(message.snapshot);
      // A delayed receipt may acknowledge an action without replacing a newer board.
      if (!accepted && (message.snapshot.roomCode !== this.state.roomCode || message.snapshot.matchId !== this.state.snapshot?.matchId)) return;
      if (message.acceptedRequestId === this.pendingRequest?.id) {
        const wasSync = this.pendingRequest?.type === 'sync';
        const wasHeartbeat = this.pendingRequest?.heartbeat;
        this.clearPending();
        if (!wasHeartbeat) this.update({ error: null });
        if (this.leaving && wasSync) this.sendCommand('leave');
      }
      return;
    }
    if (message.code === 'room-exists' && this.createIntent && message.requestId === this.joinRequest && this.createAttempts < 4) {
      this.createAttempts++;
      this.update({ roomCode: createCode() });
      this.connect();
      return;
    }
    const matching = message.requestId === this.pendingRequest?.id || message.requestId === this.joinRequest;
    if (!matching) return;
    if (this.leaving) {
      this.clearPending();
      if (message.code === 'stale-revision' && this.leaveRetries++ < 2) this.sendCommand('sync');
      else this.finishLeave();
      return;
    }
    this.clearPending();
    const text = rejectionMessages[message.code];
    if (!this.welcomed || ['room-full', 'room-not-found', 'unauthorized'].includes(message.code)) {
      this.fail(text); return;
    }
    this.update({ error: text });
    if (message.code === 'stale-revision') this.sendCommand('sync');
  }
  private sendCommand(type: ClientCommand['type'], index?: number, heartbeat = false): void {
    const snapshot = this.state.snapshot;
    if (!snapshot || !this.welcomed || this.state.status !== 'connected' || this.pendingRequest || !this.socket || this.socket.readyState !== 1) return;
    const requestId = randomHex(12);
    const command = { version: PROTOCOL_VERSION, type, requestId, matchId: snapshot.matchId, expectedRevision: snapshot.revision,
      ...(type === 'move' ? { index } : {}) };
    this.pendingRequest = { id: requestId, type, heartbeat };
    this.update({ pending: true });
    try {
      if (this.socket.send(JSON.stringify(command)) === false) {
        this.clearPending();
        this.welcomed = false;
        this.stopHeartbeat();
        this.update({ status: 'reconnecting', error: 'Connection lost. This action was not sent.' });
        this.waitForConnection();
        return;
      }
    }
    catch { this.clearPending(); this.update({ error: 'This action was not sent. Check your connection and try again.' }); return; }
    this.requestTimer = setTimeout(() => {
      if (this.pendingRequest?.id !== requestId) return;
      this.clearPending();
      if (this.leaving) { this.finishLeave(); return; }
      if (type === 'sync') { this.retry(); return; }
      this.update({ error: 'The reply took too long. Your board is being updated.' });
      this.sendCommand('sync');
    }, REQUEST_TIMEOUT);
  }
  createRoom = (): void => {
    if (this.state.roomCode && (this.state.status === 'connected' || this.state.status === 'connecting' || this.state.status === 'reconnecting')) return;
    this.closeSocket();
    this.createIntent = true;
    this.createAttempts = 0;
    this.seenMatches.clear();
    this.update({ ...initialState, roomCode: createCode() });
    this.connect();
  };
  joinRoom = (input: string): void => {
    const code = normalizeRoomCode(input);
    if (!code) { this.update({ error: 'Enter a six-character room code or paste an invite link.' }); return; }
    if (this.state.roomCode === code && this.state.status !== 'idle' && this.state.status !== 'error') return;
    if (this.state.roomCode && this.state.roomCode !== code && this.state.snapshot) {
      this.update({ error: 'Leave your current room before you join another room.' }); return;
    }
    this.closeSocket();
    this.createIntent = false;
    this.createAttempts = 0;
    this.seenMatches.clear();
    this.update({ ...initialState, roomCode: code });
    this.connect();
  };
  ready = (): void => { this.sendCommand('ready'); };
  move = (index: number): void => { if (integer(index, 0, 63)) this.sendCommand('move', index); };
  surrender = (): void => { this.sendCommand('surrender'); };
  rematch = (): void => { this.sendCommand('rematch'); };
  leave = (): void => {
    if (!this.state.roomCode) return;
    this.stopHeartbeat();
    this.clearPending();
    this.leaving = true;
    this.leaveRetries = 0;
    if (this.welcomed && this.socket?.readyState === 1 && this.state.status === 'connected') this.sendCommand('leave');
    else this.finishLeave();
  };
  private finishLeave(): void {
    this.closeSocket();
    this.leaving = false;
    this.createIntent = false;
    this.seenMatches.clear();
    this.update({ ...initialState });
  }
  retry = (): void => { if (this.state.roomCode) this.connect(); };
  setOnline = (online: boolean): void => {
    if (this.online === online) return;
    this.online = online;
    if (!this.state.roomCode) return;
    if (!online) {
      const keepError = this.state.status === 'error';
      this.closeSocket();
      if (this.leaving) { this.finishLeave(); return; }
      if (!keepError) this.update({ status: 'reconnecting', error: 'You are offline. We will reconnect when your connection returns.' });
    } else if (!this.suspended && this.state.status === 'reconnecting') this.connect();
  };
  suspend = (): void => { this.suspended = true; this.closeSocket(); };
  resume = (): void => {
    const wasSuspended = this.suspended;
    this.suspended = false;
    if (wasSuspended && this.state.roomCode) this.connect();
  };
}
