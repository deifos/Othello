import type { ReactNode } from "react";
import PillAvatar from "./PillAvatar";

export type InformationPage =
  "about" | "privacy" | "terms" | "multiplayer";

export default function SiteFooter({
  logo,
  onHome,
  onInformation,
}: {
  logo: ReactNode;
  onHome: () => void;
  onInformation: (page: InformationPage) => void;
}) {
  return (
    <footer className="site-footer landing-footer">
      <div className="footer-brand">
        <button
          className="logo-button"
          onClick={onHome}
          aria-label="Back to home"
        >
          {logo}
        </button>
        <a
          className="footer-x-link"
          href="https://x.com/deifosv"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Vlad on X"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M4 3h5l11 18h-5L4 3Zm16 0L4 21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </a>
        <a
          className="footer-x-link"
          href="https://www.linkedin.com/in/vlachomir/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Vlad on LinkedIn"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.75H4.98V9.2h2.95v9.55ZM6.45 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42Zm12.3 10.85H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.74 1.36-1.53 2.79-1.53 2.99 0 3.54 1.97 3.54 4.53v5.25Z" />
          </svg>
        </a>
        <a
          className="footer-x-link"
          href="https://github.com/deifos/Othello"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Flip Buddies source code on GitHub"
        >
          <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
      </div>
      <a className="footer-creator" href="https://x.com/deifosv" target="_blank" rel="noopener noreferrer">
        <img src="/assets/vlad-pfp.jpg" alt="" width="32" height="32" loading="lazy" />
        <span>Built by <strong>Vlad</strong></span>
      </a>
      <nav className="footer-links" aria-label="Site information">
        <button onClick={() => onInformation("privacy")}>Privacy Policy</button>
        <button onClick={() => onInformation("terms")}>Terms of Service</button>
      </nav>
    </footer>
  );
}

export const informationTitles: Record<InformationPage, string> = {
  about: "A simple game. Not an easy one.",
  privacy: "Your privacy",
  terms: "About this preview",
  multiplayer: "A place for you and a friend.",
};

export function InformationContent({
  page,
  onPlay,
}: {
  page: InformationPage;
  onPlay: () => void;
}) {
  const content: Record<InformationPage, ReactNode> = {
    about: (
      <>
        <p>
          Flip Buddies is a cozy take on Othello. Trap a line of your
          opponent’s pills to flip them. The player with the most pills at the
          end wins.
        </p>
        <p>
          Play against three CPU levels or invite a friend. Choose from ten pill
          pals and build your skills one move at a time.
        </p>
        <div className="about-love-note">
          <div className="about-kiss" aria-hidden="true">
            <PillAvatar
              color="black"
              size={68}
              expression="wink"
              animated={false}
              className="about-kiss-pill"
            />
            <span className="about-kiss-heart">♥</span>
          </div>
          <div>
            <p>
              This game was built for my wife, who loves a good competition
              and is a big fan of Othello.
            </p>
            <p className="about-signature">With love, Vlad.</p>
          </div>
        </div>
      </>
    ),
    multiplayer: (
      <>
        <p>
          Choose Friends to create a room or join with an invite link. Both
          players choose Ready before the match starts. You can also practice
          against the CPU.
        </p>
        <button className="button primary" onClick={onPlay}>
          Play against the CPU
        </button>
      </>
    ),
    privacy: (
      <>
        <p>
          This website uses Google Analytics to measure visits and website use.
          Google Analytics can use cookies and browser identifiers for these measurements.
        </p>
        <p>
          Your browser saves your profile, settings, current match, and match
          history on this device.
        </p>
        <p>
          Completed matches are sent to the configured leaderboard service with
          your player name, pill style, and moves. A device token identifies
          your entries. Your name and match statistics can appear in the
          rankings.
        </p>
        <p>
          In a friend match, your friend sees your name and pill style. The
          online game service saves the room and its moves so you can reconnect.
          Your private seat key stays in your browser and is not part of an invite.
        </p>
        <p>
          No email or sign-in is needed. You can remove local data through your
          browser’s site settings. This does not remove results already sent to
          the leaderboard.
        </p>
      </>
    ),
    terms: (
      <>
        <p>
          Flip Buddies includes CPU practice and online friend matches. All ten
          pill styles are free to use. Purchases are not available in this version.
        </p>
        <p>
          Practice rankings are based on completed CPU matches. Friend matches
          do not change these rankings. Use a respectful
          player name. Browser data can be lost if you clear site storage.
        </p>
      </>
    ),
  };
  return <div className="information-content">{content[page]}</div>;
}
