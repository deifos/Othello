import {
  Gift,
  Heart,
  Leaf,
  Play,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import HeroGarden from "./HeroGarden";
import MatchPreview from "./MatchPreview";
import HomeHowTo from "./HomeHowTo";

type HomeLandingProps = {
  styleId: string;
  reducedMotion: boolean;
  continuing: boolean;
  onPlay: () => void;
  onLearn: () => void;
  onRankings: () => void;
  onCharacters: () => void;
  onFriends: () => void;
  onSettings: () => void;
};

export default function HomeLanding(props: HomeLandingProps) {
  return (
    <div className="home-layout page-enter">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-garden">
          <HeroGarden reducedMotion={props.reducedMotion} />
        </div>
        <div className="landing-hero-copy">
          <h1 id="landing-title" className="landing-ribbon">
            Outflank. Outflip. Outlast.
          </h1>
          <p>
            A cute twist on the classic strategy game.
            <br />
            Flip your opponent’s pieces, control the board,
            <br className="landing-copy-break" /> and finish with the most
            pills!
          </p>
          <div className="landing-hero-actions">
            <button className="button primary large" onClick={props.onPlay}>
              <Play size={21} fill="currentColor" />
              {props.continuing ? "Continue Game" : "Play Now"}
            </button>
            <button className="button" onClick={props.onFriends}>
              <Users size={20} />
              Play with Friends
            </button>
          </div>
          <div className="landing-love">
            <Heart size={16} fill="currentColor" />
            <span>Just because it’s simple doesn’t mean it’s easy.</span>
          </div>
        </div>
        <Sparkles className="landing-sparkle one" aria-hidden="true" />
        <Sparkles className="landing-sparkle two" aria-hidden="true" />
      </section>
      <MatchPreview
        styleId={props.styleId}
        reducedMotion={props.reducedMotion}
        onPlay={props.onPlay}
        onSettings={props.onSettings}
      />
      <section className="landing-features" aria-label="A little more to love">
        <button onClick={props.onLearn}>
          <span className="landing-feature-icon leaf">
            <Leaf />
          </span>
          <h2>Easy to Learn</h2>
          <p>
            Simple rules,
            <br />
            clever little moves.
          </p>
        </button>
        <button onClick={props.onRankings}>
          <span className="landing-feature-icon trophy">
            <Trophy />
          </span>
          <h2>Rank Up</h2>
          <p>
            Climb the leaderboard
            <br />
            and grow your skills.
          </p>
        </button>
        <button onClick={props.onFriends}>
          <span className="landing-feature-icon friends">
            <Users />
          </span>
          <h2>Play Together</h2>
          <p>
            Invite a friend.
            <br />
            Share a board and a smile.
          </p>
        </button>
        <button onClick={props.onCharacters}>
          <span className="landing-feature-icon gift">
            <Gift />
          </span>
          <h2>Pick Your Personality</h2>
          <p>
            Ten cute pill styles.
            <br />
            Find your favorite.
          </p>
          <ShoppingBag className="feature-link-hint" size={14} />
        </button>
      </section>
      <HomeHowTo onLearn={props.onLearn} reducedMotion={props.reducedMotion} />
    </div>
  );
}
