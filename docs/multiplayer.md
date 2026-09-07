# PartyKit integration for phase two

The current game is local human versus CPU. No multiplayer connection is active.
The UI board is a view: it receives a board, legal moves, and selection callbacks.
The rules are pure TypeScript and can also run on a server.

## Integration points

1. Add a PartyKit room server. Use `engine.ts` to create boards, check captures,
   apply legal moves, detect passes, and finish a match.
2. Implement `MatchTransport` from `protocol.ts` with a PartyKit connection.
   Keep the existing local game controller for the CPU mode. Add an online match
   controller that maps server snapshots to the same board view props.
3. Authenticate the connection and assign black or white on the server. Do not
   accept a player identity or color supplied in a move.
4. Check the protocol version, match ID, turn, expected revision, and legal tile
   for each command. Store handled request IDs to make retries safe.
5. Broadcast the complete authoritative snapshot after each accepted command.
   Use its `lastMove` field for flip feedback. Use `revision` to reject old moves.
6. On reconnect, send a complete snapshot. Handle waiting, presence, timeouts,
   disconnects, surrender, and rematch in the room.
7. Write final competitive results from the room server. Keep them separate from
   client-submitted CPU practice records. Add authenticated accounts before using
   competitive ratings or friend lists.

## Existing contract

`ClientCommand` covers `move`, `surrender`, `ready`, `rematch`, and `sync`.
`ServerMessage` covers `snapshot`, `rejected`, and `presence`. A snapshot contains
the match ID, board, player assignments, phase, turn, revision, last move, pass
state, start and update times, and final result.

Do not move CPU search into the online path. Each human command should be checked
by the room, then shown by both clients. The Three.js board already animates
changes in its incoming board without owning game rules.

Official references:

- [PartyKit](https://www.partykit.io/)
- [PartyKit server template](https://github.com/partykit/templates/blob/main/templates/react/party/server.ts)
- [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html)
