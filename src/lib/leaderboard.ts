import type { MatchResult, Profile } from "./storage";
import { readStored, writeStored } from "./storage";

export interface Ranking {
  id: string;
  name: string;
  styleId: string;
  rating: number;
  wins: number;
  games: number;
  rank: number;
}
interface Identity {
  id: string;
  token: string;
}
interface PendingResult {
  profile: Profile;
  result: MatchResult;
}

const base =
  (import.meta.env.VITE_LEADERBOARD_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "";
const identityKey = `flip.identity.${base || "local"}`;
const queueKey = `flip.pending-results.${base || "local"}`;

export function getCurrentPlayerId(): string | null {
  return readStored<Identity | null>(identityKey, null, isIdentity)?.id ?? null;
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) throw new Error("Rankings are not available.");
  return response.json();
}

export async function getRankings(period: string): Promise<Ranking[]> {
  return (await request(`/leaderboard?period=${encodeURIComponent(period)}`))
    .players;
}

function isIdentity(value: unknown): value is Identity {
  const item = value as Identity | null;
  return (
    !!item &&
    typeof item.id === "string" &&
    !!item.id &&
    typeof item.token === "string" &&
    !!item.token
  );
}

function isPendingResult(value: unknown): value is PendingResult {
  const item = value as PendingResult | null;
  const profile = item?.profile;
  const result = item?.result;
  return (
    !!profile &&
    typeof profile.id === "string" &&
    typeof profile.name === "string" &&
    typeof profile.styleId === "string" &&
    !!result &&
    typeof result.id === "string" &&
    typeof result.date === "string" &&
    typeof result.black === "number" &&
    typeof result.white === "number" &&
    ["win", "loss", "draw"].includes(result.outcome) &&
    ["easy", "normal", "hard"].includes(result.difficulty) &&
    typeof result.surrendered === "boolean" &&
    Array.isArray(result.moves) &&
    result.moves.every(
      (index) => Number.isInteger(index) && index >= 0 && index < 64,
    )
  );
}

// Keep a memory copy too, so a full or disabled browser store does not prevent play.
let pending: PendingResult[] | undefined;
const completedThisSession = new Set<string>();
function getPending(): PendingResult[] {
  if (!pending) {
    const stored = readStored<unknown>(queueKey, []);
    const seen = new Set<string>();
    pending = (Array.isArray(stored) ? stored : [])
      .filter(isPendingResult)
      .filter((item) => {
        if (seen.has(item.result.id)) return false;
        seen.add(item.result.id);
        return true;
      });
  }
  return pending;
}

function savePending(next: PendingResult[]) {
  pending = next;
  writeStored(queueKey, next);
}

let identity: Identity | null | undefined;
let identityRequest: Promise<Identity> | null = null;
function getIdentity(profile: Profile): Promise<Identity> {
  if (identity === undefined)
    identity = readStored<Identity | null>(identityKey, null, isIdentity);
  if (identity) return Promise.resolve(identity);
  if (!identityRequest) {
    identityRequest = request("/players", {
      method: "POST",
      body: JSON.stringify({ name: profile.name, styleId: profile.styleId }),
    })
      .then((value) => {
        if (!isIdentity(value))
          throw new Error("The player profile could not be saved.");
        identity = value;
        writeStored(identityKey, value);
        return value;
      })
      .finally(() => {
        identityRequest = null;
      });
  }
  return identityRequest;
}

async function sendResult({ profile, result }: PendingResult) {
  const player = await getIdentity(profile);
  await request("/matches", {
    method: "POST",
    headers: { Authorization: `Bearer ${player.token}` },
    body: JSON.stringify({
      playerId: player.id,
      name: profile.name,
      styleId: profile.styleId,
      match: result,
    }),
  });
}

let flushRequest: Promise<void> | null = null;

/** Retry the saved queue. Only a confirmed response removes a match. */
export function flushPendingResults(): Promise<void> {
  if (flushRequest) return flushRequest;
  if (!getPending().length) return Promise.resolve();
  flushRequest = (async () => {
    while (getPending().length) {
      const item = getPending()[0];
      await sendResult(item);
      completedThisSession.add(item.result.id);
      // Read the current queue, not the copy from before the request. Another
      // match can be added while the network request is still in progress.
      savePending(
        getPending().filter((entry) => entry.result.id !== item.result.id),
      );
    }
  })().finally(() => {
    flushRequest = null;
  });
  return flushRequest;
}

/** Save before sending. Repeated calls for one match share a single queue entry. */
export async function enqueueResult(
  profile: Profile,
  result: MatchResult,
): Promise<void> {
  if (completedThisSession.has(result.id)) return;
  if (!getPending().some((item) => item.result.id === result.id)) {
    savePending([
      ...getPending(),
      {
        profile: { ...profile },
        result: { ...result, moves: [...result.moves] },
      },
    ]);
  }
  await flushPendingResults();
  // An entry can arrive just after an existing flush drains, before its promise
  // settles. Start another flush if this call joined that finished request.
  if (getPending().some((item) => item.result.id === result.id))
    await flushPendingResults();
}

/** Kept for callers that used the original direct submission API. */
export const submitResult = enqueueResult;
