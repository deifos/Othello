import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HttpError } from "./validation";
import type { VerifiedMatch } from "./validation";

export type Period = "global" | "weekly" | "monthly";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class RankingStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        style_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS matches (
        player_id TEXT NOT NULL REFERENCES players(id),
        match_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        points INTEGER NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
        black INTEGER NOT NULL,
        white INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        surrendered INTEGER NOT NULL,
        moves TEXT NOT NULL,
        record_hash TEXT NOT NULL,
        PRIMARY KEY (player_id, match_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS matches_date ON matches(played_at);
    `);
  }

  createPlayer(name: string, styleId: string, now: number) {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare(
        "INSERT INTO players (id, token_hash, name, style_id, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, hash(token), name, styleId, now);
    return { id, token };
  }

  authenticate(playerId: string, token: string): void {
    const row = this.db
      .prepare("SELECT token_hash FROM players WHERE id = ?")
      .get(playerId);
    // Use a fixed-size digest comparison for known and unknown identities.
    const expected = row ? String(row.token_hash) : "0".repeat(64);
    const matches = timingSafeEqual(
      Buffer.from(hash(token), "hex"),
      Buffer.from(expected, "hex"),
    );
    if (!row || !matches)
      throw new HttpError(401, "The player token is not valid.");
  }

  saveMatch(
    playerId: string,
    name: string,
    styleId: string,
    match: VerifiedMatch,
    now: number,
  ) {
    const recordHash = hash(
      JSON.stringify({
        difficulty: match.difficulty,
        moves: match.moves,
        surrendered: match.surrendered,
      }),
    );
    const existing = this.db
      .prepare(
        "SELECT record_hash, black, white, outcome, points FROM matches WHERE player_id = ? AND match_id = ?",
      )
      .get(playerId, match.id);
    if (existing) {
      if (existing.record_hash !== recordHash)
        throw new HttpError(
          409,
          "This match ID already has a different move record.",
        );
      return {
        duplicate: true,
        black: existing.black,
        white: existing.white,
        outcome: existing.outcome,
        points: existing.points,
      };
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO matches (player_id, match_id, played_at, points, outcome, black, white, difficulty, surrendered, moves, record_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          playerId,
          match.id,
          now,
          match.points,
          match.outcome,
          match.black,
          match.white,
          match.difficulty,
          Number(match.surrendered),
          JSON.stringify(match.moves),
          recordHash,
        );
      this.db
        .prepare("UPDATE players SET name = ?, style_id = ? WHERE id = ?")
        .run(name, styleId, playerId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      duplicate: false,
      black: match.black,
      white: match.white,
      outcome: match.outcome,
      points: match.points,
    };
  }

  rankings(period: Period, now: number) {
    // Weekly and monthly boards are rolling windows of 7 and 30 days.
    const since =
      period === "global"
        ? 0
        : now - (period === "weekly" ? 7 : 30) * 86_400_000;
    const rows = this.db
      .prepare(
        `
      SELECT p.id, p.name, p.style_id AS styleId, SUM(m.points) AS rating,
        SUM(CASE WHEN m.outcome = 'win' THEN 1 ELSE 0 END) AS wins, COUNT(*) AS games
      FROM players p JOIN matches m ON m.player_id = p.id
      WHERE m.played_at >= ?
      GROUP BY p.id
      ORDER BY rating DESC, wins DESC, games ASC, p.created_at ASC, p.id ASC
      LIMIT 100
    `,
      )
      .all(since);
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  close(): void {
    this.db.close();
  }
}
