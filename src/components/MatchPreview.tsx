import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Lightbulb,
  Settings,
  Sprout,
  Timer,
  Undo2,
} from "lucide-react";
import {
  applyMove,
  createBoard,
  getLegalMoves,
  getScore,
  type Player,
} from "../game/engine";
import PillAvatar from "./PillAvatar";
import { playGameSound } from "../lib/gameAudio";
import "./MatchPreview.css";
import { moveSettleMs } from "../animation/moveMotion";

const GameBoard = lazy(() => import("./GameBoard"));

// A legal opening produces a small, balanced position for a single practice move.
// This board never enters the saved match or the result submission system.
const opening = [37, 29, 18, 26, 19, 44, 21, 20, 34, 25, 11, 43];
const initialBoard = opening.reduce(
  (board, index, move) =>
    applyMove(board, index, (move % 2 === 0 ? 1 : 2) as Player),
  createBoard(),
);

type MatchPreviewProps = {
  onPlay: () => void;
  onSettings: () => void;
  styleId: string;
  reducedMotion: boolean;
};

export default function MatchPreview({
  onPlay,
  onSettings,
  styleId,
  reducedMotion,
}: MatchPreviewProps) {
  const [board, setBoard] = useState(initialBoard);
  const [flipped, setFlipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const played = flipped > 0;
  useEffect(() => {
    if (!played) return;
    const timer = setTimeout(() => playGameSound("flip"), 100);
    return () => clearTimeout(timer);
  }, [played]);
  const score = getScore(board);
  const legalMoves = played ? [] : getLegalMoves(board, 1);
  const best = Math.max(0, ...legalMoves.map((move) => move.flips.length));

  useEffect(() => {
    if (played) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        setSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [played]);

  useEffect(() => () => clearTimeout(animationTimer.current), []);

  function place(index: number) {
    if (played || busy) return;
    const move = legalMoves.find((candidate) => candidate.index === index);
    if (!move) return;
    playGameSound("place");
    setBoard(applyMove(board, index, 1));
    setFlipped(move.flips.length);
    setBusy(!reducedMotion);
    if (!reducedMotion)
      animationTimer.current = setTimeout(() => setBusy(false), moveSettleMs(move.flips.length));
  }

  function undo() {
    if (busy) return;
    if (played) playGameSound("undo");
    clearTimeout(animationTimer.current);
    setBoard(initialBoard);
    setFlipped(0);
    setSeconds(0);
  }

  const clock = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <section
      className="preview-panel"
      aria-labelledby="preview-title"
      data-testid="match-preview"
    >
      <header className="preview-heading">
        <div>
          <h2 id="preview-title">
            <Sprout size={22} aria-hidden="true" /> Classic Match
          </h2>
          <p className="preview-turn" role="status">
            <span aria-hidden="true" />
            {played ? "Nice flip!" : "Your turn"}
            <span className="preview-demo-label">Try a move</span>
          </p>
        </div>
        <div className="preview-tools">
          <button
            type="button"
            onClick={undo}
            disabled={!played || busy}
            aria-label="Reset preview board"
            title="Reset preview"
          >
            <Undo2 size={21} />
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="Open game settings"
            title="Game settings"
          >
            <Settings size={21} />
          </button>
        </div>
      </header>

      <div className="preview-play-area">
        <div className="preview-board-labels">
          <div className="preview-columns" aria-hidden="true">
            {"ABCDEFGH".split("").map((letter) => (
              <span key={letter}>{letter}</span>
            ))}
          </div>
          <div className="preview-rows" aria-hidden="true">
            {Array.from({ length: 8 }, (_, row) => (
              <span key={row}>{row + 1}</span>
            ))}
          </div>
          <div className="preview-board-slot">
            <Suspense
              fallback={
                <div className="preview-loading">
                  <Sprout size={30} />
                  <span>Growing your board…</span>
                </div>
              }
            >
              <GameBoard
                board={board}
                legalMoves={legalMoves.map((move) => move.index)}
                selected={null}
                onSelect={place}
                disabled={played || busy}
                styleId={styleId}
                reducedMotion={reducedMotion}
              />
            </Suspense>
          </div>
        </div>

        <aside className="preview-sidebar" aria-label="Practice board score">
          <PreviewPlayer
            color="black"
            count={score.black}
            styleId={styleId}
            reducedMotion={reducedMotion}
            played={played}
          />
          <PreviewPlayer
            color="white"
            count={score.white}
            styleId={styleId}
            reducedMotion={reducedMotion}
            played={played}
          />
          <div className="preview-stat preview-clock">
            <div>
              <Timer size={17} aria-hidden="true" /> Demo time
            </div>
            <strong>{clock}</strong>
          </div>
          <div className="preview-stat preview-remaining">
            <div>Tiles left</div>
            <strong>{score.empty}</strong>
          </div>
          <button className="preview-full-game" type="button" onClick={onPlay}>
            Play full game <ArrowRight size={15} aria-hidden="true" />
          </button>
        </aside>
      </div>

      <div className="preview-hint">
        <Lightbulb size={20} aria-hidden="true" />
        <p aria-live="polite">
          <strong>{played ? "Lovely!" : "Hint:"}</strong>{" "}
          {played
            ? `You flipped ${flipped} ${flipped === 1 ? "pill" : "pills"}. Try another?`
            : `You can flip ${best} pills!`}
        </p>
        <button type="button" onClick={undo} disabled={!played || busy}>
          <Undo2 size={14} aria-hidden="true" /> Undo
        </button>
      </div>
    </section>
  );
}

function PreviewPlayer({
  color,
  count,
  styleId,
  reducedMotion,
  played,
}: {
  color: "black" | "white";
  count: number;
  styleId: string;
  reducedMotion: boolean;
  played: boolean;
}) {
  return (
    <div className={`preview-player preview-player-${color}`}>
      <div className="preview-player-main">
        <PillAvatar
          color={color}
          size={54}
          styleId={styleId}
          reducedMotion={reducedMotion}
          expression={played ? (color === "black" ? "grin" : "sad") : undefined}
        />
        <div>
          <div className="preview-player-name">
            {color === "black" ? "Black" : "White"}
            {color === "black" && <span>You</span>}
          </div>
          <strong data-testid={`preview-${color}-score`}>{count}</strong>
        </div>
      </div>
      <div className="preview-score-dots" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <i
            key={index}
            className={index < Math.round(count / 8) ? "filled" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
