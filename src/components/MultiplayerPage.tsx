import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Copy, Flag, Link, LoaderCircle, Settings2, Sprout, Trophy, Users, Wifi, WifiOff } from "lucide-react";
import { createInviteUrl } from "../lib/multiplayer";
import type { useMultiplayer } from "../lib/useMultiplayer";
import { getScore } from "../game/engine";
import { getRulesLegalMoves, type GameMode } from "../game/enhanced";
import { RECONNECT_GRACE_MS } from "../game/protocol";
import type { MatchSnapshot } from "../game/protocol";
import type { Profile } from "../lib/storage";
import { readStored, writeStored } from "../lib/storage";
import { playGameSound } from "../lib/gameAudio";
import { CAPTURE_START_MS, boardMoveSettleMs } from "../animation/moveMotion";
import { FLIPPOCALYPSE_MS, isFlippocalypseMove } from "../animation/flippocalypseMotion";
import ModePicker from "./ModePicker";
import AbilityPanel, { abilityTargets, type TargetAbility } from "./AbilityPanel";
import PillAvatar from "./PillAvatar";
import PlayerCard from "./PlayerCard";
import "./multiplayer.css";

const GameBoard = lazy(() => import("./GameBoard"));
type Multiplayer = ReturnType<typeof useMultiplayer>;

function useOnlineFeedback(snapshot: MatchSnapshot | null, playerId: string | null) {
  const previous = useRef(snapshot);
  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot;
    if (!before || !snapshot) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const placed = before.matchId === snapshot.matchId && snapshot.moveCount === before.moveCount + 1;
    if (placed) {
      playGameSound("place");
      timers.push(setTimeout(() => playGameSound("flip"), CAPTURE_START_MS));
    } else if (snapshot.matchId === before.matchId && snapshot.moveCount < before.moveCount) {
      playGameSound("undo");
    } else if (snapshot.rules.abilityUsed && !before.rules.abilityUsed) {
      playGameSound("success");
    } else if (snapshot.phase === "playing" && (before.phase !== "playing" || before.matchId !== snapshot.matchId)) {
      playGameSound("start");
    }
    if (snapshot.phase === "finished" && before.phase !== "finished") {
      const mine = snapshot.players.find((player) => player.id === playerId);
      const cue = snapshot.result?.winner === null ? "draw" : snapshot.result?.winner === mine?.color ? "win" : "loss";
      const settle = isFlippocalypseMove(before.board, snapshot.board, snapshot.mode) ? FLIPPOCALYPSE_MS : boardMoveSettleMs(before.board, snapshot.board);
      timers.push(setTimeout(() => playGameSound(cue), placed ? settle : 0));
    }
    return () => timers.forEach(clearTimeout);
  }, [snapshot?.matchId, snapshot?.moveCount, snapshot?.phase, snapshot?.rules.abilityUsed, playerId]);
}

export default function MultiplayerPage({ multiplayer: m, profile, motion, onBack, onSettings, onCharacters }: {
  multiplayer: Multiplayer;
  profile: Profile;
  motion: boolean;
  onBack: () => void;
  onSettings: () => void;
  onCharacters: () => void;
}) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<GameMode>(() => readStored("flip.preferredMode", "classic", value => value === "classic" || value === "enhanced"));
  const [target, setTarget] = useState<TargetAbility>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<"leave" | "surrender" | null>(null);
  const [now, setNow] = useState(Date.now);
  const inviteInput = useRef<HTMLInputElement>(null);
  const clockOffset = useRef(0);
  const snapshot = m.snapshot;
  useEffect(() => { if (snapshot) clockOffset.current = snapshot.serverTime - Date.now(); }, [snapshot]);
  const serverNow = now + clockOffset.current;
  const mine = snapshot?.players.find((player) => player.id === m.playerId);
  const opponent = snapshot?.players.find((player) => player.id !== m.playerId);
  const roomReady = m.status === "connected" && !!mine;
  const bothConnected = snapshot?.players.length === 2 && snapshot.players.every((player) => player.connected);
  const canMove = roomReady && bothConnected && snapshot?.phase === "playing" && snapshot.turn === mine?.color && !m.pending;
  const legalMoves = snapshot && canMove ? getRulesLegalMoves(snapshot.rules, mine!.color) : [];
  const targets = snapshot && mine ? abilityTargets(snapshot.rules, mine.color, target) : [];
  const score = snapshot ? getScore(snapshot.board) : { black: 2, white: 2, empty: 60 };
  const busy = m.pending || m.status === "connecting" || m.status === "reconnecting";
  const finished = snapshot?.phase === "finished";
  const waiting = !snapshot || snapshot.phase === "waiting";
  const ownWin = finished && snapshot.result?.winner === mine?.color;
  const draw = finished && snapshot.result?.winner === null;
  const seconds = snapshot?.startedAt ? Math.max(0, Math.floor(((snapshot.endedAt ?? serverNow) - snapshot.startedAt) / 1000)) : 0;
  const offlineSince = opponent?.disconnectedAt;
  const reconnectSeconds = offlineSince ? Math.max(0, Math.ceil((offlineSince + RECONNECT_GRACE_MS - serverNow) / 1000)) : 0;
  useOnlineFeedback(snapshot, m.playerId);

  useEffect(() => {
    setSelected(null);
    setAnimating(false);
  }, [snapshot?.matchId]);
  useEffect(() => { setSelected(null); setTarget(null); }, [snapshot?.revision, m.status]);
  useEffect(() => {
    if (snapshot?.phase === "playing") window.scrollTo({ top: 0, behavior: "instant" });
  }, [snapshot?.phase, snapshot?.matchId]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyInvite() {
    if (!m.roomCode) return;
    try {
      await navigator.clipboard.writeText(createInviteUrl(m.roomCode));
      setCopied(true);
      setCopyFailed(false);
      playGameSound("success");
    } catch {
      inviteInput.current?.focus();
      inviteInput.current?.select();
      setCopyFailed(true);
    }
  }
  function leave() {
    m.leave();
    setConfirmLeave(null);
    setSelected(null);
  }
  const title = !roomReady ? (m.status === "reconnecting" ? "Finding your friend again…" : "Connecting to your room…")
    : finished ? draw ? "A perfect balance." : ownWin ? "You win!" : `${opponent?.name ?? "Your friend"} wins.`
      : !bothConnected ? "Waiting for your friend…"
        : canMove ? "Your turn" : `${opponent?.name ?? "Your friend"}’s turn`;
  const description = !roomReady ? "Your board will update when the connection returns."
    : finished ? snapshot.result?.reason === "disconnect" ? ownWin ? "Your friend did not return in time." : "You did not reconnect before the time limit." : snapshot.result?.reason === "abandoned" ? "Both players left the match." : draw ? "The same number of pills. Play another round?" : "A good game deserves another round."
      : !bothConnected ? `The match is paused. Your friend has ${reconnectSeconds} seconds to return.`
        : canMove ? "Choose a glowing tile to place your pill." : "Your friend is choosing a move.";

  return (
    <div className="multiplayer-page game-page page-enter">
      <div className="page-topline">
        <button className="text-link" onClick={onBack}><ArrowLeft size={17} /> Back to the garden</button>
        <div>
          <span className="mode-tag"><Users size={15} /> PLAY WITH A FRIEND</span>
          {m.roomCode && <button className="text-link muted" disabled={m.pending} onClick={() => snapshot?.phase === "playing" ? setConfirmLeave("leave") : leave()}><Flag size={16} /> Leave room</button>}
        </div>
      </div>
      {confirmLeave && <div className="room-confirm" role="alert">
        <div><strong>{confirmLeave === "surrender" ? "Surrender this match?" : "Leave this match?"}</strong><p>Your friend will win this round.</p></div>
        <button className="button" onClick={() => setConfirmLeave(null)}>Keep playing</button>
        <button className="button" onClick={() => { if (confirmLeave === "surrender") { m.surrender(); setConfirmLeave(null); } else leave(); }}>{confirmLeave === "surrender" ? "Surrender match" : "Leave match"}</button>
      </div>}
      {m.error && <div className="room-error" role="alert"><WifiOff size={20} /><p>{m.error}</p><button className="button" disabled={busy} onClick={m.retry}>Try again</button></div>}
      {!m.roomCode ? (
        <section className="friends-lobby">
          <div className="friends-intro">
            <span className="eyebrow"><Sprout size={16} /> BETTER TOGETHER</span>
            <h1>A little friendly<br /><span>competition.</span></h1>
            <p>Invite a friend to your garden. Take turns, flip pills, and see who fills the board.</p>
            <div className="friends-pals" aria-hidden="true"><PillAvatar color="black" styleId={profile.styleId} size={130} reducedMotion={motion} /><span>✦</span><PillAvatar color="white" styleId="sprout" size={130} reducedMotion={motion} /></div>
            <button className="text-link" onClick={onCharacters}>Pick your pill style <ArrowRight size={16} /></button>
          </div>
          <div className="friends-entry">
            <h2>Make room for a friend.</h2>
            <p>Create a room and share the invite link. No account needed.</p>
            <ModePicker value={mode} onChange={next => { setMode(next); writeStored("flip.preferredMode", next); }} disabled={busy} />
            <button className="button primary" disabled={busy} onClick={() => m.createRoom(mode)}><Users size={19} /> {busy ? "Creating your room…" : "Create a room"}</button>
            <div className="room-divider"><span>or join your friend</span></div>
            <form onSubmit={(event) => { event.preventDefault(); m.joinRoom(code); }}>
              <label className="field-label" htmlFor="room-code">Room code or invite link
                <input id="room-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. GARDEN" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={500} required />
              </label>
              <button className="button" disabled={busy || !code.trim()} type="submit">Join room <ArrowRight size={17} /></button>
            </form>
            <p className="room-footnote"><Check size={15} /> Both players choose Ready before the game starts.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="room-invite" aria-label="Room invitation">
            <div><span className="eyebrow">YOUR ROOM</span><strong className="room-code">{m.roomCode}</strong></div>
            <div className="room-invite-link"><label htmlFor="invite-link">Invite a friend</label><input id="invite-link" ref={inviteInput} value={createInviteUrl(m.roomCode)} readOnly onFocus={(event) => event.target.select()} /></div>
            <button className="button" onClick={copyInvite}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Link copied" : "Copy invite"}</button>
            <span className={`room-connection ${roomReady ? "connected" : ""}`} role="status">{roomReady ? <Wifi size={15} /> : <LoaderCircle size={15} />}{roomReady ? "Connected" : m.status === "error" ? "Connection lost" : "Connecting…"}</span>
            {copyFailed && <p className="room-copy-help" role="status">Select the link above, then copy it to share with your friend.</p>}
          </section>
          {waiting ? <section className="room-waiting">
            <div className="room-waiting-heading"><span className="eyebrow">A PLACE FOR TWO</span><h1>{opponent ? "Your friend is here!" : "Save a seat for your friend."}</h1><p>{opponent ? "Both players choose Ready to start. Black plays first." : "Share your room code or invite link. Your friend can join from another device."}</p></div>
            {snapshot && <div className="room-mode"><ModePicker value={snapshot.mode} onChange={m.setMode} disabled={!roomReady || m.pending || snapshot.hostId !== m.playerId} /><p>{snapshot.hostId === m.playerId ? "You choose the mode. A change clears both Ready selections." : "Your host chooses the mode. Select Ready to accept these rules."}</p>{snapshot.mode === "enhanced" && <p><strong>By selecting Ready, both players accept earned Undo. It can reverse a turn without another approval.</strong></p>}</div>}
            <div className="room-seats">{[1, 2].map((color) => {
              const player = snapshot?.players.find((p) => p.color === color);
              return <div className={`room-seat ${!player ? "empty" : ""}`} key={color}>
                <PillAvatar color={color === 1 ? "black" : "white"} styleId={player?.styleId ?? "classic"} size={100} reducedMotion={motion} expression={!player ? "curious" : player.ready ? "grin" : undefined} />
                <strong>{player?.name ?? "Your friend’s seat"}</strong><span>{color === 1 ? "Black · first move" : "White · second move"}{player?.id === m.playerId ? " · You" : ""}</span>
                <span className={`room-ready-tag ${player?.ready ? "ready" : ""}`}>{!player ? "Waiting for a friend" : !player.connected ? "Reconnecting…" : player.ready ? "Ready!" : "Not ready yet"}</span>
              </div>;
            })}</div>
            <button className="button primary room-ready-button" disabled={!roomReady || m.pending || !!mine?.ready} onClick={m.ready}><Check size={20} />{mine?.ready ? "You are ready" : "I’m ready"}</button>
            <p className="room-footnote">{mine?.ready ? "Your game starts when your friend is ready." : "Your pill style is saved for this room."}</p>
          </section> : <div className="game-layout">
            <div className="board-column">
              <section className="board-panel">
                <div className="board-heading">
                  <div className="board-heading-title"><Sprout /><div><h1>{snapshot!.mode === "enhanced" ? "Enhanced Match" : "Classic Match"}</h1><p>Two friends. One little board.</p></div></div>
                  <span className="mode-tag board-mode-tag">{mine?.color === 1 ? "You play black" : "You play white"}</span>
                  <button className="button board-settings" onClick={onSettings}><Settings2 size={17} /> Settings</button>
                </div>
                <div className="board-with-labels"><div className="column-labels">{"ABCDEFGH".split("").map((label) => <span key={label}>{label}</span>)}</div><div className="row-labels">{Array.from({ length: 8 }, (_, index) => <span key={index}>{index + 1}</span>)}</div><div className="board-slot"><Suspense fallback={<div className="board-loading"><Sprout /><p>Growing your garden…</p></div>}>
                  <GameBoard key={snapshot!.matchId} board={snapshot!.board} legalMoves={legalMoves.map((move) => move.index)} selected={selected} onSelect={setSelected} mode={snapshot!.mode} effects={snapshot!.rules.effects} targetMode={target} targetIndices={targets} disabled={!canMove || animating} onAnimatingChange={setAnimating} styleId={profile.styleId} styleIds={Object.fromEntries(snapshot!.players.map((player) => [player.color, player.styleId]))} reducedMotion={motion} />
                </Suspense></div></div>
                <div className="board-tip"><Sprout size={22} /><p>{target ? target === "shield" ? "Select your pill to protect it for one opposing turn." : "Select an empty corner to reserve it for one opposing turn." : finished ? "Good game! Ask your friend for a rematch." : selected !== null ? `This move flips ${legalMoves.find((move) => move.index === selected)?.flips.length ?? 0} pills. Press Place pill to play.` : "Trap a line of your friend’s pills to flip them."}</p></div>
              </section>
              <div className="board-actions">
                {finished ? <><button className="button primary place-button" disabled={!roomReady || !bothConnected || m.pending || !!mine?.wantsRematch} onClick={m.rematch}><Users size={20} />{mine?.wantsRematch ? "Rematch requested" : opponent?.wantsRematch ? "Accept rematch" : "Play again"}</button><p className="room-footnote">{mine?.wantsRematch ? "Waiting for your friend. Colors swap in the next round." : "Both players agree before the next round."}</p></> : <button className="button primary place-button" disabled={!canMove || animating || selected === null || (target !== null && !targets.includes(selected))} onClick={() => { if (selected !== null) { if (target) m.useAbility(target, selected); else m.move(selected); } }}><span className="pill-button-icon">⠿</span>{m.pending ? "Sending…" : target === "shield" ? "Protect pill" : target === "corner" ? "Claim corner" : "Place pill"}{selected !== null && <span className="move-coordinate">{"ABCDEFGH"[selected % 8]}{Math.floor(selected / 8) + 1}</span>}</button>}
              </div>
            </div>
            <aside className="game-sidebar">
              <div className={`turn-card ${finished ? "finished" : ""}`} role="status"><div>{finished ? <Trophy /> : <span className={`turn-light ${!canMove ? "thinking" : ""}`} />}<h2>{title}</h2></div><p>{description}</p>{snapshot!.passed && !finished && <small>{snapshot!.passed === mine?.color ? "You have no legal move. Your friend plays again." : "Your friend has no legal move. You play again."}</small>}</div>
              {[1, 2].map((color) => {
                const player = snapshot!.players.find((p) => p.color === color);
                return <PlayerCard key={`${snapshot!.matchId}-${color}`} name={player?.name ?? "Friend"} color={color === 1 ? "black" : "white"} score={color === 1 ? score.black : score.white} winning={!finished && (color === 1 ? score.black > score.white : score.white > score.black)} active={!finished && roomReady && bothConnected && snapshot!.turn === color} styleId={player?.styleId ?? "classic"} you={player?.id === m.playerId} opponentLabel="Friend" outcome={!finished ? undefined : draw ? "draw" : snapshot!.result?.winner === color ? "win" : "loss"} reducedMotion={motion} />;
              })}
              <div className="match-stats"><div><span><Clock3 size={17} /> Game time</span><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong></div><div><span>Empty tiles</span><strong>{score.empty}</strong></div></div>
              <div className="game-tools"><button className="button surrender-action" disabled={!roomReady || m.pending || !!finished} onClick={() => setConfirmLeave("surrender")}><Flag size={17} /> Surrender</button></div>
              {mine && <AbilityPanel rules={snapshot!.rules} player={mine.color} canAct={!!canMove && !animating} target={target} onChoose={ability => {
                setSelected(null);
                if (ability === "undo") m.useAbility("undo"); else setTarget(current => current === ability ? null : ability);
              }} onCancel={() => { setTarget(null); setSelected(null); }} />}
              <p className="autosave"><Link size={13} /> Your room saves each move.</p>
            </aside>
          </div>}
        </>
      )}
    </div>
  );
}
