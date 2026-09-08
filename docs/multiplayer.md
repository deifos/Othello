# PartyKit multiplayer

## Play with a friend

Choose **Friends** or **Play with Friends**. Choose **Classic** or **Enhanced**,
create a room, then share its invite link or six-character code. The host can
change the mode in the waiting room; a change clears both Ready choices.
Both players choose **I'm ready**. Black plays first. The mode stays fixed
until the match ends.
Each player keeps the pill style selected before joining the room. On a capture,
the pill changes to the new owner's style.

The game server validates moves, handles automatic passes, and declares the
result. There is no CPU in a friend room. Surrender ends the round while keeping
the room open. Leave room exits it. Both players must request a rematch; colors
swap for the next round. A rematch keeps the mode and clears tokens and effects.
To change mode after a match, create a new room. If the host leaves or expires
while waiting, the remaining player becomes the host.

Classic friend matches have no abilities or Undo. Enhanced adds earned Undo,
Shield, and Corner Claim. **Choosing Ready in Enhanced is agreement to all its
rules, including immediate earned Undo without a second opponent approval.**
Both players see the selected rules before they accept. See the
[mode and ability guide](enhanced.md) for reward priority, targets, expiry, and
the exact Undo behavior.

The client stops accepting moves while disconnected. A seat is held for 60
seconds. If one player fails to return and the other remains connected, the
remaining player wins. If both are absent, the match is abandoned without a
winner. Reloading within the grace period restores the same seat, board, mode,
tokens, effects, and Undo history. Disconnected players cannot use abilities.

Rooms are temporary: waiting and finished rooms expire after 30 idle minutes;
a playing room expires after two idle hours. Each room supports two seats and up
to four tabs per seat. Clearing browser storage removes the private seat key.
An invite link contains only the room code and never the seat key.

## Local development

Run `npm run dev` to start Vite (5173), the local SQLite practice API (3001), and
PartyKit (1999). Use separate browser profiles to test two different players.
Tabs in one browser profile share a seat, so a reload cannot take a second seat.
On another device on the same network, open the development computer's network
address on port 5173. Both devices must be able to reach port 1999.

`npm run dev:multiplayer` starts only the room service. Local room storage is in
`.partykit/` and is ignored by Git. No service is needed for offline CPU play.

## Public deployment

For a new deployment or a fork, follow the [deployment guide](deployment.md).
It covers the live Cloudflare arrangement, PartyKit-only hosting, and a Vercel
website with PartyKit services, including the practice URL and allowed-origin
setting.

The live app is [flipbuddies.vladpalacio.com](https://flipbuddies.vladpalacio.com/).
Its Cloudflare Worker uses the same room implementation inside a SQLite
Durable Object. [The PartyKit site](https://flip-buddies.deifos.partykit.dev/)
is an alternative deployment. Rooms and practice records on the two hosts
are separate; an invite belongs to the host that created it.

The PartyKit configuration includes the room service and a separate global practice
API. The deployment command also uploads the built static app with `--serve dist`.
Keeping this flag out of the development config avoids watching the build folder
while Vite replaces it. `VITE_PARTYKIT_HOST` names the public PartyKit host.
It is a public address, not a secret. Development defaults to port 1999 unless
this variable is explicitly supplied. A production build with no host shows a
clear setup message instead of trying to connect to the visitor's localhost.

Build the app, then run `npm run deploy:multiplayer` from a logged-in PartyKit
account. The CLI prints the public address. Share a link from that public app;
a link beginning with localhost only works on the same computer. The hosted
practice API uses PartyKit storage, while local development uses SQLite. These
are separate datasets. Existing local records are not copied to the public host.

Friend matches in both modes are unranked. They never enter the client-submitted
Classic CPU practice leaderboard. Enhanced CPU results stay on the device.
The practice API verifies each Classic CPU move transcript and derives the
score; it does not claim to prove who selected those moves. Account identity and
competitive ratings remain a separate feature.

The practice store is limited to 5,000 profiles and 50,000 result receipts. It
is intended for this small public prototype. Larger use needs stronger abuse
controls and a ranking index that does not scan all records for a time period.

## Implementation

- `src/game/engine.ts`: standard Othello capture rules.
- `src/game/enhanced.ts`: shared Classic and Enhanced actions, token inventory,
  effects, and private Undo history.
- `src/game/protocol.ts`: version 3 commands, mode and host assignments, and snapshots.
- `party/server.ts`: serialized, authoritative room lifecycle and durable storage.
- `party/practice.ts`: hosted CPU practice API, separate from online rooms.
- `src/lib/multiplayer.ts`: PartySocket transport, private seat key, strict snapshot
  checks, acknowledgements, and reconnect handling. Offline moves are not queued.
  An idle heartbeat detects silent connection loss; browser offline/online events
  stop input immediately and restore the same private seat when online.
- `src/lib/useMultiplayer.ts`: React lifecycle and profile integration.
- `src/components/MultiplayerPage.tsx`: create/join, waiting room, board, and rematch.
- `src/components/GameBoard.tsx`: shared animated board with per-player styles.

The server saves a state change before broadcasting it. It validates protocol
version, match ID, revision, turn, and legal tile. Mode changes also require the
host's seat and a waiting match. Abilities require Enhanced mode, the acting
player's turn, an earned token, and a valid target. Both players must be
connected. Player identity comes from the
connection's private token, not a claimed color in the move. Only token hashes
are stored; public snapshots include no secrets or private Undo history.
The latest 128 accepted command IDs make retries idempotent. An evicted request
still fails its old revision or match ID, so it cannot apply again. Input,
connection, queue, and request limits are bounded. Rule history is limited to
60 entries and reward receipts to 256 per match; storage-size tests cover a
complete room record under PartyKit's per-value storage limit.

Existing version-two room records migrate to Classic while retaining their
board, seats, match ID, and command receipts. No Enhanced tokens are invented.
A browser with an old protocol receives a clear message to reload; it does not
continue with rules it cannot display. The room keeps its `match-v2` storage
key for migration, while the stored record schema is now version 3.

The room uses storage alarms for disconnect and idle deadlines. Its clock and
results remain authoritative when the browser is paused or reloaded. Neither
the client nor the room records friend matches as CPU wins.

Official references:

- [PartyKit server API](https://docs.partykit.io/reference/partyserver-api/)
- [PartySocket client API](https://docs.partykit.io/reference/partysocket-api/)
- [PartyKit deployment](https://docs.partykit.io/guides/deploying-your-partykit-server/)
