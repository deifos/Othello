/** Shared face drawings keep the SVG avatars and the Three.js pills in sync. */
export const EXPRESSIONS = [
  "happy",
  "smile",
  "grin",
  "wink",
  "curious",
  "surprised",
  "sad",
  "sleepy",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export const BLINK_PHASES = ["open", "half", "closed"] as const;
export type BlinkPhase = (typeof BLINK_PHASES)[number];
export interface FaceFeature {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export function ellipsePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

/** Coordinates use the avatar's 100 × 100 view box. Cheeks and accessories are separate. */
export function getFaceFeatures(
  expression: Expression,
  blink: BlinkPhase = "open",
  dark = false,
): readonly FaceFeature[] {
  const features: FaceFeature[] = [];
  const ink = "#34352c";
  const line = dark ? "#d7d1b7" : ink;
  const path = (d: string, stroke = line, strokeWidth = 2.1) =>
    features.push({ d, stroke, strokeWidth, fill: "none" });
  const fill = (d: string, color = ink) => features.push({ d, fill: color });

  for (const [side, x] of [
    [-1, 35],
    [1, 65],
  ]) {
    const closed =
      blink === "closed" ||
      expression === "grin" ||
      (expression === "wink" && side === 1);
    if (closed) {
      path(
        expression === "grin"
          ? `M${x - 4.5} 54Q${x} 46 ${x + 4.5} 54`
          : `M${x - 4.5} 53Q${x} 57 ${x + 4.5} 53`,
      );
    } else if (expression === "sleepy") {
      path(`M${x - 4.5} 53Q${x} 56 ${x + 4.5} 53`);
    } else {
      const height =
        blink === "half"
          ? 2.1
          : expression === "surprised"
            ? 6.4
            : expression === "sad"
              ? 4.5
              : 5.7;
      const look = expression === "curious" ? 1.5 : 0;
      fill(ellipsePath(x + look, 53, 4.2, height));
      if (blink === "open")
        fill(ellipsePath(x + look + 1, 51, 1.55, 1.95), "#fffdf0");
    }
  }
  if (expression === "sad") {
    path("M29 46Q35 45 39 41", line, 1.8);
    path("M61 41Q65 45 71 46", line, 1.8);
    path("M43 72Q50 64 57 72", dark ? "#eee4cc" : "#65503c", 2.6);
  } else if (expression === "surprised") {
    path("M30 42Q35 39 40 42", line, 1.5);
    path("M60 42Q65 39 70 42", line, 1.5);
    fill(ellipsePath(50, 68, 4.5, 5.5), "#49372d");
    fill(ellipsePath(51, 71, 2.5, 1.5), "#ec9b83");
  } else if (expression === "curious") {
    path("M60 42Q65 39 70 42", line, 1.7);
    path("M45 67Q50 70 55 66", dark ? "#ecdbc2" : "#69513c", 2.4);
  } else if (expression === "smile" || expression === "sleepy") {
    path(
      expression === "sleepy" ? "M46 67Q50 69 54 67" : "M42 64Q50 74 58 64",
      dark ? "#f1ddbf" : "#604532",
      2.5,
    );
  } else {
    fill(
      expression === "grin"
        ? "M39 61Q50 67 61 61Q59 77 50 77Q41 77 39 61Z"
        : "M42 62Q50 66 58 62Q57 73 50 73Q43 73 42 62Z",
      "#48382c",
    );
    fill(
      expression === "grin"
        ? "M43 73Q50 66 57 73Q50 78 43 73Z"
        : "M45 69Q50 65 55 69Q53 72 50 72Q47 72 45 69Z",
      "#e89179",
    );
  }
  return features;
}
