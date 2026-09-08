import { chooseCpuMove, createBoard, getLegalMoves, getScore, isBoard, opponent, type Board, type Difficulty, type Move, type Player } from "./engine";

export type GameMode = "classic" | "enhanced";
export type Ability = "undo" | "shield" | "corner";
export type TokenInventory = Record<Player, Record<Ability, boolean>>;
export interface RulesEffect { ability: "shield" | "corner"; owner: Player; index: number }
export interface RulesLastMove extends Move { player: Player }
export interface RulesReward { player: Player; ability: Ability }

/** Safe to send to both players. Token IDs, reward receipts and undo history stay private. */
export interface RulesView {
  mode: GameMode;
  board: Board;
  turn: Player | null;
  moveCount: number;
  lastMove: RulesLastMove | null;
  passed: Player | null;
  tokens: TokenInventory;
  effects: RulesEffect[];
  abilityUsed: boolean;
  lastReward: RulesReward | null;
  canUndo: Record<Player, boolean>;
}

type TokenBank = Record<Player, Record<Ability, number | null>>;
interface Position {
  board: Board;
  moves: number[];
  turn: Player | null;
  moveCount: number;
  lastMove: RulesLastMove | null;
  passed: Player | null;
  effects: RulesEffect[];
  abilityUsed: boolean;
  lastReward: RulesReward | null;
  bank: TokenBank;
}
interface HistoryEntry { player: Player; before: Position }
export interface RulesGame extends RulesView {
  schema: 1;
  moves: number[];
  privateState: {
    bank: TokenBank;
    turnStart: Position;
    history: HistoryEntry[];
    spent: number[];
    claimed: string[];
    nextToken: number;
  };
}
export type RulesCpuAction = { type: "move"; index: number } | { type: "ability"; ability: Ability; target?: number };

const ABILITIES: Ability[] = ["undo", "shield", "corner"];
const CORNERS = [0, 7, 56, 63];
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;
// Undo removes the rewound path. At most 60 placements can remain on that path.
export const MAX_RULES_HISTORY = 60;
// Ledgers never roll back. Once the generous receipt limit is reached, moves remain
// legal but cannot earn more tokens. This bounds storage even in a very long match.
export const MAX_REWARD_RECEIPTS = 256;
const emptyBank = (): TokenBank => ({ 1: { undo: null, shield: null, corner: null }, 2: { undo: null, shield: null, corner: null } });
const copyBank = (bank: TokenBank): TokenBank => ({ 1: { ...bank[1] }, 2: { ...bank[2] } });
const copyMove = (move: RulesLastMove | null): RulesLastMove | null => move ? { ...move, flips: [...move.flips] } : null;
const copyPosition = (position: Position): Position => ({ ...position, board: [...position.board], moves: [...position.moves], lastMove: copyMove(position.lastMove), effects: position.effects.map(effect => ({ ...effect })), lastReward: position.lastReward ? { ...position.lastReward } : null, bank: copyBank(position.bank) });

/** Lossless base-3 board encoding: 64 cells fit in 20 base-36 characters. */
function rewardReceipt(player: Player, index: number, board: Board): string {
  let encoded = 0n;
  for (const cell of board) encoded = encoded * 3n + BigInt(cell);
  return `${player}:${index}:${encoded.toString(36).padStart(20, "0")}`;
}

function compactReceipt(receipt: string): string {
  if (receipt.length < 60) return receipt;
  const [player, index, board] = receipt.split(":");
  return board.length === 64 ? rewardReceipt(Number(player) as Player, Number(index), Array.from(board, Number)) : receipt;
}

function positionOf(game: RulesGame): Position {
  return copyPosition({ board: game.board, moves: game.moves, turn: game.turn, moveCount: game.moveCount, lastMove: game.lastMove, passed: game.passed, effects: game.effects, abilityUsed: game.abilityUsed, lastReward: game.lastReward, bank: game.privateState.bank });
}

function copyGame(game: RulesGame): RulesGame {
  const { bank: _bank, ...position } = positionOf(game);
  return { ...game, ...position, privateState: { ...game.privateState, bank: copyBank(game.privateState.bank), turnStart: copyPosition(game.privateState.turnStart), history: [...game.privateState.history], spent: [...game.privateState.spent], claimed: game.privateState.claimed.map(compactReceipt) } };
}

function updateView(game: RulesGame): RulesGame {
  const inventory = (player: Player) => Object.fromEntries(ABILITIES.map(ability => [ability, game.privateState.bank[player][ability] !== null])) as Record<Ability, boolean>;
  game.tokens = { 1: inventory(1), 2: inventory(2) };
  game.canUndo = { 1: canUseUndo(game, 1), 2: canUseUndo(game, 2) };
  return game;
}

/** Optional position is for restoring a prior Classic game. No undo history is invented. */
export function createRulesGame(mode: GameMode = "classic", initial?: { board: Board; turn: Player | null; moves?: number[]; moveCount?: number; lastMove?: RulesLastMove | null; passed?: Player | null }): RulesGame {
  if (mode !== "classic" && mode !== "enhanced") throw new Error("Choose Classic or Enhanced mode.");
  if (initial && (!isBoard(initial.board) || !isTurn(initial.turn))) throw new Error("Invalid game position.");
  const position: Position = { board: initial ? [...initial.board] : createBoard(), moves: [...(initial?.moves ?? [])], turn: initial ? initial.turn : 1, moveCount: initial?.moveCount ?? (initial ? Math.max(0, 60 - getScore(initial.board).empty) : 0), lastMove: copyMove(initial?.lastMove ?? null), passed: initial?.passed ?? null, effects: [], abilityUsed: false, lastReward: null, bank: emptyBank() };
  const game = { schema: 1, mode, ...position, tokens: {} as TokenInventory, canUndo: { 1: false, 2: false }, privateState: { bank: emptyBank(), turnStart: copyPosition(position), history: [], spent: [], claimed: [], nextToken: 1 } } as RulesGame;
  // Position.bank is internal only and must not accidentally become a public field.
  delete (game as RulesGame & { bank?: TokenBank }).bank;
  return updateView(game);
}

function captureLines(game: Pick<RulesView, "board" | "mode" | "effects">, index: number, player: Player): number[][] {
  if (!Number.isInteger(index) || index < 0 || index > 63 || game.board[index] !== 0) return [];
  if (game.mode === "enhanced" && game.effects.some(effect => effect.ability === "corner" && effect.owner !== player && effect.index === index)) return [];
  const protectedCells = new Set(game.mode === "enhanced" ? game.effects.filter(effect => effect.ability === "shield" && effect.owner !== player).map(effect => effect.index) : []);
  const lines: number[][] = [];
  for (const [dr, dc] of DIRECTIONS) {
    let row = Math.floor(index / 8) + dr;
    let col = index % 8 + dc;
    const line: number[] = [];
    let blocked = false;
    while (row >= 0 && row < 8 && col >= 0 && col < 8 && game.board[row * 8 + col] === opponent(player)) {
      const cell = row * 8 + col;
      if (protectedCells.has(cell)) blocked = true;
      line.push(cell);
      row += dr; col += dc;
    }
    if (!blocked && line.length && row >= 0 && row < 8 && col >= 0 && col < 8 && game.board[row * 8 + col] === player) lines.push(line);
  }
  return lines;
}

export function getRulesLegalMoves(game: Pick<RulesView, "mode" | "board" | "turn" | "effects">, player: Player | null = game.turn): Move[] {
  if (player === null) return [];
  if (game.mode === "classic" || !game.effects.length) return getLegalMoves(game.board, player);
  const moves: Move[] = [];
  for (let index = 0; index < 64; index++) {
    const flips = captureLines(game, index, player).flat();
    if (flips.length) moves.push({ index, flips });
  }
  return moves;
}

export function canUseUndo(game: RulesGame, player: Player | null = game.turn): boolean {
  return game.mode === "enhanced" && player !== null && game.turn === player && !game.abilityUsed && game.privateState.bank[player].undo !== null && game.privateState.history.some(entry => entry.player === player);
}

function lastOwnHistoryIndex(game: RulesGame, player: Player): number {
  for (let index = game.privateState.history.length - 1; index >= 0; index--) if (game.privateState.history[index].player === player) return index;
  return -1;
}

/** CPU practice keeps its existing free Undo. Online Classic must not call this. */
export function undoClassicPractice(game: RulesGame, player: Player = 1): RulesGame {
  if (game.mode !== "classic" || !game.moves.length) return game;
  let replay = createRulesGame("classic");
  let beforeOwnMove: RulesGame | null = null;
  for (const index of game.moves) {
    if (replay.turn === player) beforeOwnMove = replay;
    replay = playRulesMove(replay, index);
  }
  return beforeOwnMove ?? game;
}

function expireOpponentEffects(game: RulesGame, player: Player): void {
  game.effects = game.effects.filter(effect => effect.owner === player && (effect.ability !== "corner" || game.board[effect.index] === 0));
}

/** A forced pass uses the blocked player's turn and expires the opposing effect. */
function advanceTurn(game: RulesGame, previous: Player): void {
  let next = opponent(previous);
  game.passed = null;
  for (let attempts = 0; attempts < 4; attempts++) {
    if (getRulesLegalMoves(game, next).length) { game.turn = next; game.abilityUsed = false; return; }
    const hadEffects = game.effects.length > 0;
    expireOpponentEffects(game, next);
    if (!hadEffects && !getRulesLegalMoves(game, opponent(next)).length) { game.turn = null; game.abilityUsed = false; game.passed = null; return; }
    game.passed = next;
    next = opponent(next);
  }
  // Each pass removes all opposing effects, so four attempts cover both players
  // with and without effects. Reaching here signals an invalid internal position.
  throw new Error("Could not resolve the next turn.");
}

export function playRulesMove(game: RulesGame, index: number): RulesGame {
  if (game.turn === null) throw new Error("This match has ended.");
  const player = game.turn;
  const lines = captureLines(game, index, player);
  const flips = lines.flat();
  if (!flips.length) throw new Error("Choose a highlighted tile.");
  const next = copyGame(game);
  if (game.mode === "enhanced") next.privateState.history = [...game.privateState.history, { player, before: copyPosition(game.privateState.turnStart) }].slice(-MAX_RULES_HISTORY);
  next.board[index] = player;
  for (const cell of flips) next.board[cell] = player;
  next.moveCount++;
  next.moves.push(index);
  next.lastMove = { index, flips, player };
  next.lastReward = null;
  if (game.mode === "enhanced") {
    const reward: Ability | null = flips.length >= 5 ? "corner" : flips.length >= 4 && lines.length >= 2 ? "shield" : flips.length >= 3 ? "undo" : null;
    if (reward && next.privateState.bank[player][reward] === null && next.privateState.claimed.length < MAX_REWARD_RECEIPTS) {
      const receipt = rewardReceipt(player, index, game.board);
      if (!next.privateState.claimed.includes(receipt)) {
        next.privateState.bank[player][reward] = next.privateState.nextToken++;
        next.privateState.claimed.push(receipt);
        next.lastReward = { player, ability: reward };
      }
    }
  }
  expireOpponentEffects(next, player);
  advanceTurn(next, player);
  next.privateState.turnStart = positionOf(next);
  return updateView(next);
}

export function useRulesAbility(game: RulesGame, ability: Ability, target?: number): RulesGame {
  const player = game.turn;
  if (game.mode !== "enhanced") throw new Error("Abilities are available in Enhanced mode.");
  if (player === null) throw new Error("This match has ended.");
  if (!ABILITIES.includes(ability)) throw new Error("Choose a valid ability.");
  if (game.abilityUsed) throw new Error("You can use one ability each turn.");
  const token = game.privateState.bank[player][ability];
  if (token === null) throw new Error("Earn this ability first.");
  if (ability === "undo" && !canUseUndo(game, player)) throw new Error("There is no previous turn to undo.");
  if (ability === "shield" && (!Number.isInteger(target) || target! < 0 || target! > 63 || game.board[target!] !== player)) throw new Error("Choose one of your own pills.");
  if (ability === "corner" && (!CORNERS.includes(target!) || game.board[target!] !== 0)) throw new Error("Choose an empty corner.");
  const next = copyGame(game);
  next.privateState.spent.push(token);
  next.privateState.bank[player][ability] = null;
  next.lastReward = null;
  if (ability === "undo") {
    const historyIndex = lastOwnHistoryIndex(game, player);
    const restored = copyPosition(game.privateState.history[historyIndex].before);
    next.board = restored.board;
    next.turn = player;
    next.moveCount = restored.moveCount;
    next.moves = restored.moves;
    next.lastMove = restored.lastMove;
    next.passed = restored.passed;
    next.effects = restored.effects;
    next.privateState.bank = restored.bank;
    for (const color of [1, 2] as const) for (const item of ABILITIES) {
      if (next.privateState.spent.includes(next.privateState.bank[color][item]!)) next.privateState.bank[color][item] = null;
    }
    next.privateState.history = next.privateState.history.slice(0, historyIndex);
    next.privateState.turnStart = positionOf(next);
  } else {
    next.effects = next.effects.filter(effect => !(effect.ability === ability && effect.owner === player));
    next.effects.push({ ability, owner: player, index: target! });
  }
  next.abilityUsed = true;
  return updateView(next);
}

export function projectRulesGame(game: RulesGame): RulesView {
  return { mode: game.mode, board: [...game.board], turn: game.turn, moveCount: game.moveCount, lastMove: copyMove(game.lastMove), passed: game.passed, tokens: { 1: { ...game.tokens[1] }, 2: { ...game.tokens[2] } }, effects: game.effects.map(effect => ({ ...effect })), abilityUsed: game.abilityUsed, lastReward: game.lastReward ? { ...game.lastReward } : null, canUndo: { 1: canUseUndo(game, 1), 2: canUseUndo(game, 2) } };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isTurn = (value: unknown): value is Player | null => value === null || value === 1 || value === 2;
const isCell = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 64;
const isCounter = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000;
function isBank(value: unknown): value is TokenBank {
  if (!isObject(value)) return false;
  for (const player of [1, 2]) {
    const inventory = value[player];
    if (!isObject(inventory)) return false;
    for (const ability of ABILITIES) if (inventory[ability] !== null && (!isCounter(inventory[ability]) || inventory[ability] < 1)) return false;
  }
  return true;
}
function isVisiblePosition(value: unknown): value is Omit<RulesView, "tokens" | "canUndo" | "mode"> & Record<string, unknown> {
  if (!isObject(value) || !isBoard(value.board) || !isTurn(value.turn) || !isCounter(value.moveCount) || value.moveCount > 60 || !isTurn(value.passed) || typeof value.abilityUsed !== "boolean") return false;
  const board = value.board;
  if (value.lastMove !== null && (!isObject(value.lastMove) || !isCell(value.lastMove.index) || (value.lastMove.player !== 1 && value.lastMove.player !== 2) || !Array.isArray(value.lastMove.flips) || !value.lastMove.flips.length || value.lastMove.flips.length > 63 || !value.lastMove.flips.every(isCell) || new Set(value.lastMove.flips).size !== value.lastMove.flips.length)) return false;
  if (value.lastReward !== null && (!isObject(value.lastReward) || (value.lastReward.player !== 1 && value.lastReward.player !== 2) || !ABILITIES.includes(value.lastReward.ability as Ability))) return false;
  if (!Array.isArray(value.effects) || value.effects.length > 4) return false;
  const effects = value.effects;
  if (!effects.every(effect => isObject(effect) && (effect.owner === 1 || effect.owner === 2) && isCell(effect.index) && ((effect.ability === "shield" && board[effect.index] === effect.owner) || (effect.ability === "corner" && CORNERS.includes(effect.index) && board[effect.index] === 0)))) return false;
  return new Set(effects.map(effect => `${effect.owner}:${effect.ability}`)).size === effects.length;
}

function isPosition(value: unknown): value is Position {
  return isObject(value) && isVisiblePosition(value) && isBank(value.bank) && Array.isArray(value.moves) && value.moves.length <= 60 && value.moves.every(isCell) && new Set(value.moves).size === value.moves.length;
}

export function isRulesView(value: unknown): value is RulesView {
  if (!isObject(value) || !isVisiblePosition(value) || (value.mode !== "classic" && value.mode !== "enhanced") || !isObject(value.tokens) || !isObject(value.canUndo)) return false;
  for (const player of [1, 2] as const) {
    const inventory = value.tokens[player];
    if (!isObject(inventory) || ABILITIES.some(ability => typeof inventory[ability] !== "boolean") || typeof value.canUndo[player] !== "boolean") return false;
    if (value.canUndo[player] && (value.turn !== player || value.abilityUsed || !inventory.undo)) return false;
    if (value.mode === "classic" && (ABILITIES.some(ability => inventory[ability]) || value.canUndo[player])) return false;
  }
  return value.mode !== "classic" || (!value.effects.length && !value.abilityUsed && value.lastReward === null);
}

/** Reject malformed persisted data before either the client or room uses it. */
export function isRulesGame(value: unknown): value is RulesGame {
  if (!isObject(value) || value.schema !== 1 || !isRulesView(value) || !isObject(value.privateState)) return false;
  const state = value.privateState;
  if (!isBank(state.bank) || !isPosition({ ...value, bank: state.bank }) || !isPosition(state.turnStart) || !isCounter(state.nextToken) || state.nextToken < 1 || state.nextToken > MAX_REWARD_RECEIPTS + 1) return false;
  if (!Array.isArray(state.history) || state.history.length > MAX_RULES_HISTORY || !state.history.every(entry => isObject(entry) && (entry.player === 1 || entry.player === 2) && isPosition(entry.before) && entry.before.turn === entry.player)) return false;
  const nextToken = state.nextToken;
  if (!Array.isArray(state.spent) || state.spent.length > MAX_REWARD_RECEIPTS || !state.spent.every(id => isCounter(id) && id > 0 && id < nextToken) || new Set(state.spent).size !== state.spent.length) return false;
  if (!Array.isArray(state.claimed) || state.claimed.length > MAX_REWARD_RECEIPTS || !state.claimed.every(receipt => typeof receipt === "string" && /^[12]:\d{1,2}:(?:[0-9a-z]{20}|[012]{64})$/.test(receipt)) || new Set(state.claimed.map(compactReceipt)).size !== state.claimed.length || state.nextToken !== state.claimed.length + 1) return false;
  const bank = state.bank;
  const spent = state.spent;
  const bankIds = ([1, 2] as const).flatMap(player => ABILITIES.map(ability => bank[player][ability])).filter(id => id !== null);
  if (bankIds.some(id => id >= nextToken || spent.includes(id)) || new Set(bankIds).size !== bankIds.length) return false;
  for (const frame of [state.turnStart, ...state.history.map(entry => entry.before)]) {
    const ids = ([1, 2] as const).flatMap(player => ABILITIES.map(ability => frame.bank[player][ability])).filter(id => id !== null);
    if (ids.some(id => id >= nextToken) || new Set(ids).size !== ids.length) return false;
  }
  if (state.turnStart.turn !== value.turn) return false;
  if (value.mode === "classic" && (state.history.length || state.spent.length || state.claimed.length || bankIds.length || value.effects.length || value.abilityUsed || value.lastReward !== null)) return false;
  const tokens = value.tokens;
  const game = value as unknown as RulesGame;
  for (const player of [1, 2] as const) {
    if (ABILITIES.some(ability => tokens[player][ability] !== (bank[player][ability] !== null)) || value.canUndo[player] !== canUseUndo(game, player)) return false;
  }
  return true;
}

function positionValue(board: Board, player: Player): number {
  let value = 0;
  const empty = getScore(board).empty;
  for (let index = 0; index < 64; index++) {
    if (!board[index]) continue;
    const weight = CORNERS.includes(index) ? 110 : [9, 14, 49, 54].includes(index) ? -30 : index < 8 || index > 55 || index % 8 === 0 || index % 8 === 7 ? 9 : empty < 16 ? 8 : 1;
    value += (board[index] === player ? 1 : -1) * weight;
  }
  return value;
}

/** Bounded and deterministic. The UI may run this in its existing CPU worker. */
export function chooseRulesCpuAction(game: RulesGame, difficulty: Difficulty = "normal"): RulesCpuAction | null {
  const player = game.turn;
  if (player === null) return null;
  if (game.mode === "classic") {
    const index = chooseCpuMove(game.board, player, difficulty);
    return index === null ? null : { type: "move", index };
  }
  const moves = getRulesLegalMoves(game);
  if (!moves.length) return null;
  if (!game.abilityUsed) {
    const threats = getRulesLegalMoves(game, opponent(player));
    const corner = threats.find(move => CORNERS.includes(move.index));
    if (game.tokens[player].corner && corner) return { type: "ability", ability: "corner", target: corner.index };
    if (canUseUndo(game) && difficulty !== "easy") {
      const before = game.privateState.history[lastOwnHistoryIndex(game, player)].before;
      if (positionValue(before.board, player) - positionValue(game.board, player) >= 65) return { type: "ability", ability: "undo" };
    }
    if (game.tokens[player].shield) {
      const counts = new Map<number, number>();
      for (const threat of threats) for (const cell of threat.flips) counts.set(cell, (counts.get(cell) ?? 0) + threat.flips.length);
      const target = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (target && target[1] >= 3) return { type: "ability", ability: "shield", target: target[0] };
    }
  }
  let best = moves[0].index;
  let bestValue = -Infinity;
  for (const move of moves) {
    const next = playRulesMove(game, move.index);
    let value = positionValue(next.board, player) + move.flips.length * (difficulty === "easy" ? 14 : 1);
    if (next.lastReward) value += 9;
    if (next.turn === null) {
      const score = getScore(next.board);
      value = Math.sign(player === 1 ? score.black - score.white : score.white - score.black) * 100_000;
    } else if (difficulty !== "easy" && next.turn !== player) {
      let worst = Infinity;
      for (const reply of getRulesLegalMoves(next)) {
        const response = playRulesMove(next, reply.index);
        const score = positionValue(response.board, player) + getRulesLegalMoves(response, player).length * (difficulty === "hard" ? 6 : 3);
        worst = Math.min(worst, score);
      }
      value = worst + (next.lastReward ? 9 : 0);
    }
    if (value > bestValue) { bestValue = value; best = move.index; }
  }
  return { type: "move", index: best };
}
