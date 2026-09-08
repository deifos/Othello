import * as THREE from "three";
import { FLIPPOCALYPSE_MS } from "./flippocalypseMotion";

const POOL_SIZE = 24;
const TONGUES = 3;
const SEGMENTS = 26;
const STAR_COUNT = 2;
const EMBER_COUNT = 4;
const EDGE = 3.98;
const clampEdge = (value: number) => Math.max(-EDGE, Math.min(EDGE, value));
const variation = (value: number) => (value * 0.61803398875) % 1;

const vertexShader = `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Flowing density breaks up the edges into wisps, without a bloom pass.
const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float along = vUv.x;
    float side = vUv.y * 2.0 - 1.0;
    float flow = noise(vec2(along * 6.0 - uTime * 2.7, side * 1.8 + vSeed * 19.0));
    float detail = noise(vec2(along * 14.0 - uTime * 5.1, side * 4.0 + vSeed * 31.0));
    float bend = sin(along * 13.0 - uTime * 8.0 + vSeed * 9.0) * (0.05 + along * 0.1);
    float edge = abs(side + bend);
    float density = 1.0 - smoothstep(0.38, 0.98 - flow * 0.15, edge);
    float core = (1.0 - smoothstep(0.015, 0.33, edge + flow * 0.12)) * (0.82 + detail * 0.18);
    float ends = smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.91, 1.0, along));
    float alpha = density * ends * uOpacity * (0.65 + flow * 0.23);
    vec3 color = mix(vec3(1.0, 0.16, 0.012), vec3(1.0, 0.68, 0.11), smoothstep(0.36, 0.92, density));
    color = mix(color, vec3(1.0, 0.98, 0.7), core);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function glowTexture(kind: "halo" | "star" | "ember") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = kind === "halo" ? 128 : 64;
  const context = canvas.getContext("2d")!;
  const half = canvas.width / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half - 1);
  if (kind === "halo") {
    gradient.addColorStop(0, "#fff8aa44");
    gradient.addColorStop(.32, "#ffe15aad");
    gradient.addColorStop(.56, "#ffa82574");
    gradient.addColorStop(1, "#ff831300");
  } else {
    gradient.addColorStop(0, "#fffad7ff");
    gradient.addColorStop(.18, "#ffe071eb");
    gradient.addColorStop(.45, "#ffad3155");
    gradient.addColorStop(1, "#ff912500");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (kind === "star") {
    context.beginPath(); context.moveTo(32, 3);
    context.quadraticCurveTo(35, 28, 57, 32);
    context.quadraticCurveTo(35, 36, 32, 61);
    context.quadraticCurveTo(29, 36, 7, 32);
    context.quadraticCurveTo(29, 28, 32, 3);
    context.fillStyle = "#fff7d1"; context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/** Four bounded draw calls: flowing flame sheets, floor glow, stars, and embers. */
export function createFlippocalypse(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "flippocalypse"; group.visible = false; scene.add(group);
  const vertexCount = POOL_SIZE * TONGUES * SEGMENTS * 6;
  const positions = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const seeds = new Float32Array(vertexCount);
  const cornerOrder = [0, 1, 2, 1, 3, 2];
  for (let tongue = 0; tongue < POOL_SIZE * TONGUES; tongue++) {
    for (let segment = 0; segment < SEGMENTS; segment++) {
      for (let vertex = 0; vertex < 6; vertex++) {
        const corner = cornerOrder[vertex];
        const index = (tongue * SEGMENTS + segment) * 6 + vertex;
        uv[index * 2] = (segment + (corner >= 2 ? 1 : 0)) / SEGMENTS;
        uv[index * 2 + 1] = corner % 2;
        seeds[index] = variation(tongue + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader, fragmentShader, side: THREE.DoubleSide, transparent: true,
    depthWrite: false, depthTest: true, toneMapped: false,
  });
  material.forceSinglePass = true;
  const flameSheets = new THREE.Mesh(geometry, material);
  flameSheets.frustumCulled = false; flameSheets.renderOrder = 25; group.add(flameSheets);

  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  const haloTexture = glowTexture("halo");
  const starTexture = glowTexture("star");
  const emberTexture = glowTexture("ember");
  const haloMaterial = new THREE.MeshBasicMaterial({ map: haloTexture, transparent: true, depthWrite: false, toneMapped: false });
  const starMaterial = new THREE.MeshBasicMaterial({ map: starTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const emberMaterial = new THREE.MeshBasicMaterial({ map: emberTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const halos = new THREE.InstancedMesh(spriteGeometry, haloMaterial, POOL_SIZE);
  const stars = new THREE.InstancedMesh(spriteGeometry, starMaterial, POOL_SIZE * STAR_COUNT);
  const embers = new THREE.InstancedMesh(spriteGeometry, emberMaterial, POOL_SIZE * EMBER_COUNT);
  for (const [index, mesh] of [halos, stars, embers].entries()) {
    mesh.frustumCulled = false; mesh.count = 0;
    mesh.renderOrder = index ? 30 + index : 2;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh);
  }
  const instance = new THREE.Object3D();
  instance.rotation.x = -Math.PI / 2;
  const corners = new Float32Array(12);
  let startAt = -Infinity;
  let tiles: number[] = [];
  let disposed = false;

  function clear() {
    startAt = -Infinity; tiles.length = 0; group.visible = false;
    halos.count = stars.count = embers.count = 0; geometry.setDrawRange(0, 0);
  }
  function start(index: number, captures: readonly number[], now: number) {
    clear();
    if (disposed || captures.length < 6) return;
    tiles = [...captures].sort((a, b) => Math.abs(a - index) - Math.abs(b - index)).slice(0, POOL_SIZE - 1);
    tiles.unshift(index); startAt = now; group.visible = true;
    material.uniforms.uOpacity.value = 0;
    halos.count = tiles.length; stars.count = tiles.length * STAR_COUNT; embers.count = tiles.length * EMBER_COUNT;
    geometry.setDrawRange(0, tiles.length * TONGUES * SEGMENTS * 6);
  }
  function update(now: number) {
    if (disposed || !tiles.length) return false;
    const p = (now - startAt) / FLIPPOCALYPSE_MS;
    if (p < 0) return true;
    if (p >= 1) { clear(); return false; }
    const fade = Math.min(1, p / .13) * Math.min(1, (1 - p) / .28);
    const surge = Math.sin(p * Math.PI);
    let offset = 0;
    for (let tile = 0; tile < tiles.length; tile++) {
      const x = tiles[tile] % 8 - 3.5;
      const z = Math.floor(tiles[tile] / 8) - 3.5;
      const seed = variation(tiles[tile] + 1);
      const attacker = tile === 0;
      for (let tongue = 0; tongue < TONGUES; tongue++) {
        const stream = variation(tiles[tile] * 3 + tongue + 1);
        const phase = seed * Math.PI * 2 + tongue * 2.08 + p * (1.8 + stream * 1.2);
        const arc = 1.05 + stream * .8;
        const radius = (attacker ? .63 : .4) + surge * .11;
        const point = (segment: number, side: number, corner: number) => {
          const t = segment / SEGMENTS;
          const angle = phase + t * arc;
          const wave = Math.sin(t * 9 - p * 9 + stream * 12) * .04 * t;
          const width = Math.pow(Math.sin(t * Math.PI), .85) * (.17 + stream * .1) * (.55 + surge * .45);
          const lick = side > 0 ? Math.pow(Math.max(0, Math.sin(t * 13 - p * 8 + stream * 9)), 3) * .085 * Math.sin(t * Math.PI) : 0;
          const r = radius + Math.sin(t * Math.PI * .82) * .15 - Math.max(0, t - .67) * .38 + wave + side * width + lick;
          corners[corner * 3] = clampEdge(x + Math.cos(angle) * r);
          corners[corner * 3 + 1] = .24 + t * .31 + Math.sin(angle) * .025;
          corners[corner * 3 + 2] = clampEdge(z + Math.sin(angle) * r * .89 - t * .13 - surge * .045);
        };
        for (let segment = 0; segment < SEGMENTS; segment++) {
          point(segment, -1, 0); point(segment, 1, 1); point(segment + 1, -1, 2); point(segment + 1, 1, 3);
          for (let vertex = 0; vertex < 6; vertex++) {
            const source = cornerOrder[vertex] * 3;
            positions[offset++] = corners[source]; positions[offset++] = corners[source + 1]; positions[offset++] = corners[source + 2];
          }
        }
      }
      instance.position.set(x, .117, z); instance.rotation.z = 0;
      instance.scale.setScalar((attacker ? 2.05 : 1.65) * (.9 + surge * .1));
      instance.updateMatrix(); halos.setMatrixAt(tile, instance.matrix);
      for (let spark = 0; spark < STAR_COUNT + EMBER_COUNT; spark++) {
        const star = spark < STAR_COUNT;
        const drift = variation(tiles[tile] * 7 + spark + 1);
        const life = Math.max(0, Math.min(1, (p - .04 - drift * .19) / .75));
        const direction = seed * Math.PI * 2 + spark * 2.4;
        const distance = .44 + life * (.25 + drift * .22);
        const size = (star ? .14 + drift * .07 : .055 + drift * .035) * Math.sin(life * Math.PI);
        instance.position.set(clampEdge(x + Math.cos(direction) * distance), .94 + life * .2,
          clampEdge(z + Math.sin(direction) * distance * .7 - life * (.27 + drift * .28)));
        instance.rotation.z = drift * .7 + life * .6;
        instance.scale.set(size * (star ? 1 : .7), size * (star ? 1 : 1.45), 1);
        instance.updateMatrix();
        (star ? stars : embers).setMatrixAt(tile * (star ? STAR_COUNT : EMBER_COUNT) + (star ? spark : spark - STAR_COUNT), instance.matrix);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    material.uniforms.uTime.value = p * 1.6; material.uniforms.uOpacity.value = fade * .92;
    haloMaterial.opacity = fade * .92; starMaterial.opacity = fade; emberMaterial.opacity = fade;
    halos.instanceMatrix.needsUpdate = stars.instanceMatrix.needsUpdate = embers.instanceMatrix.needsUpdate = true;
    return true;
  }
  return {
    start, update, clear,
    dispose() {
      if (disposed) return;
      clear(); disposed = true; scene.remove(group);
      geometry.dispose(); material.dispose(); spriteGeometry.dispose();
      halos.dispose(); stars.dispose(); embers.dispose();
      haloTexture.dispose(); starTexture.dispose(); emberTexture.dispose();
      haloMaterial.dispose(); starMaterial.dispose(); emberMaterial.dispose();
    },
  };
}
