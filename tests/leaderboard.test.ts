import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchResult, Profile } from "../src/lib/storage";

const profile: Profile = {
  id: "local-player",
  name: "Little Flipper",
  styleId: "classic",
};
const result = (id: string): MatchResult => ({
  id,
  date: "2026-09-06T12:00:00.000Z",
  black: 2,
  white: 2,
  outcome: "loss",
  difficulty: "normal",
  moves: [],
  surrendered: true,
});
const queueKey = "flip.pending-results.local";
let store: Map<string, string>;

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saved leaderboard queue", () => {
  it("saves before sending and restores an offline result after a page reload", async () => {
    const fetchMock = vi.fn(async () => {
      expect(JSON.parse(store.get(queueKey)!)[0].result.id).toBe(
        "offline-match",
      );
      throw new TypeError("Offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    const firstPage = await import("../src/lib/leaderboard");
    await expect(
      firstPage.enqueueResult(profile, result("offline-match")),
    ).rejects.toThrow("Offline");
    expect(JSON.parse(store.get(queueKey)!)).toHaveLength(1);

    vi.resetModules();
    const restoredPage = await import("../src/lib/leaderboard");
    const recoveredFetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: "shared-player", token: "token" }))
      .mockResolvedValueOnce(json({ duplicate: false }));
    vi.stubGlobal("fetch", recoveredFetch);
    await restoredPage.flushPendingResults();
    expect(recoveredFetch).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(recoveredFetch.mock.calls[1][1].body)),
    ).toMatchObject({
      playerId: "shared-player",
      name: profile.name,
      match: { id: "offline-match" },
    });
    expect(JSON.parse(store.get(queueKey)!)).toEqual([]);
  });

  it("shares player creation and deduplicates concurrent calls by match ID", async () => {
    const playerResponse = deferred<Response>();
    const fetchMock = vi.fn((url: string) =>
      url.endsWith("/players")
        ? playerResponse.promise
        : Promise.resolve(json({ duplicate: false })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("../src/lib/leaderboard");
    const first = api.enqueueResult(profile, result("first"));
    const duplicate = api.enqueueResult(profile, result("first"));
    const second = api.submitResult(
      { ...profile, name: "New name" },
      result("second"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(queueKey)!)).toHaveLength(2);
    playerResponse.resolve(json({ id: "one-player", token: "token" }));
    await Promise.all([first, duplicate, second]);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/players")),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/matches")),
    ).toHaveLength(2);
    await api.enqueueResult(profile, result("first"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves a new entry added while an older match is being sent", async () => {
    store.set(
      "flip.identity.local",
      JSON.stringify({ id: "one-player", token: "token" }),
    );
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("../src/lib/leaderboard");
    const first = api.enqueueResult(profile, result("first"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = api.enqueueResult(profile, result("second"));
    firstResponse.resolve(json({ duplicate: false }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      JSON.parse(store.get(queueKey)!).map(
        (item: { result: MatchResult }) => item.result.id,
      ),
    ).toEqual(["second"]);
    secondResponse.resolve(json({ duplicate: false }));
    await Promise.all([first, second]);
    expect(JSON.parse(store.get(queueKey)!)).toEqual([]);
  });

  it("retains a failed match and retries it with the same identity and ID", async () => {
    store.set(
      "flip.identity.local",
      JSON.stringify({ id: "one-player", token: "token" }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(json({ duplicate: true }));
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("../src/lib/leaderboard");
    await expect(
      api.enqueueResult(profile, result("retry-me")),
    ).rejects.toThrow();
    expect(JSON.parse(store.get(queueKey)!)).toHaveLength(1);
    await api.flushPendingResults();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(
      ([, options]) => options as RequestInit,
    );
    expect(requests[0].body).toEqual(requests[1].body);
    expect(requests[0].headers).toMatchObject({
      Authorization: "Bearer token",
    });
    expect(JSON.parse(store.get(queueKey)!)).toEqual([]);
  });
});
