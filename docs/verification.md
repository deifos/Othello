# Verification record

Checked on 6 September 2026.

- UI SFX 0.4.0 provides Zen and Dreamy sounds. Zen is the default. Browser checks
  confirmed distinct, non-silent preview buffers, one shared audio context, and
  no audio context or playback before the first user action. Explicit Dreamy
  selection and mute both survived reload. Previews cannot enable muted audio.
- A human move and CPU reply played separate selection, placement, and flip
  cues. A final move also played the result, winner jump, flowers, bubble growth,
  and bubble pop. Hiding the page stopped every voice with no new playback.
- Seven audio lifecycle tests cover mute, pending unlocks, style restoration,
  hidden pages, cleanup, and failed audio. All 45 tests and the build pass. The
  sound selector fits a 320-pixel screen without horizontal overflow.

- Click and keyboard checks triggered 460 ms hops on occupied board cells, side
  portraits, and picker cards. Hops returned to the rest pose, and repeat clicks
  did not extend them. Picker selection still saved the chosen character.
- A legal move stopped a board hop. Clicking a pill during its capture did not
  interrupt the flip, and the CPU reply completed. After simulated WebGL context
  loss, the fallback hop and the next human/CPU turn also completed correctly.
- Clicking finished portraits replaced flowers or a bubble with a short hop,
  then cleared the old effects. Reduced motion suppressed click hops. The mobile
  portraits remained 57 px square without horizontal page overflow.

- Finished match portraits now show a winner's jump and flower toss, and a sad
  face with tears and an inflating nose bubble that pops. A live final move
  started the winner's jump after 757 ms, after the last board flip had settled.
- Browser checks covered human and CPU wins, a draw, surrender while ahead,
  and Play again. Draws have two happy faces; a new game removes all result
  effects. The checks used isolated saved fixtures with no result uploads.
- Both result effects pause offscreen and when the document is hidden, then
  resume from the start. App and system reduced-motion settings stop movement.
  A 3.6-second check with reduced motion found no portrait changes or animations.
- Result portrait sizes and layout were checked at 1440, 390, and 320 pixels.
  The flowers and bubble stay clear of scores, with no horizontal page overflow.

- Match motion follows the four reference effects: a placement squash and
  rebound, a continuous half-turn, yellow stars and peach petals with small
  daisies, and happy faces at landing. The front and back faces move with the
  pill. Accessories flatten at the edge of the turn to avoid a midpoint jump.
- Four motion tests check exact landing position and scale, continuous rotation,
  rebound, and the maximum capture delay before a CPU reply. The full suite now
  has 45 passing tests.
- Browser frame captures show the placement, edge of the flip, and celebration.
  A real move and CPU reply completed with the board locked during the turn.
  Undo restored the preview score and removed all particles. Enabling reduced
  motion during a move left the Three board idle with zero particles.
- After simulated WebGL context loss, the fallback ran both placement and flip
  animations, then completed the CPU reply. No browser errors were recorded.

- The pill picker has a saved Black/White preview switch. All ten cards and the
  selected preview change color. Native radio arrow keys, saved selection after
  reload, and 390- and 320-pixel layouts were checked.
- Eleven picker avatars share random jump timing, with fixed ground shadows.
  A 7.5-second browser sample recorded ten jumps at separate times, with no more
  than two active together. With Reduce animation enabled through Settings,
  the picker stayed unchanged for 6.5 seconds and had no active body animations.

- The landing page now follows the two-column mockup: hero, playable board
  preview, four feature links, a short illustrated guide, and the footer.
- The hero's two raster pill bodies have independent live faces. Browser checks
  captured full blink cycles, random expressions, and hover reactions. Reduced
  motion left both faces unchanged during a 6.5-second check.
- Preview move A4 changed the demo score from 8–8 to 13–4. Undo restored 8–8.
  Preview state is separate from the saved match and leaderboard submissions.
- The Play Now button opened the game page. Desktop and 390-pixel mobile layouts
  were checked in the browser, including the board after scrolling into view.
- The footer ended at the viewport bottom on 1536×1024 and 1536×1200 pages.
  On mobile it followed the content with no horizontal page overflow.

- All 65 automated tests pass. These cover captures, passes, complete games, CPU
  choices, API validation, persistent rankings, time filters, duplicate results,
  Unicode player names, and upload queue recovery.
- Expression tests cover independent timing, blink phases, reaction priority,
  random friendly faces, and recovery after a long pause.
- Browser checks showed sad capture faces, happy placement faces, independent
  idle expressions, and portrait score reactions. A 56-piece board used 114
  rendered frames in eight idle seconds in the test browser. Reduced-motion mode
  produced no board redraws or portrait changes during a two-second idle check.
- The production build passes TypeScript checks and builds successfully.
- The production server serves the landing page and the game. A real human move
  and CPU reply work from the built files, with no browser errors.
- A complete browser match used 60 legal moves and ended at 4 black and 60 white.
  The final result was saved and uploaded. The test record was then removed.
- Undo returned the board to its initial position after a human move and a CPU
  reply. Reload preserved that board.
- Character selection persisted and appeared on the board and profile.
- Settings changed the next CPU level and saved reduced motion.
- Browser checks covered 1440-pixel desktop and 390-pixel phone layouts, both
  themes, the character collection, instructions, and the leaderboard.
- The board exposed all 64 accessible cells. Arrow keys and Enter worked.
- Simulated WebGL context loss kept the HTML board usable.
- A blocked worker still produced a legal CPU reply through the fallback.

The shared practice ranking API is running locally. Public hosting and live
multiplayer are not part of this verification. The PartyKit integration contract
and guide are included for the next phase.

## Background music

- All five supplied MP3 files retain the original decoded audio, duration, and
  48 kHz stereo format. Removing embedded images and metadata saved 143,065 bytes.
- Browser checks confirmed no audio element or song request before the first
  user action. All five songs played through a single media element.
- The two menu themes and two match songs advance automatically. A final human
  move started the 31-second victory song. A rematch returned to match music.
- Music mute pauses immediately. The mute and volume preferences survive reload.
  A muted reload made no song requests even after another button was clicked.
  Keyboard input changed the volume slider and saved its value.
- A browser visibility check stopped the media clock while hidden. The music
  controller tests cover resume, pending playback, rapid changes, muted and hidden
  transitions, autoplay rejection, failed tracks, and cleanup after unmount.
- Music controls were checked at 1440- and 320-pixel widths in both themes.
  There was no horizontal overflow. Game sound settings still default to Zen.
- Fourteen music lifecycle tests pass, including the regression for quickly
  skipping a song and returning to the song that is already playing.
- Production playback was checked on port 3001. MP3 files use `audio/mpeg`,
  and a request for the first 1,024 bytes returned the correct 206 response.
  Six server tests cover audio headers, partial downloads, seeking ranges,
  invalid ranges, HEAD responses, and file cleanup when a request is cancelled.
