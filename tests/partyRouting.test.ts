import { describe, expect, it, vi } from "vitest";
import type * as Party from "partykit/server";
import OthelloRoom from "../party/server";

const ORIGIN = "https://flip-buddies.example.com";

function routing() {
  const fetch = vi.fn(async (_path: string, _request: Party.Request) => new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Accept-Encoding" },
  }));
  const get = vi.fn(() => ({ fetch }));
  const lobby = { parties: { practice: { get } }, env: {} } as unknown as Party.FetchLobby;
  const route = (request: Request) => OthelloRoom.onFetch(request as unknown as Party.Request, lobby);
  return { route, fetch, get };
}

describe("PartyKit public API routing", () => {
  it("checks the public origin, forwards the body and token, and removes Origin before the internal call", async () => {
    const h = routing();
    const body = { playerId: "test-player", match: { id: "test-match", moves: [] } };
    const request = new Request(`${ORIGIN}/api/matches?source=local`, {
      method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer local-test-token", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await h.route(request);
    expect(h.get).toHaveBeenCalledExactlyOnceWith("global");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const [path, forwarded] = h.fetch.mock.calls[0];
    expect(path).toBe("/api/matches?source=local");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("origin")).toBeNull();
    expect(forwarded.headers.get("authorization")).toBe("Bearer local-test-token");
    expect(forwarded.headers.get("content-type")).toBe("application/json");
    expect(await forwarded.json()).toEqual(body);
    expect(request.headers.get("origin")).toBe(ORIGIN);
    expect(response?.status).toBe(201);
    expect(response?.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response?.headers.get("vary")).toContain("Origin");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ ok: true });
  });

  it.each(["https://other.example.com", "http://flip-buddies.example.com", "null"])("rejects foreign origin %s without calling the room", async (origin) => {
    const h = routing();
    const response = await h.route(new Request(`${ORIGIN}/api/leaderboard`, { headers: { Origin: origin } }));
    expect(response?.status).toBe(403);
    expect(response?.headers.get("access-control-allow-origin")).toBeNull();
    expect(h.get).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("allows requests without an Origin and does not add permissive CORS headers", async () => {
    const h = routing();
    const response = await h.route(new Request(`${ORIGIN}/api/leaderboard?period=weekly`));
    expect(h.get).toHaveBeenCalledExactlyOnceWith("global");
    expect(h.fetch.mock.calls[0][0]).toBe("/api/leaderboard?period=weekly");
    expect(h.fetch.mock.calls[0][1].headers.get("origin")).toBeNull();
    expect(response?.status).toBe(201);
    expect(response?.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each(["/", "/assets/pill.webp", "/api", "/apiculture"])("leaves static route %s to the asset handler", async (path) => {
    const h = routing();
    expect(await h.route(new Request(`${ORIGIN}${path}`))).toBeUndefined();
    expect(h.get).not.toHaveBeenCalled();
  });
});
