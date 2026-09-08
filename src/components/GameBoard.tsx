import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import * as THREE from "three";
import { playGameSound } from "../lib/gameAudio";
import { getCharacterStyle } from "../styles/characters";
import FallbackPill from "./FallbackPill";
import type { FallbackPillChange, FallbackPillHandle } from "./FallbackPill";
import { createBoardCelebration } from "../animation/boardCelebration";
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

const PIECE_Y = 0.34;
const BLACK = "#42463d";
const WHITE = "#fffaf0";
const pieceColors = [new THREE.Color(BLACK), new THREE.Color(WHITE)];
const TILE_COLORS = ["#779852", "#75964f", "#789853", "#7b9b56"];
const cellName = (index: number) =>
  `${String.fromCharCode(65 + (index % 8))}${Math.floor(index / 8) + 1}`;
const isDark = (value: number) => value === 1;
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
  shadowGradient.addColorStop(0, "rgba(30,44,20,0.33)");
  shadowGradient.addColorStop(0.48, "rgba(30,44,20,0.19)");
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
      0.232 * Math.sqrt(Math.max(0, 1 - (x / 0.369) ** 2 - (z / 0.369) ** 2)) +
        0.006,
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
        metalness: 0.01,
      });
      materials.push(result);
      return result;
    };
    const bodyMaterial = makeMaterial(isDark(value) ? BLACK : WHITE, 0.48);
    bodyMaterial.emissive.set(isDark(value) ? BLACK : WHITE);
    bodyMaterial.emissiveIntensity = isDark(value) ? 0.55 : 0.65;
    const body = new THREE.Mesh(sphereGeometry, bodyMaterial);
    body.scale.set(0.369, 0.232, 0.369);
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
    function makeAccessories(accessoryValue: 1 | 2) {
      const accessoryGroup = new THREE.Group();
      const { accessory, accent } = getCharacterStyle(styleIds[accessoryValue]);
      if (accessory === "none") return accessoryGroup;
      const darkEye = makeMaterial("#242a23", 0.38);
      const sparkle = makeMaterial("#fffced", 0.28);
      const blush = makeMaterial("#ed9a85", 0.7);
      const accentMat = makeMaterial(accent);
      // Ear colors belong to this side, not the body material that blends during a flip.
      const bodyMaterial = makeMaterial(isDark(accessoryValue) ? BLACK : WHITE, 0.48);
      bodyMaterial.emissive.copy(bodyMaterial.color);
      bodyMaterial.emissiveIntensity = isDark(accessoryValue) ? 0.55 : 0.65;
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
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(
            coneGeo,
            accessory === "fox" ? accentMat : bodyMaterial,
          );
          ear.scale.set(0.135, 0.22, 0.1);
          ear.rotation.x = -Math.PI / 2;
          ear.rotation.z = side * 0.18;
          ear.position.set(side * 0.233, 0.07, -0.27);
          ear.castShadow = true;
          accessoryGroup.add(ear);
          blob(side * 0.239, 0.141, -0.284, 0.037, 0.015, 0.05, blush);
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
      return accessoryGroup;
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
    bodyMaterial.emissiveIntensity = isDark(value) ? 0.55 : 0.65;
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
          isDark(motion.from) ? 0.55 : 0.65,
          isDark(motion.to) ? 0.55 : 0.65,
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
    const celebrating = celebration.update(now);
    host.dataset.motion = motions.length ? "moving" : "idle";
    host.dataset.hops = String(hops.size);
    host.dataset.particles = String(celebration.count());
    for (const pill of pills.values()) updateFace(pill, now);
    renderer.render(scene, camera);
    if (motions.length || hops.size || celebrating) invalidate();
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
      motions.some((motion) => motion.index === index)
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
    const now = performance.now();
    if (styleChanged || reduced || boardChanged) {
      motions = [];
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
          setReaction(pill, "grin", 1000, now);
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
          const start = now + captureDelay(index, added[0], captures);
          setReaction(pill, "sad", start - now + FLIP_MS, now);
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
        props.legalMoves.includes(index) && !value && !props.disabled;
    }
    selectedRing.visible =
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
      shadowTexture.dispose();
      [
        sphereGeometry,
        smallSphereGeometry,
        tileGeo,
        torusGeo,
        smallTorusGeo,
        coneGeo,
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
  const previousBoard = useRef(props.board);
  const moveId = useRef(0);
  const legalMovesKey = props.legalMoves.join(",");
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
      latestProps.current.onAnimatingChange?.(false);
      return;
    }
    const captures = props.board.map((value, index) => value && before[index] && value !== before[index] ? index : -1).filter(index => index >= 0);
    const id = ++moveId.current;
    const changes: Record<number, FallbackPillChange> = {};
    props.board.forEach((value, index) => {
      if (value && value !== before[index])
        changes[index] = {
          id: `${id}-${index}`,
          from: before[index],
          delay: before[index] ? captureDelay(index, added[0], captures) : 0,
        };
    });
    setFallbackChanges(webgl ? {} : changes);
    latestProps.current.onAnimatingChange?.(true);
    const timer = setTimeout(
      () => latestProps.current.onAnimatingChange?.(false),
      moveSettleMs(captures.length),
    );
    return () => {
      clearTimeout(timer);
      latestProps.current.onAnimatingChange?.(false);
    };
  }, [props.board, blackStyleId, whiteStyleId, props.reducedMotion, webgl]);

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
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1",
        borderRadius: "13px",
        overflow: "hidden",
        background: "#759451",
        boxShadow: "0 4px 0 #57723d, 0 7px 10px #4d573123",
        isolation: "isolate",
      }}
    >
      <style>{`.pill-board__cell{border:0;background:transparent;border-radius:5px;padding:0;display:flex;align-items:center;justify-content:center;position:relative;min-width:0;min-height:0;outline:none;-webkit-tap-highlight-color:transparent}.pill-board__cell:focus-visible{box-shadow:inset 0 0 0 3px #fff4c5;z-index:2}.pill-board--fallback .pill-board__cell{background:linear-gradient(130deg,#96b470,#82a45a);border:1px solid #6c8e49;box-shadow:inset 0 1px #b3c68d80}.pill-board--fallback .pill-board__cell[data-legal=true]:hover{background:#a5c77b}.pill-board__fallback-avatar{width:83%;height:83%;pointer-events:none}.pill-board__fallback-avatar svg{width:100%;height:100%}.pill-board__marker{width:28%;height:28%;border-radius:50%;background:#c2e787;border:1px solid #678b3c;box-shadow:0 2px 3px #3e592738}.pill-board__selected{position:absolute;width:59%;height:59%;border:2px solid #edffcf;border-radius:50%;box-shadow:0 0 0 3px #a9d16b70}.pill-board--webgl .pill-board__cell[data-legal=true]:hover{background:#d5e8a810}`}</style>
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
        aria-label="Othello board. Use arrow keys to move between tiles. Press Enter or Space to select a legal move or make a pill jump."
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
                props.legalMoves.includes(index) && !value && !props.disabled;
              const selected = props.selected === index && legal;
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
                  aria-label={`${cellName(index)}, ${value ? (isDark(value) ? "black piece, make it jump" : "white piece, make it jump") : "empty"}${legal ? ", legal move" : ""}`}
                  aria-selected={selected}
                  aria-disabled={!legal && !value}
                  aria-rowindex={row + 1}
                  aria-colindex={col + 1}
                  tabIndex={props.preview ? -1 : focusIndex === index ? 0 : -1}
                  style={{ cursor: legal || value ? "pointer" : "default" }}
                  onClick={() => {
                    if (legal) {
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
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export { GameBoard };
