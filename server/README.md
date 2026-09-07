# Practice rankings

The API stores shared rankings for local human-versus-CPU games. It checks every
move by replaying the Othello rules. It calculates the result and points on the
server. It does not check that a real person or the supplied CPU played the moves.
These are practice rankings, not competitive multiplayer ratings.

## Run

- Use Node.js 24 or later.
- Run `npm run dev` for the web app and API.
- For production, run `npm run build`, then `npm start`.
- The default API port is `3001`.
- The production server serves the built `dist` files and page routes.

## Configuration

| Variable | Default | Use |
| --- | --- | --- |
| `PORT` | `3001` | HTTP listen port |
| `DATABASE_PATH` | `data/leaderboard.sqlite` | Persistent SQLite file |
| `ALLOWED_ORIGIN` | none | One exact public origin, such as `https://play.example.com` |

Same-origin HTTP requests are allowed. Set `ALLOWED_ORIGIN` when a separate domain
hosts the client, or when a proxy supplies the public HTTPS connection. Do not use
`*`. The app does not trust forwarded headers to choose an allowed origin.

Keep the database on persistent storage. SQLite uses a WAL file beside the main
file. Use a SQLite backup operation, or stop the service before copying its data
files. A single server can serve all players in this phase.

## API

- `POST /api/players` accepts `{name, styleId}` and returns `{id, token}`. The server
  stores a hash of the token. The client keeps the token on the current device.
- `POST /api/matches` accepts `{playerId, name, styleId, match}` with
  `Authorization: Bearer <token>`. A match needs `id`, `moves`, `difficulty`, and
  `surrendered`. The player uses black. Claimed scores, dates, and outcomes are
  ignored. A surrender is a loss. The same ID and move record can be sent again
  without adding points. A changed record with the same ID gets a `409` response.
- `GET /api/leaderboard?period=global|weekly|monthly` returns `{players}`. Each row
  has `id`, `name`, `styleId`, `rating`, `wins`, `games`, and `rank`.

Wins earn 30 points, draws earn 10, and losses earn 0. Weekly and monthly filters
use rolling windows of 7 and 30 days, based on the time of first receipt by the
server. Only players with a recorded match appear. The API returns the first 100
rows. Ties use wins, fewer games, account creation time, then player ID.

## Multiplayer phase

Use `src/game/protocol.ts` for the versioned transport contract. A future PartyKit
server must own the board and player turns. It must send verified match results
to a separate competitive ranking path. Do not accept a local move record as
proof of a competitive win.
