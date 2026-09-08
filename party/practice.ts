import type * as Party from "partykit/server";
import { HttpError, identifier, object, playerDetails, verifyMatch } from "../server/validation";
import type { VerifiedMatch } from "../server/validation";

const MAX_BODY_BYTES = 8192;
const MAX_PLAYERS = 5_000;
const MAX_RESULTS = 50_000;
const PAGE_SIZE = 500;
const DAY_MS = 86_400_000;

type Period = "global" | "weekly" | "monthly";
interface Totals { rating: number; wins: number; games: number }
interface StoredPlayer extends Totals {
  id: string;
  name: string;
  styleId: string;
  tokenHash: string;
  createdAt: number;
}
interface StoredResult extends VerifiedMatch {
  playerId: string;
  playedAt: number;
  recordHash: string;
}
interface DatedResult {
  playerId: string;
  points: number;
  outcome: VerifiedMatch["outcome"];
}
interface Counts { players: number; results: number }

function timeKey(time: number) { return `date:${String(Math.max(0, time)).padStart(16, "0")}:`; }
function playerKey(id: string) { return `player:${id}`; }
function resultKey(playerId: string, matchId: string) { return `result:${playerId}:${matchId}`; }

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalDigest(left: string, right: string) {
  let difference = 0;
  // Both known and unknown identities use the same fixed-size comparison.
  for (let index = 0; index < 64; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function newToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function readJson(request: Pick<Party.Request, "method" | "url" | "headers" | "body">) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new HttpError(415, "Use application/json.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, "The request is too large.");
  if (!request.body) throw new HttpError(400, "The JSON is not valid.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 10_000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new HttpError(408, "The request ended too slowly.");
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new HttpError(413, "The request is too large.");
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    try { return object(JSON.parse(text)); } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "The JSON is not valid.");
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

function practiceOnly(body: Record<string, unknown>) {
  const match = object(body.match);
  // The online room has its own authority. It never submits to this practice API.
  for (const value of [body, match]) {
    if ((value.mode !== undefined && value.mode !== "cpu" && value.mode !== "practice" && value.mode !== "classic") ||
        ["roomCode", "roomId", "players", "playerColor"].some((key) => key in value)) {
      throw new HttpError(400, "Only CPU practice matches belong in these rankings.");
    }
  }
  return match;
}

/** A Workers adapter for the existing anonymous CPU-practice API, not ranked multiplayer. */
export default class PracticeRankings implements Party.Server {
  readonly options = { hibernate: false };
  private queue: Promise<unknown> = Promise.resolve();
  private inFlight = 0;

  constructor(readonly room: Pick<Party.Room, "id" | "storage" | "env">, private readonly storageName = "partykit") {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async onRequest(request: Pick<Party.Request, "method" | "url" | "headers" | "body">): Promise<Response> {
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" });
    const json = (status: number, value: unknown) => new Response(request.method === "HEAD" ? null : JSON.stringify(value), { status, headers });
    // There is exactly one public practice board, even when the party URL is called directly.
    if (this.room.id !== "global") return json(404, { error: "API route not found." });
    if (this.inFlight >= 32) return json(429, { error: "The rankings are busy. Try again shortly." });
    this.inFlight++;
    try {
      const url = new URL(request.url);
      // PartyKit's room stub prefixes the forwarded API path with its party route.
      const pathname = url.pathname.replace(/^\/parties\/practice\/global(?=\/api(?:\/|$))/, "");
      const origin = request.headers.get("origin");
      const configuredOrigin = typeof this.room.env?.ALLOWED_ORIGIN === "string" ? this.room.env.ALLOWED_ORIGIN.replace(/\/$/, "") : null;
      let sameHost = false;
      if (origin) {
        try {
          const parsedOrigin = new URL(origin);
          // The internal room stub uses HTTP even for the public HTTPS origin.
          sameHost = ["http:", "https:"].includes(parsedOrigin.protocol) && parsedOrigin.origin === origin && parsedOrigin.host === url.host;
        } catch { /* Invalid Origin values remain denied. */ }
      }
      if (origin && !sameHost && origin !== configuredOrigin) throw new HttpError(403, "This origin is not allowed.");
      if (origin) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
      if (request.method === "OPTIONS") {
        headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        headers.set("Access-Control-Max-Age", "600");
        return new Response(null, { status: 204, headers });
      }
      if (pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) return json(200, { ok: true, mode: "practice", storage: this.storageName });
      if (pathname === "/api/leaderboard" && request.method === "GET") {
        const period = url.searchParams.get("period") ?? "global";
        if (!["global", "weekly", "monthly"].includes(period)) throw new HttpError(400, "Choose a valid ranking period.");
        const limit = Number(url.searchParams.get("limit") ?? 100);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "Choose a ranking limit from 1 to 100.");
        const players = await this.serial(() => this.rankings(period as Period, Date.now(), limit));
        return json(200, { players });
      }
      if (pathname === "/api/players" && request.method === "POST") {
        const { name, styleId } = playerDetails(await readJson(request));
        const identity = await this.serial(() => this.createPlayer(name, styleId));
        return json(201, identity);
      }
      if (pathname === "/api/matches" && request.method === "POST") {
        const body = await readJson(request);
        const playerId = identifier(body.playerId);
        const { name, styleId } = playerDetails(body);
        const authorization = request.headers.get("authorization");
        if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) throw new HttpError(401, "A player token is required.");
        const result = await this.serial(async () => {
          const player = await this.room.storage.get<StoredPlayer>(playerKey(playerId));
          const digest = await hash(authorization.slice(7));
          const matches = equalDigest(digest, player?.tokenHash ?? "0".repeat(64));
          if (!player || !matches) throw new HttpError(401, "The player token is not valid.");
          const match = verifyMatch(practiceOnly(body));
          return { ok: true, matchId: match.id, ...await this.saveMatch(player, name, styleId, match) };
        });
        return json(200, result);
      }
      throw new HttpError(404, "API route not found.");
    } catch (error) {
      if (error instanceof HttpError) return json(error.status, { error: error.message });
      return json(500, { error: "Rankings are not available. Please try again." });
    } finally { this.inFlight--; }
  }

  private async createPlayer(name: string, styleId: string) {
    const id = crypto.randomUUID();
    const token = newToken();
    const player: StoredPlayer = { id, tokenHash: await hash(token), name, styleId, createdAt: Date.now(), rating: 0, wins: 0, games: 0 };
    await this.room.storage.transaction(async (transaction) => {
      const counts = await transaction.get<Counts>("counts") ?? { players: 0, results: 0 };
      if (counts.players >= MAX_PLAYERS) throw new HttpError(503, "New practice profiles are not available. Try again later.");
      await transaction.put(playerKey(id), player);
      await transaction.put("counts", { ...counts, players: counts.players + 1 });
    });
    return { id, token };
  }

  private async saveMatch(player: StoredPlayer, name: string, styleId: string, match: VerifiedMatch) {
    const recordHash = await hash(JSON.stringify({ difficulty: match.difficulty, moves: match.moves, surrendered: match.surrendered }));
    return this.room.storage.transaction(async (transaction) => {
      const key = resultKey(player.id, match.id);
      const existing = await transaction.get<StoredResult>(key);
      if (existing) {
        if (existing.recordHash !== recordHash) throw new HttpError(409, "This match ID already has a different move record.");
        return this.receipt(existing, true);
      }
      const counts = await transaction.get<Counts>("counts") ?? { players: 0, results: 0 };
      if (counts.results >= MAX_RESULTS) throw new HttpError(503, "Practice results cannot be saved right now. Try again later.");
      const now = Date.now();
      const record: StoredResult = { ...match, playerId: player.id, playedAt: now, recordHash };
      const updated: StoredPlayer = { ...player, name, styleId, rating: player.rating + match.points, wins: player.wins + Number(match.outcome === "win"), games: player.games + 1 };
      await transaction.put(key, record);
      await transaction.put(`${timeKey(now)}${player.id}:${match.id}`, { playerId: player.id, points: match.points, outcome: match.outcome } satisfies DatedResult);
      await transaction.put(playerKey(player.id), updated);
      await transaction.put("counts", { ...counts, results: counts.results + 1 });
      return this.receipt(record, false);
    });
  }

  private receipt(record: StoredResult, duplicate: boolean) {
    return { duplicate, black: record.black, white: record.white, outcome: record.outcome, points: record.points };
  }

  private async *rows<T>(prefix: string, start?: string): AsyncGenerator<T> {
    let after: string | undefined;
    while (true) {
      const page = await this.room.storage.list<T>({ prefix, limit: PAGE_SIZE, ...(after ? { startAfter: after } : start ? { start } : {}) });
      for (const value of page.values()) yield value;
      if (page.size < PAGE_SIZE) break;
      after = [...page.keys()].at(-1);
    }
  }

  private async rankings(period: Period, now: number, limit: number) {
    const players = new Map<string, StoredPlayer>();
    for await (const player of this.rows<StoredPlayer>("player:")) players.set(player.id, player);
    const totals = new Map<string, Totals>();
    if (period === "global") {
      for (const player of players.values()) totals.set(player.id, { rating: player.rating, wins: player.wins, games: player.games });
    } else {
      const since = now - (period === "weekly" ? 7 : 30) * DAY_MS;
      for await (const result of this.rows<DatedResult>("date:", timeKey(since))) {
        const total = totals.get(result.playerId) ?? { rating: 0, wins: 0, games: 0 };
        total.rating += result.points;
        total.wins += Number(result.outcome === "win");
        total.games++;
        totals.set(result.playerId, total);
      }
    }
    return [...players.values()].filter((player) => (totals.get(player.id)?.games ?? 0) > 0)
      .sort((left, right) => {
        const a = totals.get(left.id)!;
        const b = totals.get(right.id)!;
        return b.rating - a.rating || b.wins - a.wins || a.games - b.games || left.createdAt - right.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
      }).slice(0, limit).map((player, index) => ({ id: player.id, name: player.name, styleId: player.styleId, ...totals.get(player.id)!, rank: index + 1 }));
  }
}
