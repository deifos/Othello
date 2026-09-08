import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Crown,
  Flag,
  Gamepad2,
  Globe2,
  Heart,
  Info,
  ShoppingBag,
  Lightbulb,
  Medal,
  Moon,
  Music2,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import PillAvatar from "./components/PillAvatar";
import SoundStylePicker from "./components/SoundStylePicker";
import MusicSettings from "./components/MusicSettings";
import { useMusic } from "./lib/useMusic";
import { useMultiplayer } from "./lib/useMultiplayer";
import MultiplayerPage from "./components/MultiplayerPage";
import {
  configureGameAudio,
  isSoundStyle,
  playGameSound,
  previewGameSound,
  startGameAudio,
  unlockGameAudio,
  type SoundStyle,
} from "./lib/gameAudio";
import type { ResultOutcome } from "./components/ResultPortrait";
import PlayerCard from "./components/PlayerCard";
import "./components/character-picker.css";
import HomeLanding from "./components/HomeLanding";
import SiteFooter, {
  InformationContent,
  informationTitles,
} from "./components/SiteFooter";
import type { InformationPage } from "./components/SiteFooter";
import { CHARACTER_STYLES } from "./styles/characters";
import { useGame } from "./lib/useGame";
import type { Difficulty } from "./lib/useGame";
import {
  loadProfile,
  loadResults,
  readStored,
  writeStored,
} from "./lib/storage";
import type { MatchResult, Profile } from "./lib/storage";
import {
  getRankings,
  enqueueResult,
  flushPendingResults,
  getCurrentPlayerId,
} from "./lib/leaderboard";
import type { Ranking } from "./lib/leaderboard";
const GameBoard = lazy(() => import("./components/GameBoard"));
type Page = "home" | "play" | "multiplayer" | "leaderboard" | "how-to-play" | "characters";

const GAME_BACKGROUNDS = [
  "/assets/game-backgrounds/garden-path.webp",
  "/assets/game-backgrounds/greenhouse-clearing.webp",
  "/assets/game-backgrounds/orchard-bridge.webp",
  "/assets/game-backgrounds/willow-pond.webp",
  "/assets/game-backgrounds/flower-arch.webp",
] as const;

function randomBackground(except = -1) {
  const choices = GAME_BACKGROUNDS.length - (except >= 0 ? 1 : 0);
  let index = Math.floor(Math.random() * choices);
  if (except >= 0 && index >= except) index += 1;
  return index;
}

function GameBackdrop() {
  const initialIndex = useRef(randomBackground());
  const currentIndex = useRef(initialIndex.current);
  const activeLayer = useRef<0 | 1>(0);
  const [layers, setLayers] = useState<[number, number]>([
    initialIndex.current,
    initialIndex.current,
  ]);
  const [visibleLayer, setVisibleLayer] = useState<0 | 1>(0);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let firstFrame = 0;
    let secondFrame = 0;

    const schedule = () => {
      timer = window.setTimeout(showNext, 18_000 + Math.random() * 10_000);
    };
    const showNext = () => {
      const nextIndex = randomBackground(currentIndex.current);
      const image = new Image();
      image.decoding = "async";
      image.src = GAME_BACKGROUNDS[nextIndex];
      image.onload = () => {
        if (stopped) return;
        const incomingLayer: 0 | 1 = activeLayer.current === 0 ? 1 : 0;
        setLayers((current) => {
          const next: [number, number] = [...current];
          next[incomingLayer] = nextIndex;
          return next;
        });
        firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(() => {
            if (stopped) return;
            activeLayer.current = incomingLayer;
            currentIndex.current = nextIndex;
            setVisibleLayer(incomingLayer);
            schedule();
          });
        });
      };
      image.onerror = schedule;
    };

    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <div className="game-backdrop" aria-hidden="true">
      {layers.map((backgroundIndex, layer) => (
        <div
          key={layer}
          className={`game-backdrop-image ${visibleLayer === layer ? "is-visible" : ""}`}
          style={{
            backgroundImage: `url(${GAME_BACKGROUNDS[backgroundIndex]})`,
          }}
        />
      ))}
      <div className="game-backdrop-wash" />
    </div>
  );
}

function getPage(): Page {
  const p = location.hash.slice(1).split("/")[0];
  return ["play", "multiplayer", "leaderboard", "how-to-play", "characters"].includes(p)
    ? (p as Page)
    : "home";
}
function Logo() {
  return (
    <span className="wordmark">
      <Sprout aria-hidden="true" />
      <span>
        FLIP <span className="wordmark-green">BUDDIES</span>
      </span>
    </span>
  );
}
function Button({
  children,
  onClick,
  kind = "",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`button ${kind} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
const difficultyLabels = {
  easy: "Easy breezy",
  normal: "A little challenge",
  hard: "Think it through",
};
export default function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [profile, setProfile] = useState(loadProfile);
  const [results, setResults] = useState(loadResults);
  const [dark, setDark] = useState(() => readStored("flip.dark", false));
  const [sound, setSound] = useState(() =>
    readStored("flip.sound", true, (value) => typeof value === "boolean"),
  );
  const [soundStyle, setSoundStyle] = useState<SoundStyle>(() =>
    readStored(
      "flip.soundStyleChosen",
      false,
      (value) => typeof value === "boolean",
    )
      ? readStored("flip.soundStyle", "zen", isSoundStyle)
      : "zen",
  );
  const [motion, setMotion] = useState(() =>
    readStored(
      "flip.motion",
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  );
  const [modal, setModal] = useState<
    "profile" | "settings" | "music" | "surrender" | "new" | InformationPage | null
  >(null);
  const previousModal = useRef(modal);
  const previousPage = useRef(page);
  const silentModalClose = useRef(false);
  const silentNavigation = useRef(false);
  const [toast, setToast] = useState("");
  const game = useGame(page === "play", sound);
  const multiplayer = useMultiplayer(profile);
  const currentRoom = useRef(multiplayer.roomCode);
  currentRoom.current = multiplayer.roomCode;
  const onlinePlayer = multiplayer.snapshot?.players.find((player) => player.id === multiplayer.playerId);
  const onlineVictory = multiplayer.snapshot?.phase === "finished" &&
    multiplayer.snapshot.result?.winner === onlinePlayer?.color;
  const music = useMusic(
    (page === "play" && !game.state.finished) ||
      (page === "multiplayer" && multiplayer.snapshot?.phase === "playing") ? "match" : "menu",
    page === "multiplayer" && onlineVictory ? multiplayer.snapshot!.matchId :
      page === "play" && game.state.finished && !game.state.surrendered &&
      game.score.black > game.score.white ? game.state.id : null,
  );
  const [defaultDifficulty, setDefaultDifficulty] = useState<Difficulty>(
    game.state.difficulty,
  );
  useEffect(() => {
    const listener = () => {
      setPage(getPage());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    const followInvite = () => {
      if (!location.hash.startsWith("#multiplayer/")) return;
      const code = location.hash.slice("#multiplayer/".length);
      if (code && code !== currentRoom.current) multiplayer.joinRoom(code);
    };
    followInvite();
    window.addEventListener("hashchange", followInvite);
    return () => window.removeEventListener("hashchange", followInvite);
  }, [multiplayer.joinRoom]);
  useEffect(() => {
    if (page !== "multiplayer") return;
    const hash = multiplayer.roomCode ? `#multiplayer/${multiplayer.roomCode}` : "#multiplayer";
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }, [page, multiplayer.roomCode]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    writeStored("flip.dark", dark);
  }, [dark]);
  useEffect(() => {
    if (
      !readStored(
        "flip.soundStyleChosen",
        false,
        (value) => typeof value === "boolean",
      )
    ) setSoundStyle("zen");
  }, []);
  useEffect(() => {
    writeStored("flip.sound", sound);
    writeStored("flip.soundStyle", soundStyle);
    configureGameAudio(sound, soundStyle);
  }, [sound, soundStyle]);
  useEffect(() => startGameAudio(), []);
  useEffect(() => {
    if (previousModal.current === modal) return;
    previousModal.current = modal;
    if (modal) playGameSound("open");
    else if (!silentModalClose.current) playGameSound("close");
    silentModalClose.current = false;
  }, [modal]);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    if (!silentNavigation.current) {
      playGameSound(page === "home" ? "back" : "select");
    }
    silentNavigation.current = false;
  }, [page]);
  useEffect(() => {
    writeStored("flip.motion", motion);
    document.documentElement.dataset.motion = motion ? "reduced" : "full";
  }, [motion]);
  useEffect(() => writeStored("flip.profile", profile), [profile]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const retry = () => {
      void flushPendingResults().catch(() => {});
    };
    retry();
    window.addEventListener("online", retry);
    const interval = setInterval(retry, 30000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(interval);
    };
  }, []);
  const recording = useRef(new Set<string>());
  useEffect(() => {
    if (
      !game.state.finished ||
      results.some((r) => r.id === game.state.id) ||
      recording.current.has(game.state.id)
    )
      return;
    recording.current.add(game.state.id);
    const result: MatchResult = {
      id: game.state.id,
      date: new Date().toISOString(),
      black: game.score.black,
      white: game.score.white,
      outcome: game.state.surrendered
        ? "loss"
        : game.score.black > game.score.white
          ? "win"
          : game.score.black < game.score.white
            ? "loss"
            : "draw",
      difficulty: game.state.difficulty,
      moves: game.state.moves,
      surrendered: game.state.surrendered,
    };
    setResults((prev) => {
      const next = [result, ...prev].slice(0, 1000);
      writeStored("flip.results", next);
      return next;
    });
    void enqueueResult(profile, result).catch(() =>
      setToast("Game saved on this device. Rankings are offline."),
    );
  }, [game.state, game.score, results, profile]);
  function navigate(next: Page) {
    if (next === page) return;
    location.hash = next === "home" ? "" : next;
  }
  function closeModal(silent = false) {
    silentModalClose.current = silent;
    setModal(null);
  }
  function changeTheme(next: boolean) {
    if (next === dark) return;
    setDark(next);
    playGameSound("select");
  }
  function play() {
    if (page !== "play") {
      silentNavigation.current = !game.state.started || game.state.finished;
    }
    if (game.state.finished) game.reset(defaultDifficulty);
    else game.start();
    navigate("play");
  }
  function saveProfile(name: string) {
    setProfile((p) => ({
      ...p,
      name:
        Array.from(name.replace(/\p{Cc}/gu, "").trim())
          .slice(0, 24)
          .join("") || "Little Flipper",
    }));
    closeModal(true);
    playGameSound("success");
    setToast("Your name is saved. Make yourself at home.");
  }
  return (
    <div className="app-shell" data-page={page}>
      {(page === "home" || page === "play" || page === "multiplayer") && <GameBackdrop />}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <button
          className="logo-button"
          onClick={() => navigate("home")}
          aria-label="Flip Buddies home"
        >
          <Logo />
        </button>
        <nav aria-label="Main navigation">
          <button
            className={page === "home" || page === "play" ? "active" : ""}
            onClick={() => navigate("home")}
          >
            <Gamepad2 />
            Play
          </button>
          <button className={page === "multiplayer" ? "active" : ""} onClick={() => navigate("multiplayer")}>
            <Users /> Friends
          </button>
          <button
            className={page === "leaderboard" ? "active" : ""}
            onClick={() => navigate("leaderboard")}
          >
            <Trophy />
            Leaderboard
          </button>
          <button
            className={page === "how-to-play" ? "active" : ""}
            onClick={() => navigate("how-to-play")}
          >
            <BookOpen />
            How to Play
          </button>
          <button onClick={() => setModal("about")}>
            <Info />
            About
          </button>
          <button
            className={page === "characters" ? "active" : ""}
            onClick={() => navigate("characters")}
          >
            <ShoppingBag />
            Shop
          </button>
        </nav>
        <div className="header-actions">
          <button
            className={`music-trigger ${music.status === "playing" ? "is-playing" : ""}`}
            aria-label="Music settings"
            title="Music settings"
            onClick={() => setModal("music")}
          >
            <Music2 size={19} aria-hidden="true" />
            <span className="music-indicator" aria-hidden="true" />
          </button>
          <div className="theme-switch" aria-label="Color theme">
            <button
              aria-label="Use light theme"
              aria-pressed={!dark}
              className={!dark ? "chosen" : ""}
              onClick={() => changeTheme(false)}
            >
              <Sun />
            </button>
            <button
              aria-label="Use dark theme"
              aria-pressed={dark}
              className={dark ? "chosen" : ""}
              onClick={() => changeTheme(true)}
            >
              <Moon />
            </button>
          </div>
          <button
            className="profile-button"
            aria-label={`Edit profile for ${profile.name}`}
            onClick={() => setModal("profile")}
          >
            <PillAvatar styleId={profile.styleId} size={37} />
            <span>{profile.name}</span>
            <ChevronDown size={15} />
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {page === "home" && (
          <HomeLanding
            styleId={profile.styleId}
            reducedMotion={motion}
            onPlay={play}
            onLearn={() => navigate("how-to-play")}
            onRankings={() => navigate("leaderboard")}
            onCharacters={() => navigate("characters")}
            onFriends={() => navigate("multiplayer")}
            onSettings={() => setModal("settings")}
            continuing={
              game.state.started &&
              !game.state.finished &&
              game.state.moves.length > 0
            }
          />
        )}
        {page === "play" && (
          <GameView
            game={game}
            profile={profile}
            motion={motion}
            onSettings={() => setModal("settings")}
            onSurrender={() => setModal("surrender")}
            onNew={() =>
              game.state.finished
                ? game.reset(defaultDifficulty)
                : setModal("new")
            }
            onBack={() => navigate("home")}
            onCharacters={() => navigate("characters")}
          />
        )}
        {page === "multiplayer" && (
          <MultiplayerPage multiplayer={multiplayer} profile={profile} motion={motion}
            onBack={() => navigate("home")} onSettings={() => setModal("settings")}
            onCharacters={() => navigate("characters")} />
        )}
        {page === "characters" && (
          <Characters
            profile={profile}
            reducedMotion={motion}
            onSelect={(styleId) => setProfile((p) => ({ ...p, styleId }))}
            onPlay={play}
          />
        )}
        {page === "how-to-play" && <HowTo onPlay={play} />}
        {page === "leaderboard" && (
          <Leaderboard profile={profile} results={results} onPlay={play} />
        )}
      </main>
      <SiteFooter
        logo={<Logo />}
        onHome={() => navigate("home")}
        onInformation={setModal}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "profile"
              ? "Hello, little flipper."
              : modal === "settings"
                ? "Make it your kind of cozy."
                : modal === "music"
                  ? "A little music for your game."
                : modal === "new"
                  ? "A fresh start?"
                  : modal === "surrender"
                    ? "Leave this match?"
                    : informationTitles[modal]
          }
          onClose={() => closeModal()}
        >
          {modal in informationTitles && (
            <InformationContent
              page={modal as InformationPage}
              onPlay={() => {
                closeModal(true);
                play();
              }}
            />
          )}
          {modal === "profile" && (
            <ProfileForm
              profile={profile}
              onSave={saveProfile}
              onCharacters={() => {
                closeModal(true);
                navigate("characters");
              }}
            />
          )}
          {modal === "music" && <MusicSettings {...music} />}
          {modal === "settings" && (
            <div className="settings-content">
              <p>Small changes for a comfortable game.</p>
              <label className="setting-row">
                <span>{sound ? <Volume2 /> : <VolumeX />}Game sounds</span>
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSound(next);
                    configureGameAudio(next, soundStyle);
                    if (next) {
                      void unlockGameAudio();
                      playGameSound("toggleOn");
                    }
                  }}
                />
              </label>
              <SoundStylePicker
                value={soundStyle}
                enabled={sound}
                onChange={(next) => {
                  writeStored("flip.soundStyleChosen", true);
                  setSoundStyle(next);
                  configureGameAudio(sound, next);
                  playGameSound("select");
                }}
                onPreview={previewGameSound}
              />
              <MusicSettings {...music} />
              <label className="setting-row">
                <span>
                  <Sparkles />
                  Reduce animation
                </span>
                <input
                  type="checkbox"
                  checked={motion}
                  onChange={(e) => {
                    setMotion(e.target.checked);
                    playGameSound("select");
                  }}
                />
              </label>
              {page !== "multiplayer" && <><label className="field-label">
                CPU level for your next game
                <select
                  value={defaultDifficulty}
                  onChange={(e) => {
                    setDefaultDifficulty(e.target.value as Difficulty);
                    playGameSound("select");
                  }}
                >
                  <option value="easy">Easy breezy</option>
                  <option value="normal">A little challenge</option>
                  <option value="hard">Think it through</option>
                </select>
              </label>
              <p className="fine-print">
                The current match keeps its CPU level.
              </p></>}
              <Button kind="primary" onClick={() => closeModal()}>
                All set <Check size={18} />
              </Button>
              {page !== "multiplayer" && <button
                className="settings-new text-link"
                onClick={() => setModal("new")}
              >
                Start a new game <RotateCcw size={14} />
              </button>}
            </div>
          )}
          {(modal === "surrender" || modal === "new") && (
            <>
              <p>
                {modal === "new"
                  ? "This will replace your saved match with a new board."
                  : "This match will count as a loss. Your other results will stay saved."}
              </p>
              <div className="modal-buttons">
                <Button onClick={() => closeModal()}>Keep playing</Button>
                <Button
                  kind="primary"
                  onClick={() => {
                    modal === "new"
                      ? game.reset(defaultDifficulty)
                      : game.surrender();
                    closeModal(true);
                  }}
                >
                  {modal === "new" ? "Start new game" : "Surrender"}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function GameView({
  game,
  profile,
  motion,
  onSettings,
  onSurrender,
  onNew,
  onBack,
  onCharacters,
}: {
  game: ReturnType<typeof useGame>;
  profile: Profile;
  motion: boolean;
  onSettings: () => void;
  onSurrender: () => void;
  onNew: () => void;
  onBack: () => void;
  onCharacters: () => void;
}) {
  const { state, score, legalMoves, selected, busy } = game;
  const [animating, setAnimating] = useState(false);
  const humanOutcome: ResultOutcome | undefined = !state.finished
    ? undefined
    : state.surrendered || score.black < score.white
      ? "loss"
      : score.black > score.white
        ? "win"
        : "draw";
  const cpuOutcome =
    humanOutcome === "win"
      ? "loss"
      : humanOutcome === "loss"
        ? "win"
        : humanOutcome;
  const flips = legalMoves.find((m) => m.index === selected)?.flips.length;
  const best = legalMoves.reduce((max, m) => Math.max(max, m.flips.length), 0);
  const title = state.finished
    ? state.surrendered
      ? "See you next round."
      : score.black > score.white
        ? "You’re a natural!"
        : score.black === score.white
          ? "A perfect balance."
          : "A good game, little flipper."
    : state.turn === 1
      ? "Your turn"
      : "A little thinking…";
  const subtitle = state.finished
    ? state.surrendered
      ? "You left the match. Try a fresh board."
      : score.black > score.white
        ? "A little strategy brought a big win."
        : score.black === score.white
          ? "It’s a draw. One more round?"
          : "The CPU wins this round. Your next move awaits."
    : state.turn === 1
      ? "Choose a glowing tile to place your pill."
      : "Your opponent is choosing a move.";
  return (
    <div className="game-page page-enter">
      <div className="page-topline">
        <button className="text-link" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to the garden
        </button>
        <div>
          <span className="mode-tag">
            <span className="status-dot" />
            YOU VS. CPU
          </span>
          <button
            className="text-link muted"
            onClick={onSurrender}
            disabled={state.finished}
          >
            <Flag size={16} />
            Surrender
          </button>
        </div>
      </div>
      <div className="game-layout">
        <section className="board-panel">
          <div className="board-heading">
            <div className="board-heading-title">
              <Sprout />
              <div>
                <h1>Classic Match</h1>
                <p>Small moves. Beautiful possibilities.</p>
              </div>
            </div>
            <span className="level-badge">
              {difficultyLabels[state.difficulty]}
            </span>
          </div>
          <div className="board-with-labels">
            <div className="column-labels">
              {"ABCDEFGH".split("").map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className="row-labels">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <div className="board-slot">
              <Suspense
                fallback={
                  <div className="board-loading">
                    <Sprout />
                    <p>Growing your garden…</p>
                  </div>
                }
              >
                <GameBoard
                  key={state.id}
                  board={state.board}
                  legalMoves={legalMoves.map((m) => m.index)}
                  selected={selected}
                  onSelect={game.setSelected}
                  disabled={
                    state.turn !== 1 || busy || animating || state.finished
                  }
                  onAnimatingChange={setAnimating}
                  styleId={profile.styleId}
                  reducedMotion={motion}
                />
              </Suspense>
            </div>
          </div>
          <div className="board-tip">
            <Lightbulb size={23} />
            <p>
              <strong>
                {state.finished
                  ? "Good game!"
                  : selected !== null
                    ? "Nice choice!"
                    : "Little tip:"}
              </strong>{" "}
              {state.finished
                ? "Every game is a chance to grow."
                : flips
                  ? `This move will flip ${flips} ${flips === 1 ? "pill" : "pills"}. Press Place pill to play.`
                  : `${best > 1 ? `You can flip up to ${best} pills.` : "Corners are keepers. Once yours, they cannot be flipped."}`}
            </p>
            {!state.finished && <span>✦</span>}
          </div>
        </section>
        <aside className="game-sidebar">
          <div
            className={`turn-card ${state.finished ? "finished" : ""}`}
            role="status"
            aria-live="polite"
          >
            <div>
              {state.finished ? (
                <Trophy />
              ) : (
                <span
                  className={`turn-light ${state.turn === 2 ? "thinking" : ""}`}
                />
              )}
              <h2>{title}</h2>
            </div>
            <p>{subtitle}</p>
            {state.passed && !state.finished && (
              <small>
                {state.passed === 1
                  ? "You have no legal moves. The CPU plays again."
                  : "The CPU has no legal moves. You play again."}
              </small>
            )}
          </div>
          <PlayerCard
            key={`black-${state.id}`}
            name={profile.name}
            color="black"
            score={score.black}
            active={state.turn === 1}
            styleId={profile.styleId}
            outcome={humanOutcome}
            reducedMotion={motion}
            you
          />
          <PlayerCard
            key={`white-${state.id}`}
            name="The little thinker"
            color="white"
            score={score.white}
            active={state.turn === 2}
            styleId={profile.styleId}
            outcome={cpuOutcome}
            reducedMotion={motion}
          />
          <div className="match-stats">
            <div>
              <span>
                <Clock3 size={17} />
                Game time
              </span>
              <strong>
                {`${Math.floor(state.elapsed / 60)}`.padStart(2, "0")}:
                {`${state.elapsed % 60}`.padStart(2, "0")}
              </strong>
            </div>
            <div>
              <span>
                <span className="tiny-grid">⠿</span>Empty tiles
              </span>
              <strong>{score.empty}</strong>
            </div>
          </div>
          <div className="game-tools">
            <Button
              onClick={game.undo}
              disabled={!state.history.length || state.finished || animating}
            >
              <RotateCcw size={18} />
              Undo
            </Button>
            <Button onClick={onSettings}>
              <Settings2 size={18} />
              Settings
            </Button>
          </div>
          {state.finished ? (
            <Button kind="primary place-button" onClick={onNew}>
              <Play size={20} fill="currentColor" />
              Play again
            </Button>
          ) : (
            <Button
              kind="primary place-button"
              disabled={
                selected === null || state.turn !== 1 || busy || animating
              }
              onClick={() => selected !== null && game.move(selected)}
            >
              <span className="pill-button-icon">⠿</span>Place pill{" "}
              {selected !== null && (
                <span className="move-coordinate">
                  {"ABCDEFGH"[selected % 8]}
                  {Math.floor(selected / 8) + 1}
                </span>
              )}
            </Button>
          )}
          <button className="change-pal" onClick={onCharacters}>
            <PillAvatar styleId={profile.styleId} size={35} />
            <span>Your style, your game.</span>
            <ChevronRight size={16} />
          </button>
          <p className="autosave">
            <ShieldCheck size={13} />
            Your match is saved automatically.
          </p>
        </aside>
      </div>
    </div>
  );
}
function Characters({
  profile,
  onSelect,
  onPlay,
  reducedMotion,
}: {
  profile: Profile;
  onSelect: (id: string) => void;
  onPlay: () => void;
  reducedMotion: boolean;
}) {
  const [previewColor, setPreviewColor] = useState<"black" | "white">(() =>
    readStored(
      "flip.previewColor",
      "white",
      (value) => value === "black" || value === "white",
    ),
  );
  useEffect(
    () => writeStored("flip.previewColor", previewColor),
    [previewColor],
  );
  const current =
    CHARACTER_STYLES.find((c) => c.id === profile.styleId) ??
    CHARACTER_STYLES[0];
  return (
    <div
      className="characters-page page-enter"
      data-preview-color={previewColor}
    >
      <div className="section-intro">
        <span className="eyebrow">
          <Sparkles size={15} />A LITTLE CHARACTER GOES A LONG WAY
        </span>
        <h1>Find your kind of cute.</h1>
        <p>
          Ten pill pals. All yours. Pick a little personality for your next big
          move.
        </p>
        <fieldset className="pill-color-switch">
          <legend>Preview color</legend>
          <div className="pill-color-options">
            {(["black", "white"] as const).map((color) => (
              <label
                key={color}
                className={`pill-color-option ${previewColor === color ? "is-chosen" : ""}`}
              >
                <input
                  type="radio"
                  name="pill-preview-color"
                  value={color}
                  checked={previewColor === color}
                  onChange={() => {
                    setPreviewColor(color);
                    playGameSound("select");
                  }}
                />
                <PillAvatar color={color} size={31} animated={false} />
                <span>{color === "black" ? "Black pills" : "White pills"}</span>
                <Check
                  size={14}
                  className="pill-color-check"
                  aria-hidden="true"
                />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="characters-layout">
        <div className="character-grid">
          {CHARACTER_STYLES.map((c, i) => (
            <button
              key={c.id}
              className={`character-card ${profile.styleId === c.id ? "selected" : ""}`}
              onClick={() => onSelect(c.id)}
              aria-pressed={profile.styleId === c.id}
              aria-label={`${c.name}, ${previewColor} pill`}
              style={
                {
                  "--pal-color": c.color,
                  "--delay": `${i * 30}ms`,
                } as React.CSSProperties
              }
            >
              <span className="character-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              {profile.styleId === c.id && (
                <span className="selected-check">
                  <Check size={16} />
                </span>
              )}
              <PillAvatar
                styleId={c.id}
                color={previewColor}
                size={94}
                jumping
                reducedMotion={reducedMotion}
              />
              <strong>{c.name}</strong>
              <span>{c.description}</span>
            </button>
          ))}
        </div>
        <aside className="selected-pal">
          <span className="eyebrow">YOUR NEW SIDEKICK</span>
          <button
            type="button"
            className="big-pal"
            aria-label={`Make ${current.name} jump`}
          >
            <Sparkles />
            <PillAvatar
              styleId={current.id}
              color={previewColor}
              size={180}
              jumping
              reducedMotion={reducedMotion}
            />
            <Sparkles />
          </button>
          <h2>{current.name}</h2>
          <p>{current.description}</p>
          <span className="selected-note">
            <Check size={15} />
            Selected and saved
          </span>
          <div className="pal-color-preview">
            <PillAvatar styleId={current.id} color="black" size={46} />
            <PillAvatar styleId={current.id} color="white" size={46} />
            <p>
              Your pal wears black or white
              <br />
              so every move stays clear.
            </p>
          </div>
          <Button kind="primary large" onClick={onPlay}>
            Let’s play <ArrowRight size={18} />
          </Button>
        </aside>
      </div>
      <div className="mobile-play-picked">
        <Button kind="primary" onClick={onPlay}>
          Play with {current.name} <ArrowRight size={17} />
        </Button>
      </div>
      <p className="collection-note">
        <Heart size={15} />
        No coins. No unlocks. Just a whole garden of friends.
      </p>
    </div>
  );
}

function HowTo({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="how-page page-enter">
      <div className="section-intro">
        <span className="eyebrow">
          <BookOpen size={15} />A MINUTE TO LEARN. A LIFETIME TO OUTFLIP.
        </span>
        <h1>A little flip changes everything.</h1>
        <p>Capture more pills than your opponent. That’s the whole idea.</p>
      </div>
      <div className="how-steps">
        {[
          {
            n: "01",
            title: "Pick your spot.",
            body: "You play black and move first. Choose a highlighted tile. It must trap at least one white pill between your new pill and another black pill.",
          },
          {
            n: "02",
            title: "Watch them flip.",
            body: "All trapped pills turn to your color. You can capture in a row, a column, or a diagonal—and in more than one direction at once.",
          },
          {
            n: "03",
            title: "Make every pill count.",
            body: "Take turns with the CPU. If a player has no legal move, their turn passes. When neither player can move, the player with the most pills wins.",
          },
        ].map((s, i) => (
          <section key={s.n} className="how-step">
            <span className="step-number">{s.n}</span>
            <div className={`lesson-board lesson-${i}`}>
              <div className="lesson-row">
                <PillAvatar color="black" size={59} />
                <PillAvatar color={i === 0 ? "white" : "black"} size={59} />
                <PillAvatar color={i === 0 ? "white" : "black"} size={59} />
                {i === 0 ? (
                  <span className="lesson-hint" />
                ) : (
                  <PillAvatar color="black" size={59} />
                )}
              </div>
              {i === 1 && (
                <div className="lesson-stars">✦ &nbsp; ✧ &nbsp; ✦</div>
              )}
              {i === 2 && <Crown className="lesson-crown" />}
            </div>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </div>
      <div className="how-bottom">
        <div>
          <Lightbulb />
          <div>
            <h3>A small tip for a big advantage</h3>
            <p>
              Try to claim the corners. A pill in a corner can never be flipped.
            </p>
          </div>
        </div>
        <Button kind="primary large" onClick={onPlay}>
          <Play size={19} fill="currentColor" />
          I’m ready to flip
        </Button>
      </div>
      <div className="how-access">
        <span>
          <Check />
          Choose a tile, then press Place pill.
        </span>
        <span>
          <Check />
          Use the arrow keys to move across the board.
        </span>
        <span>
          <Check />
          Undo takes back your last turn and the CPU reply.
        </span>
      </div>
    </div>
  );
}

function Leaderboard({
  profile,
  results,
  onPlay,
}: {
  profile: Profile;
  results: MatchResult[];
  onPlay: () => void;
}) {
  const [period, setPeriod] = useState("global");
  const [rows, setRows] = useState<Ranking[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setStatus("loading");
    flushPendingResults()
      .catch(() => {})
      .then(() => getRankings(period))
      .then((r) => {
        if (live) {
          setRows(r);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (live) {
          setRows([]);
          setStatus("offline");
        }
      });
    return () => {
      live = false;
    };
  }, [period, retry]);
  const cutoff =
    period === "weekly"
      ? Date.now() - 7 * 864e5
      : period === "monthly"
        ? Date.now() - 30 * 864e5
        : 0;
  const matches = results.filter((r) => new Date(r.date).getTime() >= cutoff);
  const wins = matches.filter((r) => r.outcome === "win").length;
  const rate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const yourRank = rows.find((row) => row.id === getCurrentPlayerId())?.rank;
  return (
    <div className="leaderboard-page page-enter">
      <div className="leaderboard-layout">
        <div className="leaderboard-main">
          <section className="leaderboard-hero">
            <img
              src="/assets/leaderboard-garden.webp"
              alt="A crowned white pill and a happy black pill on a garden podium"
            />
            <div>
              <span className="eyebrow">THE LEADERBOARD</span>
              <h1>
                Little pills.
                <br />
                Big bragging rights.
              </h1>
              <p>Outthink. Outflip. Outlast.</p>
            </div>
          </section>
          <div
            className="leaderboard-tabs"
            role="tablist"
            aria-label="Ranking period"
          >
            {[
              { id: "global", icon: Globe2, label: "All time" },
              { id: "weekly", icon: Clock3, label: "This week" },
              { id: "monthly", icon: Medal, label: "This month" },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={period === t.id}
                className={period === t.id ? "active" : ""}
                onClick={() => {
                  if (period === t.id) return;
                  setPeriod(t.id);
                  playGameSound("select");
                }}
              >
                <t.icon size={20} />
                {t.label}
              </button>
            ))}
          </div>
          <section className="ranking-table-panel">
            <div className="ranking-caption">
              <span>
                <Globe2 size={16} />
                Global practice rankings
              </span>
              <span className="live-label">
                <span
                  className={`status-dot ${status === "offline" ? "offline" : ""}`}
                />
                {status === "loading"
                  ? "Connecting"
                  : status === "ready"
                    ? "Connected"
                    : "Offline"}
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>PLAYER</th>
                    <th>POINTS</th>
                    <th>WINS</th>
                    <th>GAMES</th>
                    <th>WIN RATE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={i < 3 ? `top-${i + 1}` : ""}>
                      <td>
                        <span className={`rank-number rank-${i + 1}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td>
                        <div className="ranking-player">
                          <PillAvatar styleId={r.styleId} size={43} />
                          <div>
                            <strong>
                              {r.name}
                              {i === 0 && <Crown size={15} />}
                            </strong>
                            <small>
                              {i === 0
                                ? "The top of the garden"
                                : "One clever move at a time"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{r.rating.toLocaleString()}</td>
                      <td>{r.wins}</td>
                      <td>{r.games}</td>
                      <td className="win-rate">
                        {r.games ? Math.round((r.wins / r.games) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <div className="ranking-empty">
                <div className="empty-pals">
                  <PillAvatar color="black" size={69} />
                  <Trophy />
                  <PillAvatar color="white" size={69} />
                </div>
                <h2>
                  {status === "loading"
                    ? "Finding the flippers…"
                    : status === "offline"
                      ? "The garden is a little quiet."
                      : "The first spot could be yours."}
                </h2>
                <p>
                  {status === "offline"
                    ? "The shared leaderboard is unavailable. You can still play, and your results stay on this device."
                    : "Complete a match against the CPU to join the practice rankings. A win earns 30 points; a draw earns 10."}
                </p>
                <Button
                  kind="primary"
                  onClick={
                    status === "offline" ? () => setRetry((r) => r + 1) : onPlay
                  }
                >
                  {status === "offline" ? "Try again" : "Play your first match"}
                  <ArrowRight size={17} />
                </Button>
              </div>
            )}
            <div className="ranking-footnote">
              <ShieldCheck size={14} />
              CPU practice results. Friendly matches are unranked.
            </div>
          </section>
        </div>
        <aside className="leaderboard-sidebar">
          <section className="your-rank-card">
            <h2>{yourRank ? "Your rank" : "Your little progress"}</h2>
            <div className="your-rank-main">
              <PillAvatar styleId={profile.styleId} size={89} />
              <div>
                <strong>
                  {yourRank
                    ? `#${yourRank}`
                    : wins
                      ? `${wins} ${wins === 1 ? "win" : "wins"}`
                      : "Your story"}
                </strong>
                <p>
                  {yourRank
                    ? "One good move at a time."
                    : wins
                      ? "One good move at a time."
                      : "Starts with a single flip."}
                </p>
              </div>
            </div>
            <div className="your-stats">
              <div>
                <strong>
                  {wins * 30 +
                    matches.filter((r) => r.outcome === "draw").length * 10}
                </strong>
                <span>Points</span>
              </div>
              <div>
                <strong>{wins}</strong>
                <span>Wins</span>
              </div>
              <div>
                <strong>{matches.length}</strong>
                <span>Games</span>
              </div>
              <div>
                <strong>{rate}%</strong>
                <span>Win rate</span>
              </div>
            </div>
            <small>
              Saved on this device ·{" "}
              {period === "global"
                ? "all time"
                : period === "weekly"
                  ? "last 7 days"
                  : "last 30 days"}
            </small>
          </section>
          <div className="leaf-quote">
            <p>
              “Every game is a chance
              <br />
              to flip the odds.”
            </p>
            <Sprout />
          </div>
          <section className="ranking-explainer">
            <span className="feature-symbol gold">
              <Trophy />
            </span>
            <h2>Small steps to the top.</h2>
            <p>Play a match. Find a new trick. Come back for one more.</p>
            <div>
              <span>A win</span>
              <strong>+30 points</strong>
            </div>
            <div>
              <span>A draw</span>
              <strong>+10 points</strong>
            </div>
            <div>
              <span>A loss</span>
              <strong>A little wiser</strong>
            </div>
            <Button kind="primary" onClick={onPlay}>
              Make your next move <ArrowRight size={17} />
            </Button>
          </section>
          <p className="future-note">
            <Users size={18} />
            Invite a friend from the Friends page.
            <br />
            Share a room and play together.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={22} />
        </button>
        <Sprout className="modal-sprout" />
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
function ProfileForm({
  profile,
  onSave,
  onCharacters,
}: {
  profile: Profile;
  onSave: (name: string) => void;
  onCharacters: () => void;
}) {
  const [name, setName] = useState(profile.name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <p>This is your space. What should we call you?</p>
      <label className="field-label">
        Your name
        <input
          autoFocus
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Little Flipper"
        />
      </label>
      <p className="fine-print">
        Your profile is saved on this device. No account is needed.
      </p>
      <div className="modal-buttons">
        <button type="button" className="button" onClick={onCharacters}>
          <Sparkles size={17} />
          Change pill pal
        </button>
        <button type="submit" className="button primary">
          Save name <Check size={17} />
        </button>
      </div>
    </form>
  );
}
