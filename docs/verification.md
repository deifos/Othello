# Verification record

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
set their own PartyKit address. The repository ignores environment files,
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
