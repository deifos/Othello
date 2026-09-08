import { useEffect, useRef, useState } from "react";
import type { Expression } from "../styles/expressions";
import ResultPortrait, { type ResultOutcome } from "./ResultPortrait";
export default function PlayerCard({
  name,
  color,
  score,
  active,
  winning = false,
  styleId,
  you = false,
  opponentLabel = "CPU",
  outcome,
  reducedMotion = false,
}: {
  name: string;
  color: "black" | "white";
  score: number;
  active: boolean;
  winning?: boolean;
  styleId: string;
  you?: boolean;
  opponentLabel?: string;
  outcome?: ResultOutcome;
  reducedMotion?: boolean;
}) {
  const previousScore = useRef(score);
  const [reaction, setReaction] = useState<Expression>();
  useEffect(() => {
    const change = score - previousScore.current;
    previousScore.current = score;
    if (reducedMotion || change === 0) {
      setReaction(undefined);
      return;
    }
    setReaction(change > 0 ? "grin" : "sad");
    const clear = setTimeout(() => setReaction(undefined), 1400);
    return () => clearTimeout(clear);
  }, [score, reducedMotion]);
  return (
    <section className={`player-card ${active ? "is-active" : ""}`}>
      <ResultPortrait
        color={color}
        styleId={styleId}
        outcome={outcome}
        expression={
          reaction ?? (!you && active ? "curious" : undefined)
        }
        blink={reaction ? "open" : undefined}
        reducedMotion={reducedMotion}
      />
      <div>
        <div className="player-title">
          <strong>{color === "black" ? "Black" : "White"}</strong>
          {you ? (
            <span className="you-tag">You</span>
          ) : (
            <span className="cpu-tag">{opponentLabel}</span>
          )}
        </div>
        <div className="player-score">
          {score}
          <span>pills</span>
        </div>
        <span className="player-name">{name}</span>
        <div className={`player-turn-status ${reducedMotion ? "no-motion" : ""}`} role="status">
          {active && !outcome && <>
            {!you && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}
            <span>{you ? "Your turn" : "Thinking…"}</span>
          </>}
        </div>
        <div className="winning-slot" aria-live="polite">
          {winning && <span className={`winning-tag ${reducedMotion ? "no-motion" : ""}`}>Winning</span>}
        </div>
      </div>
      <div className="score-track" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className={i < Math.ceil(score / 8) ? `filled ${color}` : ""}
          />
        ))}
      </div>
    </section>
  );
}
