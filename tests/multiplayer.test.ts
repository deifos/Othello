import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartySocketOptions } from "partysocket";
import { createBoard } from "../src/game/engine";
import { PROTOCOL_VERSION, type MatchSnapshot } from "../src/game/protocol";
import {
  MultiplayerClient, createInviteUrl, getSeatToken, isMatchSnapshot,
  normalizeRoomCode, parseServerMessage, resolvePartyHost, type RoomSocket,
} from "../src/lib/multiplayer";

const profile = { id: 'public-profile-id', name: 'Little Flipper', styleId: 'classic' };
const token = 'a'.repeat(64);
const endpoint = { host: 'localhost:1999', protocol: 'ws' as const };

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    roomCode: 'ABC234', matchId: 'match-1', revision: 1, board: createBoard(), turn: null,
    players: [{ id: 'black-seat', name: 'Little Flipper', styleId: 'classic', color: 1,
      connected: true, ready: false, wantsRematch: false, disconnectedAt: null }],
    phase: 'waiting', result: null, lastMove: null, passed: null, moveCount: 0,
    startedAt: null, endedAt: null, updatedAt: 1_000, serverTime: 1_000,
    ...overrides,
  };
}

class Socket extends EventTarget implements RoomSocket {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  sendResult = true;
  send(data: string): boolean {
    if (this.sendResult) this.sent.push(JSON.parse(data));
    return this.sendResult;
  }
  close(): void { this.closed = true; this.readyState = 3; }
  reconnect(): void { this.readyState = 0; }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  disconnect(code = 1006): void {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
  message(message: Record<string, unknown>): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ version: PROTOCOL_VERSION, ...message }) }));
  }
  welcome(state = snapshot()): void { this.message({ type: 'welcome', playerId: 'black-seat', snapshot: state }); }
  ack(state = snapshot(), requestId = this.sent.at(-1)?.requestId): void {
    this.message({ type: 'snapshot', snapshot: state, acceptedRequestId: requestId });
  }
  reject(code: string, requestId = this.sent.at(-1)?.requestId): void {
    this.message({ type: 'rejected', requestId, code, message: 'Server details', revision: 1 });
  }
}

describe('multiplayer inputs and boundary validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts only a complete room code or a valid invite URL', () => {
    expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
    expect(normalizeRoomCode('https://play.example/game/#multiplayer/abc234')).toBe('ABC234');
    for (const value of ['ABC-234', 'xABC234x', 'ABC 234', 'ABCI23', '#multiplayer/ABC234',
      'javascript:ABC234', 'https://example/#play/ABC234', 'https://example/#multiplayer/ABC234?extra=1']) {
      expect(normalizeRoomCode(value), value).toBeNull();
    }
    expect(createInviteUrl('ABC234', 'https://play.example/game/#play')).toBe('https://play.example/game/#multiplayer/ABC234');
    expect(createInviteUrl('ABC234', 'https://play.example/game/?private-query=value#play')).toBe('https://play.example/game/#multiplayer/ABC234');
    expect(() => createInviteUrl('INVALID', 'https://play.example')).toThrow();
  });

  it('uses the local host only during development and secure remote connections', () => {
    expect(resolvePartyHost(undefined, false, { hostname: 'play.example', protocol: 'https:' })).toBeNull();
    expect(resolvePartyHost('', true, { hostname: '192.168.1.8', protocol: 'http:' })).toEqual({ host: '192.168.1.8:1999', protocol: 'ws' });
    expect(resolvePartyHost('my-game.partykit.dev', false, { hostname: 'play.example', protocol: 'https:' })).toEqual({ host: 'my-game.partykit.dev', protocol: 'wss' });
    expect(resolvePartyHost('http://localhost:1999', true, { hostname: 'localhost', protocol: 'http:' })).toEqual(endpoint);
    expect(resolvePartyHost('https://my-game.partykit.dev/extra', false, { hostname: 'play.example', protocol: 'https:' })).toBeNull();
  });

  it('stores a private random seat key and retains it when storage is blocked', () => {
    const values = new Map<string, string>([['flip.multiplayerSeat', profile.id]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    const key = getSeatToken();
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toBe(profile.id);
    expect(getSeatToken()).toBe(key);
    const restored = 'b'.repeat(64);
    values.set('flip.multiplayerSeat', restored);
    expect(getSeatToken()).toBe(restored);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } });
    expect(getSeatToken()).toBe(restored);
  });

  it('rejects bad boards, duplicate seats, invalid results and unknown protocol versions', () => {
    const valid = snapshot();
    expect(isMatchSnapshot(valid)).toBe(true);
    expect(isMatchSnapshot({ ...valid, board: [1, 2] })).toBe(false);
    expect(isMatchSnapshot({ ...valid, players: [valid.players[0], valid.players[0]] })).toBe(false);
    expect(isMatchSnapshot({ ...valid, phase: 'finished', result: null })).toBe(false);
    expect(isMatchSnapshot({ ...valid, moveCount: 65 })).toBe(false);
    expect(parseServerMessage(JSON.stringify({ version: 1, type: 'welcome', playerId: 'black-seat', snapshot: valid }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ version: PROTOCOL_VERSION, type: 'welcome', playerId: 'unknown-seat', snapshot: valid }))).toBeNull();
    expect(parseServerMessage('not JSON')).toBeNull();
  });
});

describe('multiplayer connection and command lifecycle', () => {
  let client: MultiplayerClient;
  let sockets: Socket[];
  let options: PartySocketOptions[];
  const current = () => sockets.at(-1)!;
  function join(): Socket {
    client.joinRoom('ABC234');
    const socket = current();
    socket.open(); socket.welcome();
    return socket;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = []; options = [];
    client = new MultiplayerClient(profile, endpoint, configuration => {
      options.push(configuration);
      const socket = new Socket(); sockets.push(socket); return socket;
    }, () => token);
  });
  afterEach(() => { client.suspend(); vi.useRealTimers(); });

  it('opens only on request, joins first, and never queues a command before welcome', () => {
    expect(sockets).toHaveLength(0);
    client.joinRoom('abc234');
    client.move(19);
    expect(current().sent).toHaveLength(0);
    current().open();
    expect(current().sent[0]).toMatchObject({ type: 'join', token, name: profile.name, styleId: profile.styleId, create: false });
    expect(current().sent[0]).not.toHaveProperty('playerId');
    expect(options[0]).toMatchObject({ room: 'ABC234', protocol: 'ws', maxEnqueuedMessages: 0 });
    client.ready();
    expect(current().sent).toHaveLength(1);
    current().welcome();
    expect(client.getSnapshot()).toMatchObject({ status: 'connected', playerId: 'black-seat', roomCode: 'ABC234', pending: false });
    client.ready();
    expect(current().sent.at(-1)).toMatchObject({ type: 'ready', matchId: 'match-1', expectedRevision: 1 });
  });

  it('shows a clear setup error when the production host is not configured', () => {
    client = new MultiplayerClient(profile, null, () => { throw new Error('Must not connect'); }, () => token);
    client.createRoom();
    expect(client.getSnapshot()).toMatchObject({ status: 'error', pending: false });
    expect(client.getSnapshot().error).toContain('PartyKit server');
    expect(sockets).toHaveLength(0);
  });

  it('allows only one pending action and clears it only for the matching acknowledgement', () => {
    const socket = join();
    client.ready();
    const requestId = socket.sent.at(-1)!.requestId;
    client.move(19); client.rematch();
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'ready']);
    socket.ack(snapshot({ revision: 2 }), 'old-request');
    expect(client.getSnapshot().pending).toBe(true);
    socket.ack(snapshot({ revision: 2 }), requestId);
    expect(client.getSnapshot().pending).toBe(false);
    socket.ack(snapshot({ revision: 1 }));
    expect(client.getSnapshot().snapshot?.revision).toBe(2);
  });

  it('ignores a stale match after rematch changes the match id', () => {
    const socket = join();
    socket.ack(snapshot({ matchId: 'match-2', revision: 1 }));
    expect(client.getSnapshot().snapshot?.matchId).toBe('match-2');
    socket.ack(snapshot({ matchId: 'match-1', revision: 999 }));
    expect(client.getSnapshot().snapshot?.matchId).toBe('match-2');
  });

  it('accepts a delayed command receipt without restoring an older board', () => {
    const socket = join(); client.ready();
    const requestId = socket.sent.at(-1)!.requestId;
    socket.ack(snapshot({ revision: 3 }), 'another-request');
    socket.ack(snapshot({ revision: 2 }), requestId);
    expect(client.getSnapshot().pending).toBe(false);
    expect(client.getSnapshot().snapshot?.revision).toBe(3);
  });

  it('requests current state after a stale revision and does not replay the move', () => {
    const socket = join();
    client.move(19);
    socket.reject('stale-revision');
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'move', 'sync']);
    expect(client.getSnapshot().pending).toBe(true);
    socket.ack(snapshot({ revision: 3 }));
    expect(client.getSnapshot()).toMatchObject({ pending: false, error: null });
    expect(socket.sent.filter(command => command.type === 'move')).toHaveLength(1);
  });

  it('resynchronizes a timed-out action and reconnects if sync also times out', () => {
    const socket = join();
    client.move(19);
    vi.advanceTimersByTime(8_000);
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'move', 'sync']);
    vi.advanceTimersByTime(8_000);
    expect(socket.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    current().open(); current().welcome(snapshot({ revision: 2 }));
    expect(current().sent.map(command => command.type)).toEqual(['join']);
    expect(client.getSnapshot()).toMatchObject({ status: 'connected', pending: false });
  });

  it('restores the same seat on reconnect and clears any unacknowledged action', () => {
    client.createRoom();
    const socket = current();
    const roomCode = client.getSnapshot().roomCode!;
    socket.open(); socket.welcome(snapshot({ roomCode }));
    expect(socket.sent[0].create).toBe(true);
    client.move(19);
    socket.disconnect();
    expect(client.getSnapshot()).toMatchObject({ status: 'reconnecting', pending: false });
    client.move(26);
    expect(socket.sent).toHaveLength(2);
    socket.open();
    expect(socket.sent.at(-1)).toMatchObject({ type: 'join', token, create: false });
    socket.welcome(snapshot({ roomCode, revision: 3 }));
    expect(client.getSnapshot()).toMatchObject({ status: 'connected', playerId: 'black-seat' });
  });

  it('reports a full room and stops reconnect attempts', () => {
    client.joinRoom('ABC234'); current().open(); current().reject('room-full');
    expect(current().closed).toBe(true);
    expect(client.getSnapshot()).toMatchObject({ status: 'error', pending: false, playerId: null });
    expect(client.getSnapshot().error).toContain('two players');
  });

  it('tries a fresh code for a create collision, with a bounded number of attempts', () => {
    client.createRoom();
    for (let attempt = 0; attempt < 5; attempt++) {
      current().open();
      current().reject('room-exists');
    }
    expect(sockets).toHaveLength(5);
    expect(client.getSnapshot().status).toBe('error');
    expect(options.every(option => /^[A-HJ-NP-Z2-9]{6}$/.test(option.room!))).toBe(true);
  });

  it('waits for the explicit leave reply, then closes and removes all room state', () => {
    const socket = join();
    client.leave();
    expect(socket.sent.at(-1)?.type).toBe('leave');
    expect(client.getSnapshot()).toMatchObject({ roomCode: 'ABC234', pending: true });
    client.move(19);
    expect(socket.sent.at(-1)?.type).toBe('leave');
    socket.message({ type: 'left' });
    expect(socket.closed).toBe(true);
    expect(client.getSnapshot()).toMatchObject({ status: 'idle', roomCode: null, snapshot: null, playerId: null, pending: false });
  });

  it('completes explicit leave when the server does not reply', () => {
    const socket = join(); client.leave();
    vi.advanceTimersByTime(8_000);
    expect(socket.closed).toBe(true);
    expect(client.getSnapshot().roomCode).toBeNull();
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'leave']);
  });

  it('updates a stale board before it retries an explicit leave', () => {
    const socket = join(); client.leave(); socket.reject('stale-revision');
    expect(socket.sent.at(-1)?.type).toBe('sync');
    socket.ack(snapshot({ revision: 3 }));
    expect(socket.sent.at(-1)).toMatchObject({ type: 'leave', expectedRevision: 3 });
    expect(client.getSnapshot().roomCode).toBe('ABC234');
    socket.message({ type: 'left' });
    expect(client.getSnapshot().roomCode).toBeNull();
  });

  it('closes when the server expires the room or releases the seat in another tab', () => {
    const socket = join(); socket.message({ type: 'left' });
    expect(socket.closed).toBe(true);
    expect(client.getSnapshot()).toMatchObject({ status: 'idle', roomCode: null, snapshot: null });
  });

  it('detaches old listeners during suspension and restores one connection with the latest profile', () => {
    const old = join();
    client.suspend(); client.setProfile({ ...profile, name: 'New name' }); client.resume();
    expect(sockets).toHaveLength(2);
    old.message({ type: 'left' }); old.welcome(snapshot({ revision: 999 }));
    expect(client.getSnapshot().snapshot?.revision).toBe(1);
    current().open();
    expect(current().sent[0]).toMatchObject({ type: 'join', name: 'New name', create: false, token });
    current().welcome();
    expect(client.getSnapshot().status).toBe('connected');
  });

  it('clears all client timeouts when a pending room is suspended', () => {
    const socket = join(); client.ready();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    client.suspend();
    expect(vi.getTimerCount()).toBe(0);
    expect(socket.closed).toBe(true);
    expect(client.getSnapshot().pending).toBe(false);
  });

  it('does not let repeated failed reconnects postpone the connection timeout', () => {
    client.joinRoom('ABC234');
    const socket = current();
    for (let attempt = 0; attempt < 4; attempt++) {
      vi.advanceTimersByTime(3_000); socket.disconnect();
    }
    vi.advanceTimersByTime(3_000);
    expect(client.getSnapshot().status).toBe('error');
    expect(socket.closed).toBe(true);
  });

  it('rejects unreadable or mismatched snapshots before they reach the board', () => {
    const socket = join();
    socket.ack(snapshot({ roomCode: 'DEF234', revision: 20 }));
    expect(client.getSnapshot().snapshot?.revision).toBe(1);
    socket.message({ type: 'snapshot', snapshot: { ...snapshot(), board: [2, 1] } });
    expect(client.getSnapshot().status).toBe('error');
    expect(client.getSnapshot().snapshot?.board).toEqual(createBoard());
    expect(socket.closed).toBe(true);
  });

  it('stops a server-rejected connection without retrying forever', () => {
    const socket = join(); socket.disconnect(4001);
    expect(client.getSnapshot().status).toBe('error');
    expect(client.getSnapshot().error).toContain('extra game tabs');
    expect(socket.closed).toBe(true);
  });

  it('handles a send that was dropped without keeping a pending command', () => {
    const socket = join(); socket.sendResult = false; client.move(19);
    expect(client.getSnapshot()).toMatchObject({ status: 'reconnecting', pending: false });
    expect(socket.sent).toHaveLength(1);
    expect(client.getSnapshot().error).toContain('not sent');
  });

  it('checks an idle connection with a heartbeat and keeps action errors until the user acts', () => {
    const socket = join(); client.move(0); socket.reject('invalid-move');
    const error = client.getSnapshot().error;
    vi.advanceTimersByTime(17_999);
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'move']);
    vi.advanceTimersByTime(1);
    expect(socket.sent.at(-1)?.type).toBe('sync');
    expect(client.getSnapshot().pending).toBe(true);
    socket.ack();
    expect(client.getSnapshot()).toMatchObject({ status: 'connected', pending: false, error });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not send a heartbeat while a player action is pending', () => {
    const socket = join();
    vi.advanceTimersByTime(17_000); client.ready(); vi.advanceTimersByTime(1_000);
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'ready']);
    socket.ack(); vi.advanceTimersByTime(18_000);
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'ready', 'sync']);
  });

  it('detects a silent lost connection and reconnects without replaying any move', () => {
    const socket = join();
    vi.advanceTimersByTime(18_000);
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'sync']);
    vi.advanceTimersByTime(8_000);
    expect(socket.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(client.getSnapshot()).toMatchObject({ status: 'reconnecting', pending: false });
    client.move(19);
    expect(current().sent).toHaveLength(0);
    current().open(); current().welcome();
    expect(current().sent.map(command => command.type)).toEqual(['join']);
    expect(client.getSnapshot().status).toBe('connected');
  });

  it('closes and disables the room at once when offline, then restores the same seat online', () => {
    const socket = join(); client.move(19); client.setOnline(false);
    expect(socket.closed).toBe(true);
    expect(client.getSnapshot()).toMatchObject({ status: 'reconnecting', pending: false, playerId: 'black-seat' });
    expect(client.getSnapshot().error).toContain('offline');
    expect(vi.getTimerCount()).toBe(0);
    client.move(26); client.ready(); vi.advanceTimersByTime(60_000);
    expect(socket.sent.map(command => command.type)).toEqual(['join', 'move']);
    expect(sockets).toHaveLength(1);
    client.setOnline(true);
    expect(sockets).toHaveLength(2);
    current().open();
    expect(current().sent[0]).toMatchObject({ type: 'join', token, create: false });
    current().welcome(snapshot({ revision: 3 }));
    expect(client.getSnapshot()).toMatchObject({ status: 'connected', pending: false, playerId: 'black-seat', error: null });
  });

  it('defers the first connection while offline without losing the room create intent', () => {
    client.setOnline(false); client.createRoom();
    const roomCode = client.getSnapshot().roomCode!;
    expect(client.getSnapshot().status).toBe('reconnecting');
    expect(sockets).toHaveLength(0);
    client.setOnline(true); current().open();
    expect(current().sent[0]).toMatchObject({ type: 'join', create: true });
    current().welcome(snapshot({ roomCode }));
    expect(client.getSnapshot().status).toBe('connected');
  });

  it('preserves a terminal room error when the network changes', () => {
    client.joinRoom('ABC234'); current().open(); current().reject('room-full');
    const error = client.getSnapshot().error;
    client.setOnline(false); client.setOnline(true);
    expect(client.getSnapshot()).toMatchObject({ status: 'error', error });
    expect(sockets).toHaveLength(1);
  });

  it('stops the heartbeat on leave and keeps only one heartbeat after suspension', () => {
    const socket = join(); client.suspend();
    expect(vi.getTimerCount()).toBe(0);
    client.resume(); current().open(); current().welcome();
    expect(vi.getTimerCount()).toBe(1);
    const active = current(); client.leave();
    expect(vi.getTimerCount()).toBe(1);
    active.message({ type: 'left' });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(36_000);
    expect(socket.sent.map(command => command.type)).toEqual(['join']);
    expect(active.sent.map(command => command.type)).toEqual(['join', 'leave']);
  });
});
