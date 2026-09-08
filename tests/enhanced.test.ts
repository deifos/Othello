import { describe, expect, it } from "vitest";
import { serialize } from "node:v8";
import { MAX_ACCEPTED_REQUESTS } from "../party/server";
import type { MatchSnapshot } from "../src/game/protocol";
import { applyMove, createBoard, getLegalMoves, getNextTurn, getScore, type Board, type Player } from "../src/game/engine";
import { canUseUndo, chooseRulesCpuAction, createRulesGame, getRulesLegalMoves, isRulesGame, isRulesView, MAX_REWARD_RECEIPTS, MAX_RULES_HISTORY, playRulesMove, projectRulesGame, undoClassicPractice, useRulesAbility, type Ability, type RulesGame } from "../src/game/enhanced";

function position(board: Board, turn: Player = 1): RulesGame {
  return createRulesGame("enhanced", { board, turn, moveCount: 0 });
}

function rowCapture(count: number): RulesGame {
  const board = createBoard();
  for (let index = 1; index <= count; index++) board[index] = 2;
  board[count + 1] = 1;
  return position(board);
}

/** Install a banked token to isolate ability tests from the earning condition. */
function grant(game: RulesGame, player: Player, ability: Ability): RulesGame {
  const id = game.privateState.nextToken++;
  game.privateState.claimed.push(`${player}:${63 - id}:${game.board.join("")}`);
  game.privateState.bank[player][ability] = id;
  game.privateState.turnStart.bank[player][ability] = id;
  game.tokens[player][ability] = true;
  game.canUndo[player] = canUseUndo(game, player);
  return game;
}

describe("Classic and Enhanced rules", () => {
  it("leaves Classic legal moves, boards, forced passes and final scores unchanged through a full game", () => {
    let game = createRulesGame("classic");
    let board = createBoard();
    let turn: Player | null = 1;
    let placements = 0;
    while (turn !== null) {
      expect(getRulesLegalMoves(game)).toEqual(getLegalMoves(board, turn));
      const index = getLegalMoves(board, turn)[placements % getLegalMoves(board, turn).length].index;
      board = applyMove(board, index, turn);
      const next = getNextTurn(board, turn);
      game = playRulesMove(game, index);
      expect(game.board).toEqual(board);
      expect(game.turn).toBe(next.turn);
      expect(game.passed).toBe(next.passed);
      expect(isRulesGame(JSON.parse(JSON.stringify(game)))).toBe(true);
      expect(game.privateState.history).toEqual([]);
      expect(game.lastReward).toBeNull();
      turn = next.turn;
      placements++;
    }
    expect(placements).toBeGreaterThan(50);
    expect(getScore(game.board)).toEqual(getScore(board));
  });

  it("preserves Classic CPU practice Undo and rejects abilities in Classic", () => {
    let game = createRulesGame("classic");
    const start = game;
    game = playRulesMove(game, 19);
    game = playRulesMove(game, getRulesLegalMoves(game)[0].index);
    expect(undoClassicPractice(game).board).toEqual(start.board);
    expect(undoClassicPractice(game).moves).toEqual([]);
    expect(() => useRulesAbility(game, "shield", 19)).toThrow(/Enhanced/);
    expect(undoClassicPractice(start)).toBe(start);
  });

  it("earns Undo for three captures and makes it usable on the next own turn", () => {
    const before = rowCapture(3);
    const after = playRulesMove(before, 0);
    expect(after.lastReward).toEqual({ player: 1, ability: "undo" });
    expect(after.tokens[1]).toEqual({ undo: true, shield: false, corner: false });
    expect(canUseUndo(after, 1)).toBe(after.turn === 1);
    expect(before.tokens[1].undo).toBe(false);
    if (after.turn === 2) {
      const reply = playRulesMove(after, getRulesLegalMoves(after)[0].index);
      expect(reply.turn).toBe(1);
      expect(reply.canUndo[1]).toBe(true);
    }
  });

  it("earns Shield only when four captures span at least two directions", () => {
    const board = createBoard();
    board[27] = 0;
    board[28] = board[29] = board[35] = board[43] = 2;
    board[30] = board[51] = 1;
    const game = playRulesMove(position(board), 27);
    expect(game.lastMove?.flips).toHaveLength(4);
    expect(game.lastReward).toEqual({ player: 1, ability: "shield" });
    expect(playRulesMove(rowCapture(4), 0).lastReward?.ability).toBe("undo");
  });

  it("makes a reward available when an opponent's forced pass starts the next own turn", () => {
    const board = Array<number>(64).fill(1);
    board[0] = board[56] = 0;
    board[1] = board[2] = board[3] = board[57] = 2;
    const before = position(board);
    const after = playRulesMove(before, 0);
    expect(after.lastReward).toEqual({ player: 1, ability: "undo" });
    expect(after.passed).toBe(2);
    expect(after.turn).toBe(1);
    expect(after.canUndo[1]).toBe(true);
    expect(useRulesAbility(after, "undo").board).toEqual(before.board);
  });

  it("earns only Corner Claim at five or more captures, with no Wild Flip", () => {
    for (const count of [5, 6]) {
      const game = playRulesMove(rowCapture(count), 0);
      expect(game.tokens[1]).toEqual({ undo: false, shield: false, corner: true });
      expect(game.lastReward).toEqual({ player: 1, ability: "corner" });
    }
  });

  it("caps each bank at one token and does not substitute a second reward", () => {
    const game = grant(rowCapture(5), 1, "corner");
    const tokenId = game.privateState.bank[1].corner;
    const next = playRulesMove(game, 0);
    expect(next.lastReward).toBeNull();
    expect(next.privateState.bank[1].corner).toBe(tokenId);
    expect(next.tokens[1].undo).toBe(false);
    expect(next.tokens[1].shield).toBe(false);
  });

  it("does not mutate the input when a move or ability is rejected", () => {
    const game = createRulesGame("enhanced");
    const original = JSON.stringify(game);
    for (const index of [-1, 64, 1.5, 27, NaN]) expect(() => playRulesMove(game, index)).toThrow();
    expect(() => useRulesAbility(game, "undo")).toThrow(/Earn/);
    expect(JSON.stringify(game)).toBe(original);
  });

  it("blocks the entire capture line through a shield but allows other directions", () => {
    const board = Array<number>(64).fill(0);
    board[1] = board[2] = board[8] = 2;
    board[3] = board[16] = 1;
    const game = position(board);
    game.effects = [{ ability: "shield", owner: 2, index: 2 }];
    expect(getRulesLegalMoves(game).find(move => move.index === 0)?.flips).toEqual([8]);
    const next = playRulesMove(game, 0);
    expect(next.board[1]).toBe(2);
    expect(next.board[2]).toBe(2);
    expect(next.board[8]).toBe(1);
    expect(next.effects).toEqual([]);
  });

  it("keeps a shield through the owner's move and expires it after the opponent's reply", () => {
    let game = grant(createRulesGame("enhanced"), 1, "shield");
    game = useRulesAbility(game, "shield", 28);
    expect(game.effects).toEqual([{ ability: "shield", owner: 1, index: 28 }]);
    expect(game.tokens[1].shield).toBe(false);
    game = playRulesMove(game, 19);
    expect(game.turn).toBe(2);
    expect(game.effects).toHaveLength(1);
    game = playRulesMove(game, getRulesLegalMoves(game)[0].index);
    expect(game.effects).toEqual([]);
    expect(isRulesGame(game)).toBe(true);
  });

  it("allows one ability per turn, checks target ownership and requires an empty corner", () => {
    const game = grant(grant(createRulesGame("enhanced"), 1, "shield"), 1, "corner");
    expect(() => useRulesAbility(game, "shield", 27)).toThrow(/own pills/);
    expect(() => useRulesAbility(game, "shield", 64)).toThrow(/own pills/);
    expect(() => useRulesAbility(game, "corner", 4)).toThrow(/empty corner/);
    const used = useRulesAbility(game, "corner", 0);
    expect(used.board[0]).toBe(0);
    expect(() => useRulesAbility(used, "shield", 28)).toThrow(/one ability/);
    expect(used.tokens[1].shield).toBe(true);
    const occupied = rowCapture(3);
    occupied.board[0] = 1;
    grant(occupied, 1, "corner");
    expect(() => useRulesAbility(occupied, "corner", 0)).toThrow(/empty corner/);
  });

  it("reserves an empty corner only against the opponent and does not grant ownership", () => {
    const board = createBoard();
    board[1] = 1; board[2] = 2;
    const game = position(board, 2);
    game.effects = [{ ability: "corner", owner: 1, index: 0 }];
    expect(getLegalMoves(board, 2).some(move => move.index === 0)).toBe(true);
    expect(getRulesLegalMoves(game, 2).some(move => move.index === 0)).toBe(false);
    expect(game.board[0]).toBe(0);
    const ownerBoard = [...board]; ownerBoard[1] = 2; ownerBoard[2] = 1;
    expect(getRulesLegalMoves({ ...game, board: ownerBoard }, 1).some(move => move.index === 0)).toBe(true);
  });

  it("expires a corner block on a forced pass instead of ending a still playable game", () => {
    // After Black takes 63, only White has a move at 0. Its first turn is blocked.
    // Black then also passes. The expired reservation lets White play 0.
    const board = Array<number>(64).fill(1);
    board[0] = 0; board[1] = 1; board[2] = 2;
    board[63] = 0; board[62] = 2; board[61] = 1;
    let game = grant(position(board), 1, "corner");
    game = useRulesAbility(game, "corner", 0);
    game = playRulesMove(game, 63);
    expect(game.turn).toBe(2);
    expect(game.passed).toBe(1);
    expect(game.effects).toEqual([]);
    expect(getRulesLegalMoves(game).map(move => move.index)).toEqual([0]);
    game = playRulesMove(game, 0);
    expect(game.turn).toBeNull();
  });

  it("expires a shield on a forced pass without leaving a permanently blocked board", () => {
    const board = Array<number>(64).fill(1);
    board[0] = 0; board[1] = 1; board[2] = 2;
    board[63] = 0; board[62] = 2; board[61] = 1;
    let game = grant(position(board), 1, "shield");
    game = useRulesAbility(game, "shield", 1);
    game = playRulesMove(game, 63);
    expect(game.turn).toBe(2);
    expect(game.effects).toEqual([]);
    expect(getRulesLegalMoves(game)[0].index).toBe(0);
  });

  it("undoes the prior own move and reply, removes earned rewards, and keeps the token spent", () => {
    const original = rowCapture(3);
    const afterOwn = playRulesMove(original, 0);
    const reply = playRulesMove(afterOwn, getRulesLegalMoves(afterOwn)[0].index);
    const undone = useRulesAbility(reply, "undo");
    expect(undone.board).toEqual(original.board);
    expect(undone.moves).toEqual([]);
    expect(undone.moveCount).toBe(original.moveCount);
    expect(undone.turn).toBe(1);
    expect(undone.abilityUsed).toBe(true);
    expect(undone.tokens[1].undo).toBe(false);
    expect(undone.privateState.spent).toEqual([afterOwn.privateState.bank[1].undo]);
    expect(undone.lastReward).toBeNull();
    expect(undone.privateState.history).toEqual([]);
    const repeated = playRulesMove(undone, 0);
    expect(repeated.tokens[1].undo).toBe(false);
    expect(repeated.lastReward).toBeNull();
    expect(isRulesGame(undone)).toBe(true);
  });

  it("undoes all replies after an automatic pass, not just the last reply", () => {
    let game = createRulesGame("enhanced");
    // Black passes after White's first reply and gets its next turn only after
    // White places a second pill. Both replies belong to this Undo window.
    const transcript = [37, 43, 42, 45, 53, 54, 55, 34, 33, 41, 18, 61, 51, 44, 52, 19, 20, 47, 38, 63, 40, 11, 4, 39, 30, 21, 22, 62, 26, 32, 23, 12, 24, 58, 59, 10, 2, 1, 31, 46, 3, 15, 0, 29, 5, 13, 6, 14, 7, 60, 9, 50, 25];
    for (const index of transcript) game = playRulesMove(game, index);
    expect(game.turn).toBe(1);
    const window = game.privateState.history.slice(-3);
    expect(window.map(entry => entry.player)).toEqual([1, 2, 2]);
    grant(game, 1, "undo");
    const undone = useRulesAbility(game, "undo");
    expect(undone.board).toEqual(window[0].before.board);
    expect(undone.moves).toEqual(window[0].before.moves);
    expect(undone.moveCount).toBe(game.moveCount - 3);
  });

  it("does not resurrect a shield spent in the removed turns", () => {
    let game = grant(grant(createRulesGame("enhanced"), 1, "undo"), 2, "shield");
    const initial = [...game.board];
    game = playRulesMove(game, 19);
    game = useRulesAbility(game, "shield", 36);
    game = playRulesMove(game, getRulesLegalMoves(game)[0].index);
    const undone = useRulesAbility(game, "undo");
    expect(undone.board).toEqual(initial);
    expect(undone.tokens[1].undo).toBe(false);
    expect(undone.tokens[2].shield).toBe(false);
    expect(undone.effects).toEqual([]);
    expect(undone.privateState.spent).toHaveLength(2);
    expect(isRulesGame(undone)).toBe(true);
  });

  it("never restores an already spent Undo when the other player also rewinds", () => {
    let game = grant(grant(createRulesGame("enhanced"), 1, "undo"), 2, "undo");
    game = playRulesMove(game, 19);
    const beforeWhite = [...game.board];
    game = playRulesMove(game, 18);
    game = playRulesMove(game, 17);
    game = playRulesMove(game, getRulesLegalMoves(game)[0].index);
    expect(game.turn).toBe(1);
    game = useRulesAbility(game, "undo");
    game = playRulesMove(game, getRulesLegalMoves(game)[0].index);
    expect(game.turn).toBe(2);
    game = useRulesAbility(game, "undo");
    expect(game.board).toEqual(beforeWhite);
    expect(game.tokens[1].undo).toBe(false);
    expect(game.tokens[2].undo).toBe(false);
    expect(game.privateState.spent).toEqual([1, 2]);
    expect(isRulesGame(game)).toBe(true);
  });

  it("keeps old award receipts effective after their lossless storage migration", () => {
    const original = rowCapture(3);
    const oldReceipt = `1:0:${original.board.join("")}`;
    let game = playRulesMove(original, 0);
    game = playRulesMove(game, getRulesLegalMoves(game)[0].index);
    game.privateState.claimed[0] = oldReceipt;
    expect(isRulesGame(game)).toBe(true);
    game = useRulesAbility(game, "undo");
    expect(game.privateState.claimed[0]).toMatch(/^1:0:[0-9a-z]{20}$/);
    game = playRulesMove(game, 0);
    expect(game.lastReward).toBeNull();
    expect(game.tokens[1].undo).toBe(false);
  });

  it("continues legal play at the award receipt limit without granting or restoring more tokens", () => {
    const game = rowCapture(3);
    game.privateState.claimed = Array.from({ length: MAX_REWARD_RECEIPTS }, (_, index) => `2:63:${index.toString(36).padStart(20, "0")}`);
    game.privateState.spent = Array.from({ length: MAX_REWARD_RECEIPTS }, (_, index) => index + 1);
    game.privateState.nextToken = MAX_REWARD_RECEIPTS + 1;
    expect(isRulesGame(game)).toBe(true);
    const next = playRulesMove(game, 0);
    expect(next.board[0]).toBe(1);
    expect(next.lastMove?.flips).toHaveLength(3);
    expect(next.lastReward).toBeNull();
    expect(next.tokens[1].undo).toBe(false);
    expect(next.privateState.nextToken).toBe(MAX_REWARD_RECEIPTS + 1);
    expect(next.privateState.claimed).toHaveLength(MAX_REWARD_RECEIPTS);
    expect(isRulesGame(next)).toBe(true);
  });

  it("keeps a maximal room record below the legacy 128 KiB Durable Object value limit", () => {
    // This is a conservative storage envelope, not a playable fixture. Every
    // frame uses the maximum lengths allowed by the saved-state validator,
    // which is larger than a real game's progressively shorter history frames.
    const game = createRulesGame("enhanced");
    game.board = Array<number>(64).fill(2);
    game.board[0] = game.board[7] = 0;
    game.board[1] = 1;
    game.moves = Array.from({ length: 60 }, (_, index) => index + 4);
    game.moveCount = 60;
    game.lastMove = { index: 63, flips: Array.from({ length: 63 }, (_, index) => index), player: 2 };
    game.effects = [
      { ability: "shield", owner: 1, index: 1 }, { ability: "shield", owner: 2, index: 2 },
      { ability: "corner", owner: 1, index: 0 }, { ability: "corner", owner: 2, index: 7 },
    ];
    game.lastReward = { player: 2, ability: "corner" };
    game.privateState.bank = {
      1: { undo: MAX_REWARD_RECEIPTS - 5, shield: MAX_REWARD_RECEIPTS - 4, corner: MAX_REWARD_RECEIPTS - 3 },
      2: { undo: MAX_REWARD_RECEIPTS - 2, shield: MAX_REWARD_RECEIPTS - 1, corner: MAX_REWARD_RECEIPTS },
    };
    game.privateState.claimed = Array.from({ length: MAX_REWARD_RECEIPTS }, (_, index) => `2:63:${index.toString(36).padStart(20, "0")}`);
    game.privateState.spent = Array.from({ length: MAX_REWARD_RECEIPTS - 6 }, (_, index) => index + 1);
    game.privateState.nextToken = MAX_REWARD_RECEIPTS + 1;
    game.tokens = { 1: { undo: true, shield: true, corner: true }, 2: { undo: true, shield: true, corner: true } };
    game.canUndo = { 1: true, 2: false };
    const frame = { board: game.board, moves: game.moves, turn: 1 as const, moveCount: 60, lastMove: game.lastMove, passed: 2 as const, effects: game.effects, abilityUsed: true, lastReward: game.lastReward, bank: game.privateState.bank };
    game.privateState.turnStart = structuredClone(frame);
    game.privateState.history = Array.from({ length: MAX_RULES_HISTORY }, () => ({ player: 1 as const, before: structuredClone(frame) }));
    expect(isRulesGame(game)).toBe(true);
    const longTime = Number.MAX_SAFE_INTEGER;
    const player = { id: "p".repeat(36), name: "🌟".repeat(24), styleId: "s".repeat(64), color: 1 as const, connected: true, ready: true, wantsRematch: false, disconnectedAt: longTime };
    const snapshot: MatchSnapshot = {
      roomCode: "ABC234", matchId: "m".repeat(80), revision: longTime, mode: "enhanced", hostId: player.id,
      rules: projectRulesGame(game), board: [...game.board], turn: 1,
      players: [player, { ...player, id: "q".repeat(36), color: 2 }], phase: "playing", result: null,
      lastMove: structuredClone(game.lastMove), passed: 2, moveCount: 60,
      startedAt: longTime, endedAt: longTime, updatedAt: longTime, serverTime: longTime,
    };
    const record = {
      schema: 3, snapshot, game,
      tokenHashes: { [player.id]: "a".repeat(64), ["q".repeat(36)]: "b".repeat(64) },
      accepted: Array.from({ length: MAX_ACCEPTED_REQUESTS }, (_, index) => ({ playerId: player.id, matchId: "m".repeat(80), requestId: String(index).padStart(80, "r") })),
      expiresAt: longTime,
    };
    // Clone through JSON to remove any shared references; storage must fit even
    // without the serializer's normal reference/string deduplication savings.
    const independent = JSON.parse(JSON.stringify(record));
    expect(Buffer.byteLength(JSON.stringify(independent))).toBeLessThan(112 * 1024);
    expect(serialize(independent).byteLength).toBeLessThan(116 * 1024);
    const oldReceipts = structuredClone(independent);
    oldReceipts.game.privateState.claimed = Array.from({ length: MAX_REWARD_RECEIPTS }, (_, index) => `2:63:${index.toString(3).padStart(64, "0")}`);
    expect(isRulesGame(oldReceipts.game)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(oldReceipts))).toBeLessThan(112 * 1024);
    expect(serialize(oldReceipts).byteLength).toBeLessThan(128 * 1024);
    const oversizedHistory = structuredClone(game);
    oversizedHistory.privateState.history.push(structuredClone(game.privateState.history[0]));
    expect(isRulesGame(oversizedHistory)).toBe(false);
  });

  it("keeps existing state immutable when either player acts", () => {
    const game = grant(createRulesGame("enhanced"), 1, "shield");
    const serialized = JSON.stringify(game);
    const shielded = useRulesAbility(game, "shield", 28);
    const moved = playRulesMove(shielded, 19);
    moved.board[0] = 1;
    moved.privateState.bank[1].undo = 123;
    expect(JSON.stringify(game)).toBe(serialized);
    expect(shielded.board[19]).toBe(0);
  });

  it("publishes only the bounded game view without the undo history or token receipts", () => {
    const game = playRulesMove(rowCapture(3), 0);
    const view = projectRulesGame(game);
    expect(isRulesView(view)).toBe(true);
    expect(view).not.toHaveProperty("privateState");
    expect(view).not.toHaveProperty("moves");
    expect(view).not.toHaveProperty("bank");
    view.board[0] = 0;
    view.tokens[1].undo = false;
    expect(game.board[0]).toBe(1);
    expect(game.tokens[1].undo).toBe(true);
  });

  it("rejects malformed serialized data, forged public inventories, and reused token IDs", () => {
    const game = playRulesMove(rowCapture(3), 0);
    expect(isRulesGame(JSON.parse(JSON.stringify(game)))).toBe(true);
    const changes: Array<(value: RulesGame) => void> = [
      value => { value.board[0] = 8; },
      value => { value.tokens[1].shield = true; },
      value => { value.privateState.nextToken = 0; },
      value => { value.privateState.spent.push(value.privateState.bank[1].undo!); },
      value => { value.privateState.history[0].before.board = []; },
      value => { value.effects.push({ ability: "corner", owner: 1, index: 1 }); },
      value => { value.canUndo[2] = true; },
      value => { value.moves = Array(61).fill(0); },
    ];
    for (const change of changes) {
      const copy = JSON.parse(JSON.stringify(game)) as RulesGame;
      change(copy);
      expect(isRulesGame(copy)).toBe(false);
    }
    expect(isRulesGame(null)).toBe(false);
    expect(isRulesView({ ...projectRulesGame(game), mode: "wild" })).toBe(false);
  });

  it("can restore a legacy Classic position without inventing Enhanced tokens or undo history", () => {
    const board = applyMove(createBoard(), 19, 1);
    const game = createRulesGame("classic", { board, turn: 2, moves: [19], moveCount: 1, lastMove: { index: 19, flips: [27], player: 1 } });
    expect(game.board).toEqual(board);
    expect(game.moves).toEqual([19]);
    expect(isRulesGame(game)).toBe(true);
    expect(game.privateState.history).toEqual([]);
    expect(game.canUndo).toEqual({ 1: false, 2: false });
  });

  it("CPU actions are deterministic and complete Enhanced games using only legal actions", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      let game = createRulesGame("enhanced");
      let actions = 0;
      let abilities = 0;
      while (game.turn !== null && actions < 250) {
        const action = chooseRulesCpuAction(game, difficulty)!;
        expect(action).toEqual(chooseRulesCpuAction(game, difficulty));
        if (action.type === "ability") {
          game = useRulesAbility(game, action.ability, action.target);
          abilities++;
        } else {
          expect(getRulesLegalMoves(game).some(move => move.index === action.index)).toBe(true);
          game = playRulesMove(game, action.index);
        }
        expect(isRulesGame(game)).toBe(true);
        actions++;
      }
      expect(game.turn).toBeNull();
      expect(abilities).toBeGreaterThan(0);
      expect(actions).toBeLessThan(250);
    }
  });
});
