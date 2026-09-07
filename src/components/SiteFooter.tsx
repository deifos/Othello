import { Instagram, Music2, Youtube } from "lucide-react";
import type { ReactNode } from "react";
import PillAvatar from "./PillAvatar";

export type InformationPage =
  "about" | "privacy" | "terms" | "contact" | "community" | "multiplayer";

function DiscordMark() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19.7 5.2a18 18 0 0 0-4.4-1.4l-.6 1.2a16.6 16.6 0 0 0-5.4 0l-.6-1.2a18 18 0 0 0-4.4 1.4C1.5 9.3.7 13.3 1.1 17.2a18 18 0 0 0 5.5 2.7l1.1-1.8-1.7-.8.4-.3c3.7 1.7 7.5 1.7 11.2 0l.4.3-1.7.8 1.1 1.8a18 18 0 0 0 5.5-2.7c.5-4.5-.9-8.5-3.2-12ZM8 14.8c-1 0-1.8-1-1.8-2.1s.8-2.1 1.8-2.1 1.8 1 1.8 2.1S9 14.8 8 14.8Zm8 0c-1 0-1.8-1-1.8-2.1s.8-2.1 1.8-2.1 1.8 1 1.8 2.1S17 14.8 16 14.8Z" />
    </svg>
  );
}

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
      <button
        className="logo-button"
        onClick={onHome}
        aria-label="Back to home"
      >
        {logo}
      </button>
      <div className="footer-creator">
        <span>Built by</span>
        <a
          href="https://x.com/deifosv"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Vlad on X"
        >
          <img src="/assets/vlad-pfp.jpg" alt="Vlad" width="24" height="24" />
          Vlad
        </a>
      </div>
      <nav className="footer-socials" aria-label="Community channels">
        <button
          aria-label="Discord community information"
          onClick={() => onInformation("community")}
        >
          <DiscordMark />
        </button>
        <button
          aria-label="X community information"
          onClick={() => onInformation("community")}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M4 3h5l11 18h-5L4 3Zm16 0L4 21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>
        <button
          aria-label="Instagram community information"
          onClick={() => onInformation("community")}
        >
          <Instagram size={23} />
        </button>
        <button
          aria-label="YouTube community information"
          onClick={() => onInformation("community")}
        >
          <Youtube size={24} />
        </button>
        <button
          aria-label="TikTok community information"
          onClick={() => onInformation("community")}
        >
          <Music2 size={23} />
        </button>
      </nav>
      <nav className="footer-links" aria-label="Site information">
        <button onClick={() => onInformation("privacy")}>Privacy Policy</button>
        <button onClick={() => onInformation("terms")}>Terms of Service</button>
        <button onClick={() => onInformation("contact")}>Contact</button>
      </nav>
    </footer>
  );
}

export const informationTitles: Record<InformationPage, string> = {
  about: "Small pieces. Big personality.",
  privacy: "Your privacy",
  terms: "About this preview",
  contact: "Keep in touch",
  community: "A little community is growing.",
  multiplayer: "Friends are next.",
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
          Play against three CPU levels, choose from ten pill pals, and build
          your skills one move at a time.
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
          Play with friends is coming in the next phase. For now, your opponent
          is the CPU. Choose a pill pal and try one of three skill levels.
        </p>
        <button className="button primary" onClick={onPlay}>
          Play against the CPU
        </button>
      </>
    ),
    community: (
      <>
        <p>
          Our community channels are not open yet. This is where you will find
          them when they are ready.
        </p>
        <p>For now, meet the pill pals and enjoy a game against the CPU.</p>
      </>
    ),
    privacy: (
      <>
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
          No email or sign-in is needed. You can remove local data through your
          browser’s site settings. This does not remove results already sent to
          the leaderboard.
        </p>
      </>
    ),
    terms: (
      <>
        <p>
          This is the local CPU-play preview of Flip Buddies. All ten pill
          styles are free to use. Online multiplayer and purchases are not
          available in this version.
        </p>
        <p>
          Practice rankings are based on completed CPU matches. Use a respectful
          player name. Browser data can be lost if you clear site storage.
        </p>
      </>
    ),
    contact: (
      <>
        <p>A public support address has not been added to this preview yet.</p>
        <p>
          To report a problem, share the page name, your device, and the steps
          that caused it with the person who gave you this preview.
        </p>
      </>
    ),
  };
  return <div className="information-content">{content[page]}</div>;
}
