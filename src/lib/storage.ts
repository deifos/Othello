export function readStored<T>(
  key: string,
  fallback: T,
  valid?: (v: unknown) => boolean,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return !valid || valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The current game still works when browser storage is full or blocked. */
  }
}
export interface Profile {
  id: string;
  name: string;
  styleId: string;
}
export interface MatchResult {
  mode?: "classic" | "enhanced";
  id: string;
  date: string;
  black: number;
  white: number;
  outcome: "win" | "loss" | "draw";
  difficulty: string;
  moves: number[];
  surrendered: boolean;
}
export const initialProfile: Profile = {
  id: crypto.randomUUID(),
  name: "Little Flipper",
  styleId: "classic",
};
export function loadProfile(): Profile {
  return readStored(
    "flip.profile",
    initialProfile,
    (v) =>
      !!v &&
      typeof v === "object" &&
      typeof (v as Profile).id === "string" &&
      typeof (v as Profile).name === "string" &&
      typeof (v as Profile).styleId === "string",
  );
}
export function loadResults(): MatchResult[] {
  return readStored(
    "flip.results",
    [],
    (v) =>
      Array.isArray(v) &&
      v.every(
        (r) =>
          r &&
          typeof r.id === "string" &&
          typeof r.date === "string" &&
          ["win", "loss", "draw"].includes(r.outcome),
      ),
  );
}
