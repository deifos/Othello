import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import * as THREE from "three";
import { playGameSound } from "../lib/gameAudio";
import { getCharacterStyle } from "../styles/characters";
import FallbackPill from "./FallbackPill";
import type { FallbackPillChange, FallbackPillHandle } from "./FallbackPill";
import { createBoardCelebration } from "../animation/boardCelebration";
import { createFlippocalypse } from "../animation/flippocalypse";
import { FLIPPOCALYPSE_MS, enhancedCaptureDelay, isFlippocalypseMove, sampleFlippocalypsePose } from "../animation/flippocalypseMotion";
import "./GameBoard.css";
import {
  captureDelay,
  FLIP_MS,
  moveSettleMs,
  PLACEMENT_MS,
  sampleMovePose,
} from "../animation/moveMotion";
import { createFaceAtlas } from "./faceAtlas";
import {
  advanceExpression,
  createExpressionState,
  reactExpression,
} from "../animation/expressions";
import type { ExpressionState } from "../animation/expressions";
import type { Expression } from "../styles/expressions";

export type GameBoardProps = {
  board: number[];
  legalMoves: number[];
  selected: number | null;
  onSelect: (index: number) => void;
  disabled?: boolean;
  styleId: string;
  styleIds?: Partial<Record<1 | 2, string>>;
  reducedMotion?: boolean;
  preview?: boolean;
  onAnimatingChange?: (animating: boolean) => void;
  mode?: "classic" | "enhanced";
  effects?: { shield?: { index: number; owner: 1 | 2 } | null; corner?: { index: number; owner: 1 | 2 } | null } | { ability: "shield" | "corner"; index: number; owner: 1 | 2 }[];
  targetMode?: "shield" | "corner" | null;
  targetIndices?: number[];
};

type Pill = {
  group: THREE.Group;
  body: THREE.Mesh;
  shadow: THREE.Mesh;
  face: THREE.Mesh;
  backFace: THREE.Mesh;
  frontAccessories: THREE.Group;
  backAccessories: THREE.Group;
  accessories: Record<1 | 2, THREE.Group>;
  pandas: Record<1 | 2, boolean>;
  expression: ExpressionState;
  faceKey: string;
  value: number;
  color: number;
  materials: THREE.Material[];
  fierceBrows: THREE.Group;
};
type Motion = {
  index: number;
  start: number;
  duration: number;
  from: number;
  to: number;
  placing: boolean;
};
type BoardScene = {
  sync: (props: GameBoardProps, first?: boolean) => void;
  hover: (index: number | null) => void;
  hop: (index: number) => void;
  dispose: () => void;
};

const BODY_RADIUS = 0.369;
const BODY_HEIGHT = 0.285;
const PIECE_Y = BODY_HEIGHT + 0.108;
const BODY_ROUGHNESS = 0.4;
const BLACK = "#42463d";
const WHITE = "#fffaf0";
const pieceColors = [new THREE.Color(BLACK), new THREE.Color(WHITE)];
const TILE_COLORS = ["#779852", "#75964f", "#789853", "#7b9b56"];
const FIRE_CURLS = [
  "M18 77C-1 50 20 13 49 13C81 13 98 43 81 64C70 79 50 69 58 53",
  "M77 85C102 64 87 28 62 20C37 12 13 29 20 50C25 64 42 68 47 56",
  "M12 39C22 6 65 1 87 29C109 62 69 96 46 80C31 69 38 56 50 60",
];
const cellName = (index: number) =>
  `${String.fromCharCode(65 + (index % 8))}${Math.floor(index / 8) + 1}`;
const isDark = (value: number) => value === 1;
const bodyGlow = (value: number) => isDark(value) ? 0.08 : 0.025;
const playerStyleId = (props: GameBoardProps, value: number) =>
  getCharacterStyle(props.styleIds?.[value === 1 ? 1 : 2] ?? props.styleId).id;

function tileGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const h = 0.477;
  const r = 0.065;
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h);
  shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r);
  shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h);
  shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r);
  shape.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSize: 0.017,
    bevelThickness: 0.018,
    bevelSegments: 2,
    curveSegments: 4,
    steps: 1,
  });
}

function pointedEarGeometries() {
  // Match the left ear paths in PillAvatar. Mirroring the mesh makes the right
  // ear; the shared geometry stays behind the curved head at its lower edge.
  const x = (value: number) => (value - 50) * BODY_RADIUS / 39;
  const y = (value: number) => (53.5 - value) * BODY_RADIUS / 38.5;
  const outer = new THREE.Shape();
  outer.moveTo(x(18), y(38));
  outer.quadraticCurveTo(x(11), y(5), x(36), y(24));
  outer.closePath();
  const inner = new THREE.Shape();
  inner.moveTo(x(20), y(29));
  inner.lineTo(x(20), y(18));
  inner.lineTo(x(30), y(25));
  inner.closePath();
  return {
    outer: new THREE.ExtrudeGeometry(outer, {
      depth: 0.028,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 3,
      curveSegments: 12,
      steps: 1,
    }),
    inner: new THREE.ShapeGeometry(inner),
  };
}

function makeBoardScene(
  host: HTMLDivElement,
  onFailure: () => void,
): BoardScene {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(
    Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 1.75),
  );
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.domElement.style.cssText =
    "display:block;width:100%;height:100%;pointer-events:none;";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -4.035,
    4.035,
    4.035,
    -4.035,
    0.1,
    30,
  );
  camera.position.set(0, 14, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight("#fffdf5", "#485b3b", 0.95));
  const sunlight = new THREE.DirectionalLight("#fff8ef", 1.35);
  sunlight.position.set(-4, 9, -5);
  scene.add(sunlight);
  const rim = new THREE.DirectionalLight("#f5f8e7", 0.3);
  rim.position.set(4, 5, 3);
  scene.add(rim);

  const sphereGeometry = new THREE.SphereGeometry(1, 40, 28);
  const smallSphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  const tileGeo = tileGeometry();
  const torusGeo = new THREE.TorusGeometry(0.277, 0.017, 6, 40);
  const smallTorusGeo = new THREE.TorusGeometry(0.141, 0.012, 6, 32);
  const coneGeo = new THREE.ConeGeometry(1, 1, 3);
  const pointedEars = pointedEarGeometries();
  const permanentMaterials: THREE.Material[] = [];
  const material = (
    color: string,
    options: Partial<THREE.MeshStandardMaterialParameters> = {},
  ) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.64,
      metalness: 0,
      ...options,
    });
    permanentMaterials.push(mat);
    return mat;
  };
  const baseMaterial = material("#638146");
  const baseGeo = new THREE.BoxGeometry(8.07, 0.12, 8.07);
  const base = new THREE.Mesh(baseGeo, baseMaterial);
  base.position.y = -0.055;
  base.receiveShadow = true;
  scene.add(base);
  const tileMaterials = Array.from({ length: 64 }, (_, index) =>
    material(TILE_COLORS[(Math.floor(index / 8) * 3 + (index % 8)) % 4]),
  );
  for (let index = 0; index < 64; index++) {
    const mesh = new THREE.Mesh(tileGeo, tileMaterials[index]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((index % 8) - 3.5, 0, Math.floor(index / 8) - 3.5);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: "#b9e776",
    toneMapped: false,
  });
  const markerRingMaterial = new THREE.MeshBasicMaterial({
    color: "#638c35",
    toneMapped: false,
  });
  const selectedMaterial = new THREE.MeshBasicMaterial({
    color: "#e8ffc0",
    toneMapped: false,
  });
  permanentMaterials.push(markerMaterial, markerRingMaterial, selectedMaterial);
  const markers = Array.from({ length: 64 }, (_, index) => {
    const group = new THREE.Group();
    const dot = new THREE.Mesh(smallSphereGeometry, markerMaterial);
    dot.scale.set(0.143, 0.022, 0.143);
    dot.position.y = 0.118;
    const ring = new THREE.Mesh(smallTorusGeo, markerRingMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.124;
    group.add(dot, ring);
    group.position.set((index % 8) - 3.5, 0, Math.floor(index / 8) - 3.5);
    group.visible = false;
    scene.add(group);
    return group;
  });
  const selectedRing = new THREE.Mesh(torusGeo, selectedMaterial);
  selectedRing.rotation.x = Math.PI / 2;
  selectedRing.position.y = 0.14;
  selectedRing.visible = false;
  scene.add(selectedRing);
  const celebration = createBoardCelebration(scene);
  const flippocalypse = createFlippocalypse(scene);
  // Soft ground contact is stable at every screen size and needs no shadow pass.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d")!;
  const shadowGradient = shadowContext.createRadialGradient(
    64,
    64,
    20,
    64,
    64,
    62,
  );
  shadowGradient.addColorStop(0, "rgba(30,44,20,0.46)");
  shadowGradient.addColorStop(0.42, "rgba(30,44,20,0.28)");
  shadowGradient.addColorStop(0.76, "rgba(30,44,20,0.075)");
  shadowGradient.addColorStop(1, "rgba(30,44,20,0)");
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const shadowGeometry = new THREE.PlaneGeometry(1.03, 1.03);
  permanentMaterials.push(shadowMaterial);
  // One curved face mesh replaces separate eye, cheek, and mouth draw calls.
  // Its surface follows the pill, so the face still rotates with the 3D body.
  const faceGeometry = new THREE.PlaneGeometry(0.62, 0.48, 14, 12);
  const positions = faceGeometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = -positions.getY(index);
    positions.setXYZ(
      index,
      x,
      BODY_HEIGHT * Math.sqrt(Math.max(0, 1 - (x / BODY_RADIUS) ** 2 - (z / BODY_RADIUS) ** 2)) +
        0.008,
      z,
    );
  }
  faceGeometry.computeVertexNormals();
  const faces = createFaceAtlas(faceGeometry);
  const pills = new Map<number, Pill>();
  let motions: Motion[] = [];
  const hops = new Map<number, number>();
  let raf = 0;
  let stopped = false;
  let hovered: number | null = null;
  let currentStyle = "";
  let currentProps: GameBoardProps | null = null;
  let expressionTimer: ReturnType<typeof setTimeout> | undefined;
  let visible = true;
  let fury: { start: number; placedAt: number; captures: number[] } | null = null;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sceneSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  const motionReduced = () =>
    !!currentProps?.reducedMotion || motionQuery.matches;
  const paused = () => document.hidden || !visible;

  function makePill(
    value: number,
    styleIds: Record<1 | 2, string>,
    index: number,
  ): Pill {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    const makeMaterial = (color: string, roughness = 0.5) => {
      const result = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
      });
      materials.push(result);
      return result;
    };
    const bodyMaterial = makeMaterial(isDark(value) ? BLACK : WHITE, BODY_ROUGHNESS);
    bodyMaterial.emissive.set(isDark(value) ? BLACK : WHITE);
    bodyMaterial.emissiveIntensity = bodyGlow(value);
    const body = new THREE.Mesh(sphereGeometry, bodyMaterial);
    body.scale.set(BODY_RADIUS, BODY_HEIGHT, BODY_RADIUS);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.101;
    const expression = createExpressionState(
      sceneSeed ^ Math.imul(index + 1, 2654435761),
      performance.now(),
    );
    const pandas = {
      1: getCharacterStyle(styleIds[1]).accessory === "panda",
      2: getCharacterStyle(styleIds[2]).accessory === "panda",
    };
    const panda = pandas[value === 1 ? 1 : 2];
    const face = new THREE.Mesh(
      faces.geometry("happy", "open", panda, isDark(value)),
      faces.material,
    );
    group.add(face);
    const backFace = new THREE.Mesh(face.geometry, faces.material);
    backFace.rotation.x = Math.PI;
    backFace.visible = false;
    group.add(backFace);
    const fierceBrows = new THREE.Group();
    const browMaterial = makeMaterial(isDark(value) ? "#f4dfbc" : "#493d31");
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(smallSphereGeometry, browMaterial);
      brow.scale.set(0.06, 0.013, 0.014);
      brow.position.set(side * 0.108, BODY_HEIGHT, -0.091);
      brow.rotation.y = side * 0.42;
      fierceBrows.add(brow);
    }
    fierceBrows.visible = false;
    group.add(fierceBrows);
    function makeAccessories(accessoryValue: 1 | 2) {
      const accessoryRoot = new THREE.Group();
      const accessoryGroup = new THREE.Group();
      // Raise all ornaments with the rounder surface, including rotated ears.
      // The outer group remains free to squash during a flip.
      accessoryGroup.scale.y = BODY_HEIGHT / 0.232;
      accessoryRoot.add(accessoryGroup);
      const { accessory, accent } = getCharacterStyle(styleIds[accessoryValue]);
      if (accessory === "none") return accessoryRoot;
      const darkEye = makeMaterial("#242a23", 0.38);
      const sparkle = makeMaterial("#fffced", 0.28);
      const blush = makeMaterial("#ed9a85", 0.7);
      const accentMat = makeMaterial(accent);
      // Ear colors belong to this side, not the body material that blends during a flip.
      const bodyMaterial = makeMaterial(isDark(accessoryValue) ? BLACK : WHITE, BODY_ROUGHNESS);
      bodyMaterial.emissive.copy(bodyMaterial.color);
      bodyMaterial.emissiveIntensity = bodyGlow(accessoryValue);
      function blob(
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        mat: THREE.Material,
        castsShadow = false,
      ) {
        const mesh = new THREE.Mesh(smallSphereGeometry, mat);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = castsShadow;
        accessoryGroup.add(mesh);
        return mesh;
      }
      if (accessory === "leaves") {
        const leafMat = makeMaterial("#88b34e");
        const stem = blob(0, 0.104, -0.323, 0.014, 0.02, 0.11, accentMat);
        stem.rotation.y = -0.12;
        const left = blob(-0.07, 0.13, -0.344, 0.071, 0.035, 0.13, leafMat, true);
        left.rotation.y = -0.7;
        const right = blob(
          0.065,
          0.14,
          -0.379,
          0.068,
          0.032,
          0.12,
          leafMat,
          true,
        );
        right.rotation.y = 0.65;
      }
      if (["bear", "panda", "frog", "bunny"].includes(accessory)) {
        for (const side of [-1, 1]) {
          const bunny = accessory === "bunny";
          const earMat = accessory === "bunny" ? bodyMaterial : accentMat;
          const ear = blob(
            side * 0.218,
            0.055,
            bunny ? -0.337 : -0.278,
            bunny ? 0.073 : 0.091,
            0.077,
            bunny ? 0.205 : 0.093,
            earMat,
            true,
          );
          if (bunny) {
            ear.rotation.y = side * 0.2;
            const inner = blob(
              side * 0.224,
              0.129,
              -0.36,
              0.03,
              0.012,
              0.13,
              accentMat,
            );
            inner.rotation.y = side * 0.2;
          } else if (accessory === "bear")
            blob(side * 0.218, 0.134, -0.282, 0.048, 0.01, 0.045, blush);
          else if (accessory === "frog") {
            blob(side * 0.215, 0.142, -0.29, 0.025, 0.013, 0.027, darkEye);
            blob(side * 0.209, 0.152, -0.3, 0.008, 0.004, 0.009, sparkle);
          }
        }
      }
      if (accessory === "fox" || accessory === "cat") {
        blush.color.set("#efb6a8");
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(
            pointedEars.outer,
            accessory === "fox" ? accentMat : bodyMaterial,
          );
          ear.scale.x = side;
          ear.rotation.x = -Math.PI / 2;
          ear.position.y = 0.012;
          ear.castShadow = true;
          const inner = new THREE.Mesh(pointedEars.inner, blush);
          inner.scale.x = side;
          inner.rotation.x = -Math.PI / 2;
          // The inset follows the ear cap; it does not sit on the pill's face.
          inner.position.y = 0.045;
          accessoryGroup.add(ear, inner);
        }
      }
      if (accessory === "flower") {
        for (let petal = 0; petal < 5; petal++) {
          const a = (petal / 5) * Math.PI * 2;
          blob(
            0.235 + Math.cos(a) * 0.046,
            0.174,
            -0.235 + Math.sin(a) * 0.046,
            0.038,
            0.022,
            0.038,
            accentMat,
          );
        }
        blob(0.235, 0.203, -0.235, 0.032, 0.014, 0.032, makeMaterial("#f2ce6f"));
      }
      if (accessory === "crown") {
        for (let point = -1; point <= 1; point++) {
          const crownPoint = new THREE.Mesh(coneGeo, accentMat);
          crownPoint.scale.set(0.075, 0.16, 0.09);
          crownPoint.rotation.x = -Math.PI / 2;
          crownPoint.position.set(point * 0.105, 0.123, -0.31);
          crownPoint.castShadow = true;
          accessoryGroup.add(crownPoint);
          blob(point * 0.105, 0.14, -0.388, 0.025, 0.025, 0.025, accentMat);
        }
        blob(0, 0.127, -0.243, 0.184, 0.032, 0.037, accentMat);
      }
      return accessoryRoot;
    }
    // Keep both player styles ready. Captures turn to the other side without
    // rebuilding meshes, materials, or the shared face texture during motion.
    const accessories = { 1: makeAccessories(1), 2: makeAccessories(2) };
    const frontAccessories = accessories[value === 1 ? 1 : 2];
    const backAccessories = accessories[value === 1 ? 2 : 1];
    backAccessories.rotation.x = Math.PI;
    backAccessories.visible = false;
    group.add(frontAccessories, backAccessories);
    return {
      backFace,
      frontAccessories,
      backAccessories,
      group,
      body,
      shadow,
      face,
      accessories,
      pandas,
      expression,
      faceKey: "",
      value,
      color: value,
      materials,
      fierceBrows,
    };
  }

  function removePill(index: number) {
    const pill = pills.get(index);
    if (!pill) return;
    scene.remove(pill.group);
    scene.remove(pill.shadow);
    pill.materials.forEach((mat) => mat.dispose());
    pills.delete(index);
  }
  function changeColor(pill: Pill, value: number) {
    const bodyMaterial = pill.body.material as THREE.MeshStandardMaterial;
    bodyMaterial.color.set(isDark(value) ? BLACK : WHITE);
    bodyMaterial.emissive.set(isDark(value) ? BLACK : WHITE);
    bodyMaterial.emissiveIntensity = bodyGlow(value);
    pill.color = value;
  }
  function invalidate() {
    clearTimeout(expressionTimer);
    expressionTimer = undefined;
    if (!stopped && !paused() && !raf) raf = requestAnimationFrame(render);
  }
  function setReaction(
    pill: Pill,
    expression: Expression,
    duration: number,
    now: number,
  ) {
    pill.expression = reactExpression(
      pill.expression,
      expression,
      duration,
      now,
    );
  }
  function updateFace(pill: Pill, now: number) {
    if (!motionReduced())
      pill.expression = advanceExpression(pill.expression, now);
    const expression = motionReduced() ? "happy" : pill.expression.expression;
    const blink = motionReduced() ? "open" : pill.expression.blink;
    const key = `${expression}:${blink}:${pill.color}:${pill.value}`;
    if (key !== pill.faceKey) {
      pill.face.geometry = faces.geometry(
        expression,
        blink,
        pill.pandas[pill.color === 1 ? 1 : 2],
        isDark(pill.color),
      );
      pill.backFace.geometry = faces.geometry(
        expression,
        blink,
        pill.pandas[pill.value === 1 ? 1 : 2],
        isDark(pill.value),
      );
      pill.faceKey = key;
    }
  }
  function scheduleExpressions(now: number) {
    clearTimeout(expressionTimer);
    expressionTimer = undefined;
    if (stopped || paused() || motionReduced() || currentProps?.preview) return;
    let nextAt = Infinity;
    for (const pill of pills.values())
      nextAt = Math.min(nextAt, pill.expression.nextAt);
    // Batch nearby face changes on crowded boards. Flip motion still uses full RAF cadence.
    if (Number.isFinite(nextAt))
      expressionTimer = setTimeout(invalidate, Math.max(40, nextAt - now));
  }
  function render(now: number) {
    raf = 0;
    if (stopped || paused()) return;
    motions = motions.filter((motion) => {
      const pill = pills.get(motion.index);
      if (!pill) return false;
      const p = Math.max(
        0,
        Math.min(1, (now - motion.start) / motion.duration),
      );
      const pose = sampleMovePose(p, motion.placing);
      pill.group.scale.set(pose.width, pose.height, pose.width);
      pill.group.position.y = PIECE_Y + pose.lift;
      pill.group.position.z = Math.floor(motion.index / 8) - 3.5 + pose.depth;
      pill.group.rotation.x = pose.rotation;
      pill.shadow.scale.setScalar(1 - Math.min(0.22, pose.lift * 0.35));
      const showingBack = !motion.placing && pose.rotation >= Math.PI / 2;
      // Both face surfaces turn with the body; depth testing hides the far side.
      pill.face.visible = true;
      pill.backFace.visible = !motion.placing;
      // Flatten the ornament height as it turns edge-on. Front and back then
      // meet at the same point rather than jumping across the pill mid-flip.
      const accessoryDepth = Math.abs(Math.cos(pose.rotation));
      pill.frontAccessories.scale.y = accessoryDepth;
      pill.backAccessories.scale.y = accessoryDepth;
      pill.frontAccessories.visible = !showingBack;
      pill.backAccessories.visible = showingBack;
      if (showingBack && pill.color !== motion.to) {
        changeColor(pill, motion.to);
        setReaction(pill, "surprised", 350, now);
      }
      if (!motion.placing) {
        const mix = THREE.MathUtils.smoothstep(p, 0.44, 0.56);
        const material = pill.body.material as THREE.MeshStandardMaterial;
        material.color
          .copy(pieceColors[motion.from - 1])
          .lerp(pieceColors[motion.to - 1], mix);
        material.emissive.copy(material.color);
        material.emissiveIntensity = THREE.MathUtils.lerp(
          bodyGlow(motion.from),
          bodyGlow(motion.to),
          mix,
        );
      }
      if (p === 1) {
        settlePill(pill, motion.index);
        changeColor(pill, motion.to);
        setReaction(
          pill,
          motion.placing || motion.index % 2 ? "grin" : "happy",
          1100,
          now,
        );
        return false;
      }
      return true;
    });
    for (const [index, start] of hops) {
      const pill = pills.get(index);
      const progress = Math.min(1, (now - start) / 460);
      if (!pill || progress >= 1) {
        if (pill) settlePill(pill, index);
        hops.delete(index);
        continue;
      }
      // A small lift toward the top of the board makes the hop visible from above.
      const pose = sampleMovePose(progress, false);
      pill.group.scale.set(pose.width, pose.height, pose.height);
      pill.group.position.y = PIECE_Y + pose.lift * 0.6;
      pill.group.position.z = Math.floor(index / 8) - 3.5 + pose.depth * 2.2;
      pill.shadow.scale.setScalar(1 - pose.lift * 0.36);
    }
    if (fury) {
      const p = (now - fury.start) / FLIPPOCALYPSE_MS;
      if (p >= 1 || motionReduced()) {
        for (const index of [fury.placedAt, ...fury.captures]) {
          const pill = pills.get(index);
          if (pill) { settlePill(pill, index); setReaction(pill, "grin", 850, now); }
        }
        fury = null;
      } else {
        for (const index of [fury.placedAt, ...fury.captures]) {
          const pill = pills.get(index);
          if (!pill) continue;
          const attacker = index === fury.placedAt;
          const pose = sampleFlippocalypsePose(p, attacker);
          if (attacker || !motions.some((motion) => motion.index === index && now >= motion.start)) {
            pill.group.scale.setScalar(pose.scale);
            if (attacker) {
              const col = index % 8;
              const row = Math.floor(index / 8);
              const envelope = (pose.scale - 1) / 0.9;
              pill.group.position.x = col - 3.5 + (col === 0 ? 0.24 : col === 7 ? -0.24 : 0) * envelope;
              if (row === 0 || row === 7) pill.group.scale.setScalar(Math.min(pose.scale, 1.5));
            }
            pill.group.position.y = PIECE_Y + pose.lift;
            pill.group.position.z = Math.max(-3.4, Math.min(3.4, Math.floor(index / 8) - 3.5 + pose.depth));
          }
          pill.fierceBrows.visible = attacker && p < 0.58;
        }
      }
    }
    const celebrating = celebration.update(now);
    const blazing = flippocalypse.update(now);
    host.dataset.motion = motions.length ? "moving" : "idle";
    host.dataset.hops = String(hops.size);
    host.dataset.particles = String(celebration.count());
    host.dataset.flippocalypse = fury ? "active" : "idle";
    for (const pill of pills.values()) updateFace(pill, now);
    renderer.render(scene, camera);
    if (motions.length || hops.size || celebrating || blazing || fury) invalidate();
    else scheduleExpressions(now);
  }
  function settlePill(pill: Pill, index: number) {
    pill.group.scale.setScalar(1);
    pill.group.rotation.x = 0;
    pill.group.position.set(
      (index % 8) - 3.5,
      PIECE_Y,
      Math.floor(index / 8) - 3.5,
    );
    pill.shadow.scale.setScalar(1);
    pill.face.visible = true;
    pill.backFace.visible = false;
    pill.frontAccessories = pill.accessories[pill.value === 1 ? 1 : 2];
    pill.backAccessories = pill.accessories[pill.value === 1 ? 2 : 1];
    pill.frontAccessories.rotation.x = 0;
    pill.backAccessories.rotation.x = Math.PI;
    pill.frontAccessories.visible = true;
    pill.backAccessories.visible = false;
    pill.frontAccessories.scale.y = 1;
    pill.backAccessories.scale.y = 1;
    pill.fierceBrows.visible = false;
    changeColor(pill, pill.value);
  }
  function stopHops() {
    for (const index of hops.keys()) {
      const pill = pills.get(index);
      if (pill) settlePill(pill, index);
    }
    hops.clear();
    host.dataset.hops = "0";
  }
  function hop(index: number) {
    const pill = pills.get(index);
    if (
      !pill || stopped || paused() || motionReduced() ||
      hops.has(index) || hops.size >= 4 ||
      motions.some((motion) => motion.index === index) || fury
    ) return;
    const now = performance.now();
    hops.set(index, now);
    playGameSound("jump");
    host.dataset.hops = String(hops.size);
    setReaction(pill, "grin", 850, now);
    invalidate();
  }
  function sync(props: GameBoardProps, first = false) {
    if (stopped) return;
    stopHops();
    currentProps = props;
    const styleIds = { 1: playerStyleId(props, 1), 2: playerStyleId(props, 2) };
    const styleKey = `${styleIds[1]}:${styleIds[2]}`;
    const styleChanged = currentStyle !== styleKey;
    currentStyle = styleKey;
    const reduced = motionReduced();
    const added = props.board
      .map((value, index) => (value && !pills.has(index) ? index : -1))
      .filter((index) => index >= 0);
    const removed = [...pills.keys()].some((index) => !props.board[index]);
    const boardChanged = props.board.some(
      (value, index) => value !== (pills.get(index)?.value ?? 0),
    );
    const isMove = !first && !styleChanged && !removed && added.length === 1;
    const captures = props.board.map((value, index) => value && pills.has(index) && pills.get(index)!.value !== value ? index : -1).filter(index => index >= 0);
    const intense = isMove && props.mode === "enhanced" && captures.length >= 6 && !reduced && !paused();
    const now = performance.now();
    if (styleChanged || reduced || boardChanged) {
      motions = [];
      fury = null;
      flippocalypse.clear();
      if (styleChanged || reduced || !isMove) celebration.clear();
      if (styleChanged)
        for (const index of [...pills.keys()]) removePill(index);
      else for (const [index, pill] of pills) settlePill(pill, index);
    }
    for (let index = 0; index < 64; index++) {
      const value = props.board[index] || 0;
      let pill = pills.get(index);
      if (!value) {
        removePill(index);
        motions = motions.filter((motion) => motion.index !== index);
      } else if (!pill) {
        pill = makePill(value, styleIds, index);
        pill.group.position.set(
          (index % 8) - 3.5,
          PIECE_Y,
          Math.floor(index / 8) - 3.5,
        );
        pill.shadow.position.set(
          (index % 8) - 3.5 + 0.027,
          0.101,
          Math.floor(index / 8) - 3.5 + 0.035,
        );
        pills.set(index, pill);
        scene.add(pill.group, pill.shadow);
        if (isMove && !reduced) {
          setReaction(pill, intense ? "happy" : "grin", 1000, now);
          celebration.burst(index, now + PLACEMENT_MS * 0.32, "place");
          motions.push({
            index,
            start: now,
            duration: PLACEMENT_MS,
            from: 0,
            to: value,
            placing: true,
          });
        }
      } else if (pill.value !== value) {
        const from = pill.color;
        pill.value = value;
        motions = motions.filter((motion) => motion.index !== index);
        if (reduced || !isMove) settlePill(pill, index);
        else {
          const start = now + (intense ? enhancedCaptureDelay(index, added[0], captures) : captureDelay(index, added[0], captures));
          setReaction(pill, intense ? "surprised" : "sad", start - now + FLIP_MS, now);
          motions.push({
            index,
            start,
            duration: FLIP_MS,
            from,
            to: value,
            placing: false,
          });
          celebration.burst(index, start + FLIP_MS * 0.88, "flip");
        }
      }
      markers[index].visible =
        !props.targetMode && props.legalMoves.includes(index) && !value && !props.disabled;
    }
    if (intense) {
      fury = { start: now, placedAt: added[0], captures };
      flippocalypse.start(added[0], captures, now);
    }
    selectedRing.visible =
      !props.targetMode &&
      props.selected !== null &&
      props.legalMoves.includes(props.selected) &&
      !props.disabled;
    if (props.selected !== null)
      selectedRing.position.set(
        (props.selected % 8) - 3.5,
        0.14,
        Math.floor(props.selected / 8) - 3.5,
      );
    if (
      hovered !== null &&
      (props.disabled || !props.legalMoves.includes(hovered))
    )
      hover(null);
    invalidate();
  }
  function hover(index: number | null) {
    const pill = index === null ? undefined : pills.get(index);
    if (pill && !motionReduced() && pill.expression.reactionUntil === null) {
      setReaction(pill, "wink", 700, performance.now());
    }
    if (hovered !== null)
      tileMaterials[hovered].color.set(
        TILE_COLORS[(Math.floor(hovered / 8) * 3 + (hovered % 8)) % 4],
      );
    hovered =
      index !== null &&
      !currentProps?.disabled &&
      currentProps?.legalMoves.includes(index)
        ? index
        : null;
    if (hovered !== null) tileMaterials[hovered].color.set("#8dad61");
    invalidate();
  }
  const resize = () => {
    if (stopped) return;
    const size = Math.max(1, host.clientWidth);
    renderer.setSize(size, size, false);
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const refreshVisibility = () => {
    if (paused()) {
      stopHops();
      flippocalypse.clear();
      if (fury) {
        for (const [index, pill] of pills) settlePill(pill, index);
        motions = []; fury = null;
        host.dataset.flippocalypse = "idle";
        host.dataset.motion = "idle";
      }
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(expressionTimer);
      expressionTimer = undefined;
    } else invalidate();
  };
  const viewportObserver = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    refreshVisibility();
  });
  viewportObserver.observe(host);
  document.addEventListener("visibilitychange", refreshVisibility);
  const refreshMotion = () => {
    if (currentProps) sync(currentProps);
  };
  motionQuery.addEventListener("change", refreshMotion);
  const contextLost = (event: Event) => {
    event.preventDefault();
    stopped = true;
    stopHops();
    cancelAnimationFrame(raf);
    clearTimeout(expressionTimer);
    onFailure();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  return {
    sync,
    hover,
    hop,
    dispose() {
      stopped = true;
      stopHops();
      cancelAnimationFrame(raf);
      clearTimeout(expressionTimer);
      observer.disconnect();
      viewportObserver.disconnect();
      document.removeEventListener("visibilitychange", refreshVisibility);
      motionQuery.removeEventListener("change", refreshMotion);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      for (const index of [...pills.keys()]) removePill(index);
      permanentMaterials.forEach((mat) => mat.dispose());
      faces.dispose();
      celebration.dispose();
      flippocalypse.dispose();
      shadowTexture.dispose();
      [
        sphereGeometry,
        smallSphereGeometry,
        tileGeo,
        torusGeo,
        smallTorusGeo,
        coneGeo,
        pointedEars.outer,
        pointedEars.inner,
        baseGeo,
        faceGeometry,
        shadowGeometry,
      ].forEach((geometry) => geometry.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export default function GameBoard(props: GameBoardProps) {
  const fireId = useId();
  const canvasHost = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const latestProps = useRef(props);
  latestProps.current = props;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fallbackPillRefs = useRef<(FallbackPillHandle | null)[]>([]);
  const fallbackHops = useRef(new Set<number>());
  const [webgl, setWebgl] = useState(false);
  const [focusIndex, setFocusIndex] = useState(() => props.legalMoves[0] ?? 0);
  const [fallbackChanges, setFallbackChanges] = useState<
    Record<number, FallbackPillChange>
  >({});
  const [furyMove, setFuryMove] = useState<{ id: number; placedAt: number; captures: number[] } | null>(null);
  const previousBoard = useRef(props.board);
  const moveId = useRef(0);
  const legalMovesKey = props.legalMoves.join(",");
  const targetIndicesKey = props.targetIndices?.join(",");
  const blackStyleId = playerStyleId(props, 1);
  const whiteStyleId = playerStyleId(props, 2);

  useEffect(() => {
    const before = previousBoard.current;
    previousBoard.current = props.board;
    const added = props.board
      .map((value, index) => (value && !before[index] ? index : -1))
      .filter((index) => index >= 0);
    const removed = before.some((value, index) => value && !props.board[index]);
    const reduced =
      props.reducedMotion ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || removed || added.length !== 1) {
      setFallbackChanges({});
      setFuryMove(null);
      latestProps.current.onAnimatingChange?.(false);
      return;
    }
    const captures = props.board.map((value, index) => value && before[index] && value !== before[index] ? index : -1).filter(index => index >= 0);
    const id = ++moveId.current;
    const bounds = canvasHost.current?.getBoundingClientRect();
    const inView = !document.hidden && !!bounds && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
    const intense = inView && isFlippocalypseMove(before, props.board, props.mode);
    setFuryMove(intense ? { id, placedAt: added[0], captures } : null);
    if (intense && !props.preview) playGameSound("fire");
    const changes: Record<number, FallbackPillChange> = {};
    props.board.forEach((value, index) => {
      if (value && value !== before[index])
        changes[index] = {
          id: `${id}-${index}`,
          from: before[index],
          delay: before[index] ? intense ? enhancedCaptureDelay(index, added[0], captures) : captureDelay(index, added[0], captures) : 0,
          intense,
        };
    });
    setFallbackChanges(webgl ? {} : changes);
    latestProps.current.onAnimatingChange?.(true);
    const timer = setTimeout(
      () => { setFuryMove(null); latestProps.current.onAnimatingChange?.(false); },
      intense ? FLIPPOCALYPSE_MS : moveSettleMs(captures.length),
    );
    return () => {
      clearTimeout(timer);
      latestProps.current.onAnimatingChange?.(false);
    };
  }, [props.board, blackStyleId, whiteStyleId, props.reducedMotion, props.mode, webgl]);

  useEffect(() => {
    if (!canvasHost.current) return;
    const hide = () => { if (document.hidden) setFuryMove(null); };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) setFuryMove(null);
    });
    observer.observe(canvasHost.current);
    document.addEventListener("visibilitychange", hide);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", hide); };
  }, []);

  useEffect(() => {
    if (!canvasHost.current) return;
    let boardScene: BoardScene | null = null;
    try {
      boardScene = makeBoardScene(canvasHost.current, () => setWebgl(false));
      sceneRef.current = boardScene;
      boardScene.sync(latestProps.current, true);
      setWebgl(true);
    } catch {
      boardScene?.dispose();
      setWebgl(false);
    }
    return () => {
      boardScene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    for (const pill of fallbackPillRefs.current) pill?.stopHop();
    sceneRef.current?.sync(props);
  }, [
    props.board,
    legalMovesKey,
    props.selected,
    blackStyleId,
    whiteStyleId,
    props.disabled,
    props.reducedMotion,
    props.preview,
    props.mode,
    props.targetMode,
    targetIndicesKey,
  ]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowLeft") next = index % 8 ? index - 1 : index;
    else if (event.key === "ArrowRight")
      next = index % 8 < 7 ? index + 1 : index;
    else if (event.key === "ArrowUp") next = Math.max(0, index - 8);
    else if (event.key === "ArrowDown") next = Math.min(63, index + 8);
    else if (event.key === "Home")
      next = event.ctrlKey ? 0 : Math.floor(index / 8) * 8;
    else if (event.key === "End")
      next = event.ctrlKey ? 63 : Math.floor(index / 8) * 8 + 7;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div
      className={`pill-board ${webgl ? "pill-board--webgl" : "pill-board--fallback"}`}
      data-flippocalypse={furyMove ? "active" : "idle"}
      data-target-mode={props.targetMode ?? undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1",
        borderRadius: "13px",
        overflow: "hidden",
        background: "#759451",
        isolation: "isolate",
      }}
    >
      <div
        ref={canvasHost}
        style={{
          position: "absolute",
          inset: 0,
          visibility: webgl ? "visible" : "hidden",
        }}
      />
      <div
        role="grid"
        aria-label={props.targetMode ? `Othello board. Choose a highlighted tile for ${props.targetMode === "shield" ? "your shield" : "your corner claim"}. Use arrow keys, then Enter or Space.` : "Othello board. Use arrow keys to move between tiles. Press Enter or Space to select a legal move or make a pill jump."}
        aria-rowcount={8}
        aria-colcount={8}
        style={{
          position: "absolute",
          inset: "0.45%",
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
        }}
      >
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} role="row" style={{ display: "contents" }}>
            {Array.from({ length: 8 }, (_, col) => {
              const index = row * 8 + col;
              const value = props.board[index] || 0;
              const legal =
                !props.targetMode && props.legalMoves.includes(index) && !value && !props.disabled;
              const target = !!props.targetMode && !!props.targetIndices?.includes(index) && !props.disabled;
              const selected = props.selected === index && (legal || target);
              const shield = Array.isArray(props.effects) ? props.effects.find((effect) => effect.ability === "shield" && effect.index === index) : props.effects?.shield?.index === index ? props.effects.shield : null;
              const corner = Array.isArray(props.effects) ? props.effects.find((effect) => effect.ability === "corner" && effect.index === index) : props.effects?.corner?.index === index ? props.effects.corner : null;
              return (
                <button
                  key={index}
                  ref={(element) => {
                    buttonRefs.current[index] = element;
                  }}
                  type="button"
                  role="gridcell"
                  className="pill-board__cell"
                  data-legal={legal}
                  data-cell={cellName(index)}
                  data-target={target || undefined}
                  data-fury={!webgl && furyMove?.placedAt === index ? "attacker" : undefined}
                  aria-label={`${cellName(index)}, ${value ? (isDark(value) ? "black piece, make it jump" : "white piece, make it jump") : "empty"}${legal ? ", legal move" : ""}${target ? `, choose for ${props.targetMode}` : ""}${shield ? `, shielded for ${shield.owner === 1 ? "black" : "white"}` : ""}${corner ? `, reserved for ${corner.owner === 1 ? "black" : "white"}` : ""}`}
                  aria-selected={selected}
                  aria-disabled={!legal && !target && !value}
                  aria-rowindex={row + 1}
                  aria-colindex={col + 1}
                  tabIndex={props.preview ? -1 : focusIndex === index ? 0 : -1}
                  style={{ cursor: legal || target || value ? "pointer" : "default" }}
                  onClick={() => {
                    if (legal || target) {
                      props.onSelect(index);
                      if (!props.preview && props.selected !== index)
                        playGameSound("select");
                    }
                    else if (value) {
                      if (webgl) sceneRef.current?.hop(index);
                      else if (fallbackHops.current.size < 4)
                        fallbackPillRefs.current[index]?.hop();
                    }
                  }}
                  onKeyDown={(event) => navigate(event, index)}
                  onFocus={() => {
                    setFocusIndex(index);
                    sceneRef.current?.hover(index);
                  }}
                  onBlur={() => sceneRef.current?.hover(null)}
                  onPointerEnter={() => sceneRef.current?.hover(index)}
                  onPointerLeave={() => sceneRef.current?.hover(null)}
                >
                  {!webgl && value !== 0 && (
                    <span className="pill-board__fallback-avatar">
                      <FallbackPill
                        hopRef={(handle) => {
                          fallbackPillRefs.current[index] = handle;
                        }}
                        onHopChange={(active) => {
                          if (active) fallbackHops.current.add(index);
                          else fallbackHops.current.delete(index);
                          if (canvasHost.current)
                            canvasHost.current.dataset.hops = String(fallbackHops.current.size);
                        }}
                        value={value}
                        styleId={value === 1 ? blackStyleId : whiteStyleId}
                        fromStyleId={fallbackChanges[index]?.from === 1 ? blackStyleId : whiteStyleId}
                        change={fallbackChanges[index]}
                        reducedMotion={props.reducedMotion}
                      />
                    </span>
                  )}
                  {!webgl && legal && <span className="pill-board__marker" />}
                  {!webgl && selected && (
                    <span className="pill-board__selected" />
                  )}
                  {target && <span className={`pill-board__target ${selected ? "is-selected" : ""}`} aria-hidden="true"><AbilityIcon type={props.targetMode!} /></span>}
                  {(shield || corner) && <span className={`pill-board__effect pill-board__effect--${shield ? "shield" : "corner"}`} data-owner={(shield ?? corner)!.owner} aria-hidden="true"><AbilityIcon type={shield ? "shield" : "corner"} /></span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {!webgl && furyMove && <div key={furyMove.id} className="pill-board__fire-trails" aria-hidden="true">{[furyMove.placedAt, ...furyMove.captures].slice(0, 24).map((index, order) => {
        const gradientId = `${fireId}-flame-${index}`;
        const glowId = `${fireId}-glow-${index}`;
        return <svg key={index} viewBox="0 0 100 100" style={{ left: `${index % 8 * 12.5}%`, top: `${Math.floor(index / 8) * 12.5}%`, animationDelay: `${order % 3 * -70}ms` }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2=".35" y2="0">
              <stop stopColor="#fffbe0" /><stop offset=".35" stopColor="#ffec91" /><stop offset=".7" stopColor="#ffc34c" stopOpacity=".88" /><stop offset="1" stopColor="#ef7629" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={glowId}><stop stopColor="#fff3b6" stopOpacity=".06" /><stop offset=".65" stopColor="#ffcc51" stopOpacity=".38" /><stop offset="1" stopColor="#ffb130" stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx="50" cy="55" rx="59" ry="52" fill={`url(#${glowId})`} />
          <path className="fire-trail__halo" d={FIRE_CURLS[order % FIRE_CURLS.length]} />
          <g className="fire-trail__tongues" fill={`url(#${gradientId})`}>
            <path d="M27 91C0 79 8 47 23 32C16 50 32 51 28 64C43 43 28 21 47 2C40 31 57 39 47 57C59 78 43 94 27 91Z" />
            <path d="M75 94C100 83 95 58 83 44C90 63 70 63 75 76C53 54 78 35 62 13C67 40 50 52 62 69C52 87 64 96 75 94Z" />
          </g>
          <path className="fire-trail__core" d={FIRE_CURLS[order % FIRE_CURLS.length]} />
          <path fill="#fff6b7" d="m77 5 3 9 10 3-10 3-3 10-3-10-10-3 10-3Z" /><path fill="#ffe082" d="m15 82 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" />
        </svg>;
      })}</div>}
    </div>
  );
}

function AbilityIcon({ type }: { type: "shield" | "corner" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">{type === "shield" ? <><path d="M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6Z" /><path d="m8 12 3 3 5-6" /></> : <><path d="m3 11 9-8 9 8M5 10v11h14V10" /><path d="M10 21v-7h4v7M18 3v5" /></>}</svg>;
}

export { GameBoard };
