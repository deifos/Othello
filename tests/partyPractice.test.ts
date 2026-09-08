import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Party from "partykit/server";
import PracticeRankings from "../party/practice";
import { applyMove, createBoard, getLegalMoves, getNextTurn } from "../src/game/engine";
import type { Player } from "../src/game/engine";
import { verifyMatch } from "../server/validation";

class MemoryStorage {
  values = new Map<string, unknown>();
  failPutPrefix: string | null = null;
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) {
    if (this.failPutPrefix && key.startsWith(this.failPutPrefix)) throw new Error("Storage write failed");
    this.values.set(key, structuredClone(value));
  }
  async list<T>(options: { prefix: string; limit: number; start?: string; startAfter?: string }) {
    return new Map([...this.values].filter(([key]) => key.startsWith(options.prefix) && (!options.start || key >= options.start) && (!options.startAfter || key > options.startAfter))
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).slice(0, options.limit).map(([key, value]) => [key, structuredClone(value) as T]));
  }
  async transaction<T>(work: (storage: MemoryStorage) => Promise<T>) {
    const transaction = new MemoryStorage();
    transaction.values = structuredClone(this.values);
    transaction.failPutPrefix = this.failPutPrefix;
    const result = await work(transaction);
    this.values = transaction.values;
    return result;
  }
}

type Identity = { id: string; token: string };
const ORIGIN = "https://flip-buddies.example.com";

function harness(storage = new MemoryStorage(), env: Record<string, string> = {}) {
  const server = new PracticeRankings({ id: "global", storage, env } as unknown as Party.Room);
  const request = (path: string, body?: unknown, extra: RequestInit = {}) => server.onRequest(new Request(`${ORIGIN}/api${path}`, {
    method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    ...extra, headers: { "Content-Type": "application/json", ...extra.headers },
  }) as unknown as Party.Request);
  async function player(name = "Little Flipper") {
    const response = await request("/players", { name, styleId: "classic" });
    expect(response.status).toBe(201);
    return await response.json() as Identity;
  }
  const submit = (identity: Identity, match: unknown, name = "Little Flipper") => request("/matches", { playerId: identity.id, name, styleId: "classic", match }, { headers: { Authorization: `Bearer ${identity.token}` } });
  return { storage, server, request, player, submit };
}

function fullMatch(seed = 0) {
  let board = createBoard();
  let turn: Player | null = 1;
  const moves: number[] = [];
  while (turn !== null) {
    const legal = getLegalMoves(board, turn);
    const move = legal[(moves.length * 5 + seed) % legal.length];
    moves.push(move.index);
    board = applyMove(board, move.index, turn);
    turn = getNextTurn(board, turn).turn;
  }
  return { id: `match-${seed}`, moves, surrendered: false, difficulty: "normal" };
}

const surrender = (id: string) => ({ id, moves: [], surrendered: true, difficulty: "normal" });
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.UTC(2026, 0, 1)); });
afterEach(() => vi.useRealTimers());

describe("PartyKit public CPU practice API", () => {
  it("rejects every request outside the single global room without creating another store", async () => {
    const storage = new MemoryStorage();
    const server = new PracticeRankings({ id: "another-room", storage, env: {} } as unknown as Party.Room);
    for (const path of ["/api/players", "/parties/practice/another-room/api/players", "/parties/practice/global/api/players"]) {
      const response = await server.onRequest(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Pal", styleId: "classic" }) }) as unknown as Party.Request);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "API route not found." });
    }
    expect(storage.values.size).toBe(0);
    expect((await server.onRequest(new Request(`${ORIGIN}/api/health`) as unknown as Party.Request)).status).toBe(404);
  });

  it("provides health, HEAD, and an empty ranking board without exposing private profiles", async () => {
    const h = harness();
    expect(await (await h.request("/health")).json()).toEqual({ ok: true, mode: "practice", storage: "partykit" });
    const head = await h.request("/health", undefined, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("cache-control")).toBe("no-store");
    const identity = await h.player();
    expect(identity.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const storage = JSON.stringify([...h.storage.values.values()]);
    expect(storage).not.toContain(identity.token);
    expect(storage).toContain("tokenHash");
    expect(await (await h.request("/leaderboard")).json()).toEqual({ players: [] });
    expect((await h.request("/missing")).status).toBe(404);
  });

  it("verifies the complete transcript, ignores claimed scores, and saves a concurrent retry only once", async () => {
    const h = harness();
    const identity = await h.player();
    const match = fullMatch();
    const expected = verifyMatch(match);
    const forged = { ...match, black: 999, white: -4, outcome: "win", points: 9999, date: "2099-01-01" };
    const responses = await Promise.all([h.submit(identity, forged), h.submit(identity, forged)]);
    const receipts = await Promise.all(responses.map((response) => response.json()));
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(receipts.map((receipt) => receipt.duplicate)).toEqual([false, true]);
    for (const receipt of receipts) expect(receipt).toMatchObject({ ok: true, matchId: match.id, black: expected.black, white: expected.white, points: expected.points, outcome: expected.outcome });
    const rankings = await (await h.request("/leaderboard")).json();
    expect(rankings.players).toEqual([{ id: identity.id, name: "Little Flipper", styleId: "classic", rank: 1, games: 1, wins: Number(expected.outcome === "win"), rating: expected.points }]);
    expect(JSON.stringify(rankings)).not.toContain(identity.token);
    expect(JSON.stringify(rankings)).not.toContain("tokenHash");
    expect([...h.storage.values.keys()].filter((key) => key.startsWith("result:"))).toHaveLength(1);
    expect([...h.storage.values.keys()].filter((key) => key.startsWith("date:"))).toHaveLength(1);
  });

  it("requires the correct private token and rejects illegal, incomplete, and multiplayer results", async () => {
    const h = harness();
    const first = await h.player();
    const second = await h.player();
    expect((await h.submit({ id: first.id, token: second.token }, surrender("wrong-token"))).status).toBe(401);
    expect((await h.submit({ id: "missing-player", token: first.token }, surrender("unknown-player"))).status).toBe(401);
    expect((await h.request("/matches", { playerId: first.id, name: "Pal", styleId: "classic", match: surrender("no-token") })).status).toBe(401);
    expect((await h.submit(first, { ...surrender("illegal"), moves: [0] })).status).toBe(400);
    expect((await h.submit(first, { ...surrender("unfinished"), moves: [19], surrendered: false })).status).toBe(400);
    expect((await h.submit(first, { ...fullMatch(), mode: "multiplayer" })).status).toBe(400);
    expect((await h.submit(first, { ...fullMatch(), roomCode: "ABC234" })).status).toBe(400);
    expect(await (await h.request("/leaderboard")).json()).toEqual({ players: [] });
  });

  it("rejects a conflicting transcript under one ID and scopes identical IDs to each player", async () => {
    const h = harness();
    const first = await h.player("First");
    const second = await h.player("Second");
    expect((await h.submit(first, surrender("shared-id"), "First")).status).toBe(200);
    expect((await h.submit(first, { ...surrender("shared-id"), moves: [19] })).status).toBe(409);
    expect((await h.submit(second, surrender("shared-id"), "Second")).status).toBe(200);
    const data = await (await h.request("/leaderboard")).json();
    expect(data.players).toHaveLength(2);
    expect(data.players.map((player: { games: number }) => player.games)).toEqual([1, 1]);
  });

  it("uses server time for inclusive rolling 7-day and 30-day rankings", async () => {
    const h = harness();
    const identity = await h.player();
    for (const day of [0, 25, 39]) {
      vi.setSystemTime(Date.UTC(2026, 0, 1 + day));
      expect((await h.submit(identity, { ...surrender(`day-${day}`), date: "1900-01-01" })).status).toBe(200);
    }
    vi.setSystemTime(Date.UTC(2026, 0, 41));
    for (const [period, games] of [["global", 3], ["monthly", 2], ["weekly", 1]] as const) {
      const data = await (await h.request(`/leaderboard?period=${period}`)).json();
      expect(data.players[0].games).toBe(games);
    }
    vi.setSystemTime(Date.UTC(2026, 0, 47));
    expect((await (await h.request("/leaderboard?period=weekly")).json()).players[0].games).toBe(1);
    vi.setSystemTime(Date.UTC(2026, 0, 47) + 1);
    expect((await (await h.request("/leaderboard?period=weekly")).json()).players).toEqual([]);
    expect((await h.request("/leaderboard?period=friends")).status).toBe(400);
  });

  it("normalizes names, preserves supported Unicode and punctuation, and updates names only on a new result", async () => {
    const h = harness();
    const identity = await h.player("  Cafe\u0301   🎮 <Pal>  ");
    await h.submit(identity, surrender("first"), "  Cafe\u0301   🎮 <Pal>  ");
    let data = await (await h.request("/leaderboard")).json();
    expect(data.players[0].name).toBe("Café 🎮 <Pal>");
    await h.submit(identity, surrender("first"), "Do not rename on duplicate");
    data = await (await h.request("/leaderboard")).json();
    expect(data.players[0].name).toBe("Café 🎮 <Pal>");
    expect((await h.request("/players", { name: "Bad\u0000name", styleId: "classic" })).status).toBe(400);
    expect((await h.request("/players", { name: "Pal", styleId: "../secret" })).status).toBe(400);
  });

  it("enforces JSON, byte limits, origin checks, and same-origin preflight", async () => {
    const h = harness();
    expect((await h.request("/players", null)).status).toBe(400);
    expect((await h.request("/players", {}, { body: "{" })).status).toBe(400);
    expect((await h.request("/players", {}, { body: "{}", headers: { "Content-Type": "text/plain" } })).status).toBe(415);
    expect((await h.request("/players", { name: "🎮".repeat(3000), styleId: "classic" })).status).toBe(413);
    expect((await h.request("/leaderboard", undefined, { headers: { Origin: "https://other.example.com" } })).status).toBe(403);
    const same = await h.request("/leaderboard", undefined, { headers: { Origin: ORIGIN } });
    expect(same.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const options = await h.request("/matches", undefined, { method: "OPTIONS", headers: { Origin: ORIGIN } });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
    const configured = harness(new MemoryStorage(), { ALLOWED_ORIGIN: "https://play.example.com" });
    expect((await configured.request("/leaderboard", undefined, { headers: { Origin: "https://play.example.com" } })).status).toBe(200);
  });

  it("handles the PartyKit stub path and HTTPS origin forwarded over internal HTTP", async () => {
    const h = harness();
    const response = await h.server.onRequest(new Request("http://flip-buddies.example.com/parties/practice/global/api/leaderboard?period=global", { headers: { Origin: ORIGIN } }) as unknown as Party.Request);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toEqual({ players: [] });
    const wrong = await h.server.onRequest(new Request("http://flip-buddies.example.com/parties/practice/other/api/leaderboard", { headers: { Origin: ORIGIN } }) as unknown as Party.Request);
    expect(wrong.status).toBe(404);
    expect((await h.request("/leaderboard", undefined, { headers: { Origin: `${ORIGIN}/not-an-origin` } })).status).toBe(403);
  });

  it("commits the ledger, date index, player totals, and counts atomically and retains them after restart", async () => {
    const h = harness();
    const identity = await h.player();
    h.storage.failPutPrefix = "date:";
    expect((await h.submit(identity, surrender("transaction"))).status).toBe(500);
    expect([...h.storage.values.keys()].some((key) => key.startsWith("result:"))).toBe(false);
    expect(await (await h.request("/leaderboard")).json()).toEqual({ players: [] });
    h.storage.failPutPrefix = null;
    expect((await h.submit(identity, surrender("transaction"))).status).toBe(200);
    const restarted = harness(h.storage);
    const duplicate = await (await restarted.submit(identity, surrender("transaction"))).json();
    expect(duplicate.duplicate).toBe(true);
    expect((await (await restarted.request("/leaderboard")).json()).players[0].games).toBe(1);
    expect(h.storage.values.get("counts")).toEqual({ players: 1, results: 1 });
  });

  it("paginates stored player rows and applies stable ranking order and a maximum of 100 places", async () => {
    const h = harness();
    for (let i = 0; i < 510; i++) {
      const id = `player-${String(i).padStart(4, "0")}`;
      await h.storage.put(`player:${id}`, { id, tokenHash: "a".repeat(64), name: `Pal ${i}`, styleId: "classic", createdAt: i, rating: i * 30, wins: i, games: i + 1 });
    }
    const data = await (await h.request("/leaderboard")).json();
    expect(data.players).toHaveLength(100);
    expect(data.players[0]).toMatchObject({ id: "player-0509", rank: 1, rating: 509 * 30 });
    expect(data.players[99].rank).toBe(100);
    expect((await (await h.request("/leaderboard?limit=2")).json()).players).toHaveLength(2);
    expect((await h.request("/leaderboard?limit=101")).status).toBe(400);
  });

  it("caps new records while still acknowledging a saved result at capacity", async () => {
    const h = harness();
    const identity = await h.player();
    await h.submit(identity, surrender("saved"));
    await h.storage.put("counts", { players: 5000, results: 50_000 });
    expect((await h.request("/players", { name: "New Pal", styleId: "classic" })).status).toBe(503);
    expect((await h.submit(identity, surrender("new"))).status).toBe(503);
    expect((await (await h.submit(identity, surrender("saved"))).json()).duplicate).toBe(true);
  });
});
