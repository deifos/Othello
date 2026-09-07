# Flip Buddies

A complete local Othello game with cute pill characters. Built with React,
TypeScript, Vite, and Three.js.

## Start

Use Node.js 24 or later.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The same command starts the practice ranking API
on port 3001. The game works if the API is offline. Failed result uploads stay in
a local queue and are sent when the API is available again.

```sh
npm test
npm run build
npm start
```

The production server serves the app and API at **http://localhost:3001**. Keep
the `data` directory on persistent storage. See [server setup](server/README.md)
for ports, database paths, and public origins. This project has not been deployed
to a public host.

## What works

- Landing page, game page, character collection, instructions, and rankings.
- Complete 8 × 8 Othello rules, eight capture directions, automatic passes, and
  correct game endings, including endings before the board is full.
- Human plays black. The CPU plays white. Three CPU levels use bounded search in
  a separate browser worker.
- Select a legal tile, then press **Place pill**. Keyboard users can move across
  the board with the arrow keys and select a tile with Enter or Space.
- Undo restores the position before the last human move, including CPU replies.
- Saved match, profile, character choice, results, and display settings.
- Surrender, rematch, sound controls, reduced motion, and light or dark theme.
- UI SFX sounds with Zen as the default and Dreamy as an alternative. Settings
  includes a preview for each style and saves the selected style and mute state.
  Cues cover jumps, moves, flips, menus, choices, undo, and match celebrations.
- Ten character styles. Black and white remain clear in every style.
- Eight expressions with separate blink and idle schedules. Captured pills look
  sad, show surprise during the turn, and smile when they land. Player portraits
  react to score changes and the final result.
- At the end of a match, the winner's portrait jumps and tosses flowers. The
  other portrait has a sad face and a small bubble that grows and pops into
  tears. Draws show two happy faces. These effects pause when hidden or offscreen
  and stop when reduced motion is on.
- Click or tap a board pill, side portrait, or picker pill for a small jump.
  Enter and Space also work. Board hops do not change the selected move or score,
  and a new move takes priority over the hop.
- Three.js placement, capture flips, and small particles. Shared geometry,
  capped pixel density, and rendering only while a scene changes keep work low.
- Expressions share one face texture. Idle updates are batched on crowded boards;
  flip motion keeps its smooth frame rate. Hidden and reduced-motion views stop
  idle animation.
- Accessible HTML board if WebGL is not available.
- A persistent practice leaderboard with all-time, rolling seven-day, and rolling
  thirty-day views. Every submitted move record is checked by the server.

The timer counts time while the game page is open and the tab is visible. Local
storage belongs to this browser. Clearing browser data removes that local copy.
The leaderboard has no invented player records.

## Character styles

Add a record to `src/styles/characters.ts`. The collection and profile picker use
this registry. A new palette or a supported accessory needs no other UI change.
For a new accessory shape, add its geometry in `GameBoard.tsx` and its matching
avatar drawing in `PillAvatar.tsx`. The registry has no fixed limit on styles.

## Multiplayer next phase

The rules in `src/game/engine.ts` have no browser or UI dependencies. The same
rules can run inside a PartyKit room. `src/game/protocol.ts` defines versioned
commands, state snapshots, player presence, revisions, and a transport interface.
See [the integration guide](docs/multiplayer.md) for the next phase.

The shared leaderboard currently lists CPU **practice** results. It validates
legal moves but cannot prove who chose each move. Live competitive ratings must
come from an authoritative multiplayer server. Sign-in, matchmaking, friends,
and online competitive ranks are not implemented in this phase.

## Artwork

The garden hero and ranking banner were generated with the built-in image tool.
The app loads WebP files of about 95 KB each. PNG originals and the full prompts
are included in [the asset record](docs/asset-prompts.md).

Sounds use [UI SFX](https://uisfx.com/) 0.4.0. Its small Web Audio runtime creates
and caches the sounds locally; no remote audio files are needed. Audio starts
after user input, uses one audio context, and stops when muted or the page is
hidden. The UI SFX code is MIT licensed and its audio is CC0. The MIT notice is
included in `public/licenses/uisfx.txt`.

The five background songs were supplied by the project owner. Two main themes
play on menu pages, two match tracks alternate during play, and a human win plays
the victory song once before the main themes return. A loss, draw, or surrender
returns to the main themes. The music-note button in the header and the game
Settings contain music on/off, volume, and Next song controls. Music starts at
25% volume after user input. Its preferences are saved separately from the Zen
and Dreamy sound effects.

Music uses one streaming audio element, with no song requests before user input.
Track changes fade out and in. Hidden tabs pause playback and resume at the same
position. MP3 audio is copied without conversion; embedded artwork and metadata
were removed to save space. Source names and durations are listed in
`public/audio/music/README.md`. Original files in the supplied folder are unchanged.

## Project map

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Pages, navigation, settings, and profile |
| `src/lib/useGame.ts` | Local match lifecycle and CPU worker |
| `src/lib/music.ts` | Background playlists, fades, and audio lifecycle |
| `src/lib/useMusic.ts` | Music preferences and page/match integration |
| `src/game/engine.ts` | Pure rules and bounded CPU search |
| `src/game/protocol.ts` | Future multiplayer wire contract |
| `src/components/GameBoard.tsx` | Three.js scene and accessible board |
| `src/components/PillAvatar.tsx` | Lightweight character avatars |
| `src/lib/leaderboard.ts` | Ranking client and persistent upload queue |
| `server/` | SQLite ranking API and production web server |
| `tests/` | Rule, API, persistence, and network retry tests |

## Checks

Run `npm test` for automated tests. Run `npm run build` for TypeScript checks and
the production build. Browser checks cover desktop and phone layouts, real moves,
CPU replies, undo, reload, character changes, settings, and a full match.
