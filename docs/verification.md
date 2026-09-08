# Verification record

## Interface, sound, and character refinements — 8 September 2026

- All 203 automated tests in 15 files pass. The production website build and
  Cloudflare TypeScript check also pass. The existing Three.js bundle size
  warning remains.
- Fuller golden flames, sparks, and a small board shake follow Enhanced
  captures of six or more pills. Browser checks confirm one fire sound per
  capture, Zen and Dreamy variants, immediate mute, and reduced-motion behavior.
- The desktop Place pill button sits below the board and stays visible while
  scrolling. Mobile keeps its fixed bottom button. Real CPU and online moves
  pass with the new position; there is only one primary button per match.
- Settings opens from its bordered board-header button. The CPU difficulty
  badge and sidebar Settings button are removed. Classic CPU Undo remains.
  The smaller CPU result heading fits on one line in desktop sidebars.
- Layout checks cover 320, 390, 900, and 1366-pixel browser widths without
  horizontal overflow. Online player names can still wrap.
- Fox and Cat board ears use rounded shapes and triangular inner patches based
  on their portraits. Both pill colors, capture flips, and click jumps were
  checked. Shared ear geometry is reused and released with the board scene.
- Local browser fixtures and screenshots remain in ignored `test-results/`;
  they are not included in the website build or source release.

## Enhanced modes and Flip-pocalypse — 8 September 2026

- All 191 automated tests in 14 files pass. New checks cover earned abilities,
  reward limits, shield capture lines, corner claims, forced passes, Undo,
  CPU choices, legacy saves, mode selection, migration, and command retries.
- The production website build and Cloudflare TypeScript check pass. The
  existing Three.js bundle size warning remains; no new dependency was added.
- Full two-client Enhanced matches pass on local PartyKit, local Cloudflare,
  `https://flipbuddies.vladpalacio.com/`, and
  `https://flip-buddies.deifos.partykit.dev/`. Each live check used all three
  abilities and completed 60 placements. No public practice results were sent.
- Online checks cover a mode change clearing both Ready choices, an old client
  receiving a reload message, reconnect after Undo preserving the seat and
  spent tokens, and a rematch keeping the mode and host while swapping colors.
  Test clients left their rooms and closed their connections.
- Browser checks cover CPU mode selection, a player move and CPU reply in both
  modes, Classic practice Undo, and real earned Enhanced token use. Shield
  targets, CPU shield use, expiry, Corner Claim, and full Undo rollback pass.
- All 64 tile targets remain aligned with the tilted board at 320 and 390
  pixels. The compact mobile ability controls fit below the board without
  overflow. Shield selection and confirmation also pass at 320 pixels.
- New CPU games open at the top of the board after the setup screen. Friend
  matches do the same when both players are ready and when a rematch starts.
- The golden effect lasts 1.15 seconds. An isolated browser measurement sampled
  79 frames over 1.3 seconds: mean interval 16.55 ms, with no interval above
  40 ms. This is a local measurement, not a guarantee for all devices.
- Reduced motion, the HTML board fallback, cleanup, and Undo replay guards were
  checked. Enhanced results remain separate from Classic practice submissions.
- Maximum room storage tests include private Undo history, public snapshots,
  token receipts, and 128 command receipts. The conservative generated case
  stays below 112 KiB JSON and 116 KiB binary. Current limits fit the legacy
  PartyKit storage budget as well as the Cloudflare SQLite deployment.
- Both public deployments use the tested same-origin website build. Cloudflare
  version: `e61365fc-edf8-4cea-9145-d7db36e6d944`.

## Cloudflare deployment — 7 September 2026

- Deployed the website, room service, and practice service to the `flip-buddies`
  Worker at `https://flipbuddies.vladpalacio.com/`, with HTTPS and two SQLite
  Durable Object bindings. No billing plan change was made.
- All 134 tests pass. The added test checks same-origin room URLs, including
  the local development port. Both TypeScript builds and the Worker dry run pass.
- Real local Cloudflare tests cover player registration, saved practice results,
  duplicate result submissions, two connected players, ready checks, rejected
  illegal moves, a legal move, reconnect, and surrender.
- The deployed Worker passes the HTTP and two-player smoke checks. The remote
  check reads rankings but does not insert public practice test results.
- The live browser completed a player move and CPU reply (3–3, six pieces).
  The Friends page reached Connected and displayed an invite on the new domain.
  No browser errors were recorded during these checks.
- Cloudflare and Google public DNS returned the new domain. The local resolver
  still had a negative result during verification, so the live tests used the
  public DNS address with the real hostname and normal HTTPS certificate checks.
- Cloudflare types are generated by Wrangler and ignored in Git. CI checks both
  deployment builds and performs a Worker dry run without account credentials.
- Open room connections consume Durable Object duration. Free usage allowances
  apply; this deployment does not enable WebSocket hibernation.

## Release checks — 7 September 2026

- A clean copy of the public files installs with `npm ci`. It contains only
  empty environment templates, with no local settings or stored game data.
- All 133 automated tests in 11 files pass. They cover rules, CPU choices,
  practice API validation and persistence, room state, reconnect handling,
  duplicate commands, audio, music, expressions, and move motion.
- `npm run build` passes TypeScript checks and creates the production website.
  Vite reports one size warning for the Three.js chunk, about 508 kB before gzip.
  This is a warning, not a build failure.
- `npm audit` reports no known dependency vulnerabilities at the time of this check.
- A production browser check completed a player move and a CPU reply. Both
  scores became 3 and six pieces were present. No browser errors were recorded.
- Header checks covered home and play pages from 320 to 1920 pixels, including
  a 24-character wide profile name. The corrected 1280-pixel layout has no
  horizontal page overflow. Medium desktop and phone views were inspected.
- Footer checks confirm one direct X link beside the brand, with no placeholder
  social links or Contact option. The README screenshot includes the updated footer.
- The README screenshot was captured from the local production website at
  1440 pixels wide, after fonts and images loaded. It shows the actual home page.
- Unused artwork sources and revisions are retained in `docs/artwork/` and no
  longer copied into the website build. The displayed assets keep their paths.
- Runtime library and font notices match the installed package license files.
  The project MIT notice is also included with the website.

## Public-source check

The review checked tracked working files, their staged versions, and all blobs
reachable from the local Git refs. Common credential and private-key patterns
were not found. No tracked databases, dependency folders, build output, or
service caches were found. This is a pattern check, not a full security audit.
Remote-only refs and unreachable Git objects were not checked.

The current music documentation no longer contains the original personal folder
path. That path and the author's email remain in the existing Git history.
No history was rewritten. The creator's public X profile link remains part of
the website's visible attribution.

Production service settings are kept in an ignored `.env.production.local` on
this development machine. Public copies use `.env.production.example` and must
set their own PartyKit address when using that host. Cloudflare builds use the
current origin and `wrangler.jsonc` instead. The repository ignores environment files,
service caches, database files, test output, and Vercel local metadata.

## Earlier browser checks — 6 September 2026

These checks were recorded during implementation. They were not all repeated
for the documentation release.

| Area | Recorded result |
| --- | --- |
| CPU play | A complete 60-move match ended at 4 black and 60 white; save, upload, undo, reload, and character selection worked |
| Keyboard and fallback | All 64 board cells were exposed; arrow keys and Enter worked; WebGL loss retained a usable HTML board; a blocked CPU worker used a legal fallback move |
| Motion | Placement, capture turns, expressions, portrait reactions, and result effects ran; hidden pages and reduced motion paused or stopped the relevant effects |
| Sound | Zen and Dreamy previews differed; mute and style survived reload; no playback occurred before user input |
| Music | Five songs played through one media element; mute, volume, track changes, visibility, and victory playback worked; production seeking used partial responses |
| Public friend match | Two clients completed 60 moves with one forced pass, ending at 37–27 with equal boards after every move |
| Room recovery | Invalid moves and duplicate sends were blocked; reload, rematch color swap, surrender, leave, and offline recovery passed |
| Public browser rooms | Two profiles created and joined an invite, marked ready, played D3 and C3, and showed 3–3; a reload restored the white seat |
| Practice API | Public health and all three ranking periods returned 200; foreign origins were denied; a local full-match upload was stored once and duplicate submission did not add a game |

Public multiplayer checks used the
[PartyKit demo](https://flip-buddies.deifos.partykit.dev/). The public leaderboard
was not populated with practice test records in those checks.

## Deployment limits

- The Vercel/PartyKit arrangement is documented in [deployment.md](deployment.md).
  The existing practice handler accepted health and preflight requests when its
  allowed origin matched in a local check. A Vercel deployment has not been made
  or checked as part of this release.
- The GitHub Actions workflow is included, but has not run on GitHub yet.
- New deployments still need a browser check for ranking uploads and a real
  two-player match from their final website address.
