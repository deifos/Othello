# Classic and Enhanced modes

Both CPU games and friend rooms offer **Classic** and **Enhanced**. The mode
stays fixed during a match. Both modes use an 8 × 8 board, eight capture
directions, automatic passes, and the same final piece count to decide the winner.

## Choose a mode

For a CPU game, choose the mode and difficulty, then select **Start Classic
game** or **Start Enhanced game**. A saved match resumes with its original mode.
To change that mode, start a new game. The CPU follows the same Enhanced rules
and can earn and use all three abilities.

For a friend match, the host chooses the mode before creating the room and can
change it in the waiting room. Both players can read the rules before choosing
**I'm ready**. A mode change clears both Ready choices. The match starts only
when both players are connected and ready.

**Ready is agreement to the selected rules. In Enhanced mode, an earned Undo
does not require a second approval from the opponent during play.** The room
server applies it when the player has a token and meets the turn conditions.

A friend rematch keeps the mode, clears all tokens and effects, and swaps
colors. Both players must request the rematch. To choose a different mode,
leave the finished room and create a new one.

## Classic

Classic uses standard Othello rules and has no earned abilities. The existing
free Undo remains available for CPU practice. It returns to the position before
the human player's previous move and removes subsequent CPU replies. Classic
friend matches do not have Undo.

## Earn and use abilities

Captures count the opponent's pills that change color. The new pill placed on
the board does not count as a capture.

| Ability | Earn it | Use it before placing a pill |
| --- | --- | --- |
| Undo | Capture at least 3 pills | Return to the start of your previous turn, then make a replacement move. |
| Shield | Capture at least 4 pills in two or more directions | Select one of your pills, then choose **Protect pill**. |
| Corner Claim | Capture at least 5 pills | Select an available empty corner, then choose **Claim corner**. |

Each player can hold one token of each type. A move can award only one token.
The reward order is **Corner Claim, then Shield, then Undo**. If the slot for
the qualifying reward is full, the move gives no token; it does not award a
lower reward instead. For example, a five-pill capture gives Corner Claim,
even when it also captures in two directions. It gives nothing if that player
already holds Corner Claim.

A new token is available on the player's next turn. If the opponent must pass,
that next turn can follow immediately. Use at most one ability per turn,
before placing a pill. Using an ability does not place a pill or end the turn.
Abilities cannot be used after the match ends. Both players can see the token
counts and active effects.

### Shield

A shield protects one pill during the opponent's next turn. A capture line
that would pass through that protected pill is blocked in full. Other capture
directions remain valid. The shield does not turn an otherwise illegal
placement into a legal move.

### Corner Claim

A claim prevents the opponent from placing a pill on one empty corner during
their next turn. It does not give the owner a pill or a free corner placement.
The owner must still make a legal capture to occupy that corner. A claim is
removed if its corner becomes occupied.

### Passes and effect expiry

A shield or corner claim expires after the affected opponent completes their
next turn. A forced pass also uses that turn and expires the opposing effect.
The rules then check legal moves again, including moves restored by expiry.
This prevents a temporary effect from ending a match while a legal move will
be available after the effect expires.

### Undo and saved state

Undo is available at the start of the player's turn when that player holds an
Undo token and has a previous turn to reverse. It restores the position at the
start of that previous turn, removes that placement and every reply since it,
and lets the same player make a replacement move. A forced pass can mean there
is no reply, or that more than one reply must be removed.

The board, move count, active effects, and token inventory return to the saved
position. Rewards earned in the removed turns disappear. **All spent tokens
stay spent**, including the Undo token and any tokens spent in removed turns.
Repeating the same rewarded capture from the same board does not award that
reward again. This prevents two players from using Undo to restore spent
tokens or repeatedly collect the same reward.

Undo does not reset the game clock. It consumes the player's one ability use
for the current turn. The player must place a pill next. CPU saves include the
mode, tokens, effects, and Undo history. In a friend room, the server saves
these values before sending the updated board. Reloading or reconnecting does
not restore a spent token.

## Flip-pocalypse celebration

In Enhanced mode, one move that captures six or more pills starts a brief
**FLIP-POCALYPSE!** celebration. The attacking pill grows, captured pills react,
and golden flames, halos, sparks, and stars follow the capture. A small board
shake and a short fire sweep with soft crackles accompany the effect. The
sound follows the selected Zen or Dreamy style and the mute setting. The
effect lasts about 1.15 seconds. The slightly tilted board adds visible depth
in both modes.

The celebration changes no rules. A six-pill capture follows the same reward
order and can earn Corner Claim if its slot is free. Wild Flip and combo
bonuses are not part of this release.

The effect runs for a new placement, not when a saved board loads or Undo
restores a position. Reduced motion removes the large movement and particle
sequence. The HTML board keeps the match usable when WebGL is unavailable.

## Results and limits

The public practice leaderboard accepts **Classic CPU results only**. Enhanced
CPU results stay on the current device. Friend matches in either mode are
unranked. Enhanced results do not change Classic totals or enter its upload
queue. There is no Enhanced public leaderboard in this release.

The rule state holds at most 60 placement history entries and 256 reward
receipts per match. After 256 rewards have been recorded, play continues and
existing tokens can still be used, but no more tokens are awarded. This limit
keeps unusually long games within the storage budget.

Friend rooms retain the latest 128 accepted command receipts. Retrying an
older request still cannot replay a move: its old revision or match ID is
rejected. Public snapshots contain the current rules and token counts, but
exclude private Undo history, reward receipts, and seat keys. See
[multiplayer behavior](multiplayer.md) for room expiry and reconnect limits.

## Source map

- `src/game/enhanced.ts`: shared rules, token limits, Undo history, and CPU choices.
- `src/lib/cpuGame.ts`: CPU actions, save validation, and Classic save migration.
- `src/components/ModePicker.tsx`: setup choices and visible rules.
- `src/components/AbilityPanel.tsx`: token counts and target selection.
- `src/animation/flippocalypseMotion.ts`: capture detection and animation timing.
- `src/animation/flippocalypse.ts`: bounded Three.js effects.
- `party/server.ts`: authoritative friend-room actions and persistence.
