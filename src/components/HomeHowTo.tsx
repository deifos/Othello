import { useId } from "react";
import { ArrowRight } from "lucide-react";
import PillAvatar from "./PillAvatar";
import "./HomeHowTo.css";

type HomeHowToProps = {
  onLearn: () => void;
  reducedMotion: boolean;
};

function GardenMascot({ reducedMotion }: { reducedMotion: boolean }) {
  const id = useId().replace(/:/g, "");
  const flowers = [
    [38, 182, 0.85],
    [73, 201, 1],
    [260, 184, 0.75],
    [237, 210, 1.1],
    [17, 211, 0.7],
    [109, 212, 0.55],
  ];

  return (
    <div className="home-lesson-garden" aria-hidden="true">
      <svg viewBox="0 0 300 230" className="home-lesson-landscape">
        <defs>
          <linearGradient id={`${id}-grass`} x2="0" y2="1">
            <stop stopColor="#d0de8d" />
            <stop offset="1" stopColor="#a4ba5d" />
          </linearGradient>
          <linearGradient id={`${id}-bush`} x2="1" y2="1">
            <stop stopColor="#bdd585" />
            <stop offset="1" stopColor="#84a44e" />
          </linearGradient>
          <linearGradient id={`${id}-wood`} x2="1" y2="1">
            <stop stopColor="#bb9b68" />
            <stop offset="1" stopColor="#8f744b" />
          </linearGradient>
          <radialGradient id={`${id}-fur`} cx="35%" cy="25%" r="80%">
            <stop stopColor="#f2d7b1" />
            <stop offset="1" stopColor="#c99e70" />
          </radialGradient>
        </defs>
        <g fill="#fffdf6" opacity=".96">
          <path d="M13 44c-8-7-4-19 7-19 3-15 24-14 28 0 13-2 18 15 7 20Z" />
          <path d="M239 39c-11-2-10-16 0-19-1-15 21-22 28-7 15-7 28 14 13 22Z" />
        </g>
        <g fill={`url(#${id}-bush)`}>
          <ellipse
            cx="43"
            cy="160"
            rx="23"
            ry="49"
            transform="rotate(-27 43 160)"
          />
          <ellipse
            cx="61"
            cy="150"
            rx="19"
            ry="40"
            transform="rotate(19 61 150)"
          />
          <ellipse
            cx="268"
            cy="153"
            rx="22"
            ry="47"
            transform="rotate(19 268 153)"
          />
          <ellipse
            cx="241"
            cy="174"
            rx="22"
            ry="35"
            transform="rotate(-27 241 174)"
          />
        </g>
        <ellipse
          cx="156"
          cy="211"
          rx="147"
          ry="29"
          fill={`url(#${id}-grass)`}
        />
        <g fill="#c4d384">
          <circle cx="29" cy="190" r="18" />
          <circle cx="79" cy="184" r="20" />
          <circle cx="259" cy="192" r="23" />
        </g>
        <ellipse
          cx="164"
          cy="204"
          rx="59"
          ry="13"
          fill="#69823f"
          opacity=".22"
        />
        <path d="M120 168l-5 32q48 22 95-1l-6-33Z" fill={`url(#${id}-wood)`} />
        <path
          d="M130 179l-2 22m20-18v20m36-19l2 18m12-23 3 18"
          stroke="#795f3e"
          strokeWidth="3"
          opacity=".38"
          strokeLinecap="round"
        />
        <ellipse cx="162" cy="169" rx="44" ry="13" fill="#d9bc87" />
        <ellipse
          cx="162"
          cy="169"
          rx="32"
          ry="8"
          fill="none"
          stroke="#bc9c69"
          strokeWidth="2"
        />
        <ellipse cx="162" cy="144" rx="39" ry="34" fill={`url(#${id}-fur)`} />
        <ellipse cx="163" cy="147" rx="26" ry="24" fill="#f7e8ce" />
        <ellipse
          cx="133"
          cy="165"
          rx="18"
          ry="11"
          fill="#dcb78b"
          transform="rotate(-13 133 165)"
        />
        <ellipse
          cx="191"
          cy="165"
          rx="18"
          ry="11"
          fill="#dcb78b"
          transform="rotate(13 191 165)"
        />
        <ellipse
          cx="125"
          cy="139"
          rx="12"
          ry="19"
          fill={`url(#${id}-fur)`}
          transform="rotate(-24 125 139)"
        />
        <ellipse
          cx="202"
          cy="139"
          rx="12"
          ry="19"
          fill={`url(#${id}-fur)`}
          transform="rotate(24 202 139)"
        />
        <path
          d="M155 119c-17-14-31-5-29 7 12 9 24 3 31-3-5 15-3 24 5 23 7-7 7-17 1-24 13 11 26 12 33 1-6-14-21-13-33-3Z"
          fill="#789e49"
        />
        <circle cx="161" cy="122" r="6" fill="#99b95d" />
        <g fill="#d5e0a1">
          <ellipse
            cx="48"
            cy="169"
            rx="5"
            ry="12"
            transform="rotate(-28 48 169)"
          />
          <ellipse
            cx="57"
            cy="171"
            rx="5"
            ry="12"
            transform="rotate(29 57 171)"
          />
          <ellipse
            cx="256"
            cy="171"
            rx="5"
            ry="11"
            transform="rotate(-22 256 171)"
          />
          <ellipse
            cx="265"
            cy="172"
            rx="5"
            ry="10"
            transform="rotate(28 265 172)"
          />
        </g>
        {flowers.map(([x, y, scale], index) => (
          <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}>
            <g fill={index % 2 ? "#fff4ce" : "#f4d6ae"}>
              <ellipse cy="-6" rx="4" ry="6" />
              <ellipse cy="6" rx="4" ry="6" />
              <ellipse cx="-6" rx="6" ry="4" />
              <ellipse cx="6" rx="6" ry="4" />
            </g>
            <circle r="3.5" fill="#e8ba60" />
          </g>
        ))}
        <g transform="translate(272 208)">
          <ellipse cy="1" rx="15" ry="14" fill="#f6dd83" />
          <path d="M-4-13q5-13 8-1" fill="#f6dd83" />
          <circle cx="-5" cy="-1" r="1.6" fill="#686047" />
          <circle cx="5" cy="-1" r="1.6" fill="#686047" />
          <path d="M-2 4 0 6 2 4" fill="#d89c54" />
        </g>
      </svg>
      <PillAvatar
        styleId="bear"
        size={142}
        animated
        reducedMotion={reducedMotion}
        className="home-lesson-bear"
      />
      <svg viewBox="0 0 300 230" className="home-lesson-leaf">
        <path d="M144 31c-19 4-21-8-18-16 17-2 22 6 18 16Z" fill="#80a84f" />
        <path
          d="m130 19 13 12"
          stroke="#668e3d"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function HomeHowTo({ onLearn, reducedMotion }: HomeHowToProps) {
  return (
    <section className="home-lesson" aria-labelledby="home-lesson-title">
      <div className="home-lesson-copy">
        <h2 id="home-lesson-title">
          <button onClick={onLearn}>How to Play</button>
        </h2>
        <p>
          Trap their pills between two of yours. They flip to your color. Most
          pills at the end wins!
        </p>
        <div
          className="home-lesson-stages"
          role="img"
          aria-label="Place a black pill beside two white pills, with a black pill at the other end. Both white pills flip to black. Finish with the most pills to win."
        >
          {["Your move", "They flip!", "You win!"].map((label, step) => (
            <div className="home-lesson-stage-pair" key={label}>
              {step > 0 && <ArrowRight className="home-lesson-arrow" />}
              <div className={`home-lesson-stage home-lesson-stage-${step}`}>
                <div className="home-lesson-pills">
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={`home-lesson-pill ${step === 0 && (index === 1 || index === 2) ? "is-white" : "is-black"} ${step === 0 && index === 3 ? "is-new" : ""} ${step === 1 && (index === 1 || index === 2) ? "is-flipped" : ""}`}
                    />
                  ))}
                </div>
                <span className="home-lesson-label">{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <GardenMascot reducedMotion={reducedMotion} />
    </section>
  );
}
