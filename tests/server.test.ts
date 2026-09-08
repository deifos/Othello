import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import type { AppOptions } from "../server/app";
import { verifyMatch } from "../server/validation";
import {
  applyMove,
  createBoard,
  getLegalMoves,
  getNextTurn,
  getScore,
} from "../src/game/engine";
import type { Player } from "../src/game/engine";

const openApps: ReturnType<typeof createApp>[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const app of openApps.splice(0)) await app.close();
  for (const dir of tempDirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

describe("production music streaming", () => {
  async function musicServer(content = Buffer.from("0123456789")) {
    const dir = await temporaryDirectory();
    const dist = join(dir, "dist");
    await mkdir(join(dist, "audio", "music"), { recursive: true });
    await writeFile(join(dist, "audio", "music", "theme.mp3"), content);
    const { base } = await launch({ distPath: dist });
    return { base, url: `${base}/audio/music/theme.mp3`, content };
  }

  it("serves MP3 audio and HEAD metadata without a response body", async () => {
    const { url, content } = await musicServer();
    const full = await fetch(url);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("audio/mpeg");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(full.headers.get("content-length")).toBe(String(content.length));
    expect(Buffer.from(await full.arrayBuffer())).toEqual(content);

    const headRequests: Record<string, string>[] = [{}, { Range: "bytes=2-4" }, { Range: "bytes=99-" }];
    for (const headers of headRequests) {
      const head = await fetch(url, { method: "HEAD", headers });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe(String(content.length));
      expect(head.headers.get("content-range")).toBeNull();
      expect(await head.text()).toBe("");
    }
  });

  it("streams exact bounded, open-ended, and suffix ranges", async () => {
    const { url } = await musicServer();
    for (const [range, expected, contentRange] of [
      ["bytes=2-4", "234", "bytes 2-4/10"],
      ["bytes=7-", "789", "bytes 7-9/10"],
      ["bytes=-3", "789", "bytes 7-9/10"],
      ["bytes=8-999999999999999999999", "89", "bytes 8-9/10"],
      ["bytes=-999999999999999999999", "0123456789", "bytes 0-9/10"],
      ["bytes=0-0", "0", "bytes 0-0/10"],
    ]) {
      const response = await fetch(url, { headers: { Range: range } });
      expect(response.status, range).toBe(206);
      expect(response.headers.get("content-type")).toBe("audio/mpeg");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.headers.get("content-range")).toBe(contentRange);
      expect(response.headers.get("content-length")).toBe(String(expected.length));
      expect(await response.text()).toBe(expected);
    }
  });

  it("returns 416 with the full length for ranges that select no bytes", async () => {
    const { url } = await musicServer();
    for (const range of ["bytes=10-", "bytes=99-100", "bytes=5-2", "bytes=-0", "bytes=999999999999999999999-"]) {
      const response = await fetch(url, { headers: { Range: range } });
      expect(response.status, range).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */10");
      expect(response.headers.get("content-length")).toBe("0");
      expect(await response.text()).toBe("");
    }

    const empty = await musicServer(Buffer.alloc(0));
    const response = await fetch(empty.url, { headers: { Range: "bytes=0-" } });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */0");
    expect(await response.text()).toBe("");
  });

  it("returns the full file for malformed, multiple, unknown, or conditional ranges", async () => {
    const { url } = await musicServer();
    const rangeRequests: Record<string, string>[] = [
      { Range: "bytes=bad" },
      { Range: "bytes=-" },
      { Range: "bytes=0-1,4-5" },
      { Range: "seconds=0-1" },
      { Range: "bytes=0-1", "If-Range": '"old-file"' },
    ];
    for (const headers of rangeRequests) {
      const response = await fetch(url, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-range")).toBeNull();
      expect(response.headers.get("content-length")).toBe("10");
      expect(await response.text()).toBe("0123456789");
    }
  });

  it("keeps range requests inside the static file and API guards", async () => {
    const { base } = await musicServer();
    const headers = { Range: "bytes=0-3" };
    for (const path of ["/%2e%2e%5cprivate.mp3", "/audio/music/.hidden.mp3", "/audio/music/missing.mp3"]) {
      const response = await fetch(`${base}${path}`, { headers });
      expect(response.status).toBe(404);
      expect(response.headers.get("content-range")).toBeNull();
    }
    const api = await fetch(`${base}/api/leaderboard`, { headers });
    expect(api.status).toBe(200);
    expect(api.headers.get("content-range")).toBeNull();
    expect(await api.json()).toEqual({ players: [] });
  });

  it("closes the file stream when the client cancels a music transfer", async () => {
    const { url, content } = await musicServer(Buffer.alloc(8 * 1024 * 1024, 7));
    const piped = vi.spyOn(fs.ReadStream.prototype, "pipe");
    const controller = new AbortController();
    try {
      const response = await fetch(url, { signal: controller.signal });
      const stream = piped.mock.contexts[0] as fs.ReadStream;
      const closed = once(stream, "close");
      const firstChunk = await response.body!.getReader().read();
      expect(firstChunk.value?.length).toBeGreaterThan(0);
      controller.abort();
      await closed;
      expect(stream.destroyed).toBe(true);
      expect(stream.bytesRead).toBeLessThan(content.length);
    } finally {
      controller.abort();
      piped.mockRestore();
    }
    const resumed = await fetch(url, { headers: { Range: "bytes=65536-65538" } });
    expect(resumed.status).toBe(206);
    expect(Buffer.from(await resumed.arrayBuffer())).toEqual(Buffer.from([7, 7, 7]));
  });
});

async function launch(options: AppOptions = {}) {
  const app = createApp({
    databasePath: ":memory:",
    distPath: "missing-test-dist",
    ...options,
  });
  openApps.push(app);
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return { app, base };
}

async function temporaryDirectory() {
  const dir = await mkdtemp(join(tmpdir(), "flip-rankings-"));
  tempDirs.push(dir);
  return dir;
}

async function request(
  base: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function player(base: string, name = "Little Flipper") {
  const response = await request(base, "/players", {
    name,
    styleId: "classic",
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; token: string };
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
  return {
    id: `match-${seed}`,
    moves,
    surrendered: false,
    difficulty: "normal",
    ...getScore(board),
  };
}

function matchBody(
  identity: { id: string },
  match: unknown,
  name = "Little Flipper",
) {
  return { playerId: identity.id, name, styleId: "classic", match };
}

describe("practice rankings API", () => {
  it("rejects Enhanced results before storage and accepts an explicit Classic result", async () => {
    const { base } = await launch();
    const identity = await player(base);
    const headers = { Authorization: `Bearer ${identity.token}` };
    const record = fullMatch();
    for (const mode of ["enhanced", "unknown", null]) {
      const response = await request(base, "/matches", matchBody(identity, { ...record, mode }), headers);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("Classic") });
    }
    expect(await (await request(base, "/leaderboard")).json()).toEqual({ players: [] });
    const accepted = await request(base, "/matches", matchBody(identity, { ...record, mode: "classic" }), headers);
    expect(accepted.status).toBe(200);
    const rankings = await (await request(base, "/leaderboard")).json();
    expect(rankings.players).toHaveLength(1);
    expect(rankings.players[0].games).toBe(1);
  });

  it("accepts the emoji and punctuation allowed in the profile form", async () => {
    const { base } = await launch();
    for (const name of ["Vlad 🎮", "Flip!", "Little <Flipper>"]) {
      const identity = await player(base, name);
      const saved = await request(
        base,
        "/matches",
        matchBody(
          identity,
          {
            id: `match-${identity.id}`,
            moves: [],
            difficulty: "normal",
            surrendered: true,
          },
          name,
        ),
        { Authorization: `Bearer ${identity.token}` },
      );
      expect(saved.ok).toBe(true);
    }
    const rankings = await (await request(base, "/leaderboard")).json();
    expect(
      rankings.players.map((entry: { name: string }) => entry.name),
    ).toEqual(expect.arrayContaining(["Vlad 🎮", "Flip!", "Little <Flipper>"]));
  });
  it("starts empty and shows only players with a submitted match", async () => {
    const { base } = await launch();
    await player(base);
    const response = await request(base, "/leaderboard?period=global");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ players: [] });
  });

  it("replays the record, ignores claimed results, and counts each match once", async () => {
    const { base } = await launch();
    const identity = await player(base);
    const record = fullMatch();
    const expected = verifyMatch(record);
    const body = matchBody(identity, {
      ...record,
      black: 900,
      white: -3,
      outcome: "win",
      date: "2099-01-01",
    });
    const headers = { Authorization: `Bearer ${identity.token}` };
    const first = await request(base, "/matches", body, headers);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      duplicate: false,
      black: expected.black,
      white: expected.white,
      outcome: expected.outcome,
      points: expected.points,
    });
    const duplicate = await request(base, "/matches", body, headers);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });
    const rankings = await (await request(base, "/leaderboard")).json();
    expect(rankings.players).toEqual([
      {
        id: identity.id,
        name: "Little Flipper",
        styleId: "classic",
        rating: expected.points,
        wins: Number(expected.outcome === "win"),
        games: 1,
        rank: 1,
      },
    ]);
  });

  it("requires the correct token and rejects illegal or incomplete move records", async () => {
    const { base } = await launch();
    const identity = await player(base);
    const other = await player(base, "Other Player");
    const body = matchBody(identity, {
      id: "test",
      moves: [19],
      surrendered: false,
      difficulty: "normal",
    });
    expect((await request(base, "/matches", body)).status).toBe(401);
    expect(
      (
        await request(base, "/matches", body, {
          Authorization: `Bearer ${other.token}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(base, "/matches", body, {
          Authorization: `Bearer ${identity.token}`,
        })
      ).status,
    ).toBe(400);
    body.match = {
      id: "test",
      moves: [0],
      surrendered: true,
      difficulty: "normal",
    };
    expect(
      (
        await request(base, "/matches", body, {
          Authorization: `Bearer ${identity.token}`,
        })
      ).status,
    ).toBe(400);
    expect(
      (await (await request(base, "/leaderboard")).json()).players,
    ).toHaveLength(0);
  });

  it("counts a surrender as a loss and rejects reuse of its ID for another record", async () => {
    const { base } = await launch();
    const identity = await player(base);
    const headers = { Authorization: `Bearer ${identity.token}` };
    const body = matchBody(identity, {
      id: "surrender",
      moves: [19],
      surrendered: true,
      difficulty: "easy",
    });
    const first = await request(base, "/matches", body, headers);
    expect(await first.json()).toMatchObject({
      black: 4,
      white: 1,
      outcome: "loss",
      points: 0,
    });
    body.match = {
      id: "surrender",
      moves: [],
      surrendered: true,
      difficulty: "easy",
    };
    expect((await request(base, "/matches", body, headers)).status).toBe(409);
    expect(
      (await (await request(base, "/leaderboard")).json()).players[0],
    ).toMatchObject({ games: 1, wins: 0, rating: 0 });
  });

  it("filters by server time for rolling 7 and 30 day periods", async () => {
    let now = Date.UTC(2026, 0, 1);
    const { base } = await launch({ now: () => now });
    const identity = await player(base);
    const headers = { Authorization: `Bearer ${identity.token}` };
    for (const [id, day] of [
      ["old", 0],
      ["month", 25],
      ["week", 39],
    ] as const) {
      now = Date.UTC(2026, 0, 1 + day);
      const response = await request(
        base,
        "/matches",
        matchBody(identity, {
          id,
          moves: [],
          surrendered: true,
          difficulty: "normal",
          date: "1900-01-01",
        }),
        headers,
      );
      expect(response.status).toBe(200);
    }
    now = Date.UTC(2026, 0, 41);
    for (const [period, games] of [
      ["global", 3],
      ["monthly", 2],
      ["weekly", 1],
    ] as const) {
      const data = await (
        await request(base, `/leaderboard?period=${period}`)
      ).json();
      expect(data.players[0].games).toBe(games);
    }
    expect((await request(base, "/leaderboard?period=friends")).status).toBe(
      400,
    );
  });

  it("rejects malformed JSON, large bodies, and invalid names and styles", async () => {
    const { base } = await launch();
    const malformed = await fetch(`${base}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(
      (
        await request(base, "/players", {
          name: "x".repeat(9000),
          styleId: "classic",
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await request(base, "/players", {
          name: "Bad\u0000name",
          styleId: "classic",
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(base, "/players", { name: "Vlad", styleId: "../secret" }))
        .status,
    ).toBe(400);
    expect((await request(base, "/players", null)).status).toBe(400);
  });

  it("allows only the same origin or the explicit configured origin", async () => {
    const { base } = await launch({
      allowedOrigin: "https://play.example.com",
    });
    const same = await request(base, "/leaderboard", undefined, {
      Origin: base,
    });
    expect(same.headers.get("access-control-allow-origin")).toBe(base);
    const allowed = await request(base, "/leaderboard", undefined, {
      Origin: "https://play.example.com",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://play.example.com",
    );
    const rejected = await request(base, "/leaderboard", undefined, {
      Origin: "https://other.example.com",
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await fetch(`${base}/api/matches`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://play.example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(preflight.status).toBe(204);
    expect(() =>
      createApp({ databasePath: ":memory:", allowedOrigin: "*" }),
    ).toThrow();
  });

  it("stores token hashes and keeps submitted matches after a restart", async () => {
    const dir = await temporaryDirectory();
    const path = join(dir, "rankings.sqlite");
    const first = await launch({ databasePath: path });
    const identity = await player(first.base);
    await request(
      first.base,
      "/matches",
      matchBody(identity, {
        id: "persistent",
        moves: [],
        surrendered: true,
        difficulty: "normal",
      }),
      { Authorization: `Bearer ${identity.token}` },
    );
    await first.app.close();
    openApps.splice(openApps.indexOf(first.app), 1);
    const db = new DatabaseSync(path, { readOnly: true });
    const row = db
      .prepare("SELECT token_hash FROM players WHERE id = ?")
      .get(identity.id)!;
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.token_hash).not.toBe(identity.token);
    db.close();
    expect((await readFile(path)).includes(Buffer.from(identity.token))).toBe(
      false,
    );
    const next = await launch({ databasePath: path });
    const rankings = await (await request(next.base, "/leaderboard")).json();
    expect(rankings.players[0]).toMatchObject({ id: identity.id, games: 1 });
  });

  it("serves production pages and assets without exposing files outside dist", async () => {
    const dir = await temporaryDirectory();
    const dist = join(dir, "dist");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(
      join(dist, "index.html"),
      "<!doctype html><title>Flip</title>",
    );
    await writeFile(join(dist, "assets", "main-a1.js"), 'console.log("flip")');
    await writeFile(join(dir, "private.txt"), "private-data");
    const { base } = await launch({ distPath: dist });
    const page = await fetch(`${base}/play`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Flip</title>");
    const asset = await fetch(`${base}/assets/main-a1.js`);
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(await asset.text()).toBe('console.log("flip")');
    const head = await fetch(`${base}/play`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    const escaped = await fetch(`${base}/%2e%2e%5cprivate.txt`);
    expect(escaped.status).toBe(404);
    expect(await escaped.text()).not.toContain("private-data");
  });
});
