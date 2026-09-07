import * as THREE from "three";

type Strength = "place" | "flip";

export interface BoardCelebration {
  /** Times use the same performance.now() clock as the board animation. */
  burst(index: number, startAt: number, strength?: Strength): void;
  /** Returns true while a visible or scheduled effect remains. */
  update(now: number): boolean;
  clear(): void;
  dispose(): void;
  count(): number;
}

type Particle = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  start: number;
  duration: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  size: number;
  rotation: number;
  spin: number;
};

type Ring = {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  start: number;
  duration: number;
};

const POOL_SIZE = 96;
const RING_POOL_SIZE = 8;
const CELL = 96;
const ATLAS_TILES = 4;
const EDGE = 3.89;

function makeAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * ATLAS_TILES;
  canvas.height = CELL;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot create the board celebration texture.");

  // The four small vector assets are painted once, then shared by every sprite.
  function star(tile: number, fill: string) {
    const x = tile * CELL + CELL / 2;
    const y = CELL / 2;
    context!.beginPath();
    context!.moveTo(x, y - 36);
    context!.quadraticCurveTo(x + 8, y - 8, x + 30, y);
    context!.quadraticCurveTo(x + 8, y + 8, x, y + 36);
    context!.quadraticCurveTo(x - 8, y + 8, x - 30, y);
    context!.quadraticCurveTo(x - 8, y - 8, x, y - 36);
    context!.fillStyle = fill;
    context!.fill();
    context!.strokeStyle = "#fff5c7";
    context!.lineWidth = 2.5;
    context!.stroke();
  }
  star(0, "#ffd164");
  star(1, "#fff0b2");

  context.save();
  context.translate(CELL * 2.5, CELL / 2);
  context.rotate(-0.5);
  context.beginPath();
  context.moveTo(0, -32);
  context.bezierCurveTo(29, -23, 28, 13, 2, 31);
  context.bezierCurveTo(-22, 18, -27, -12, 0, -32);
  context.fillStyle = "#ffc6a5";
  context.fill();
  context.beginPath();
  context.ellipse(-6, -9, 7, 14, 0.35, 0, Math.PI * 2);
  context.fillStyle = "#ffdfbd";
  context.fill();
  context.restore();

  context.save();
  context.translate(CELL * 3.5, CELL / 2);
  for (let i = 0; i < 5; i++) {
    context.save();
    context.rotate((i / 5) * Math.PI * 2);
    context.beginPath();
    context.ellipse(0, -20, 13, 19, 0, 0, Math.PI * 2);
    context.fillStyle = i % 2 === 0 ? "#fff4d9" : "#ffe1ba";
    context.fill();
    context.restore();
  }
  context.beginPath();
  context.arc(0, 0, 11, 0, Math.PI * 2);
  context.fillStyle = "#f5bd50";
  context.fill();
  context.beginPath();
  context.arc(-3, -4, 4, 0, Math.PI * 2);
  context.fillStyle = "#ffe29b";
  context.fill();
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * A bounded pool for the overhead board. Nothing is allocated or painted during
 * update(), and hidden-tab clock jumps expire the effects in one pass.
 */
export function createBoardCelebration(scene: THREE.Scene): BoardCelebration {
  const atlas = makeAtlas();
  const geometries: THREE.PlaneGeometry[] = [];
  for (let tile = 0; tile < ATLAS_TILES; tile++) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, (tile + uv.getX(i)) / ATLAS_TILES);
    }
    geometries.push(geometry);
  }

  const group = new THREE.Group();
  group.name = "board-celebration";
  scene.add(group);
  const particles: Particle[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const material = new THREE.MeshBasicMaterial({
      map: atlas,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geometries[0], material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 30;
    mesh.visible = false;
    group.add(mesh);
    particles.push({
      mesh,
      active: false,
      start: 0,
      duration: 0,
      x: 0,
      z: 0,
      dx: 0,
      dz: 0,
      size: 0,
      rotation: 0,
      spin: 0,
    });
  }

  const ringGeometry = new THREE.RingGeometry(0.431, 0.447, 48);
  const rings: Ring[] = [];
  for (let i = 0; i < RING_POOL_SIZE; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: "#ffe8a0",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.115;
    mesh.visible = false;
    group.add(mesh);
    rings.push({ mesh, active: false, start: 0, duration: 0 });
  }

  let nextParticle = 0;
  let nextRing = 0;
  let randomState = 0x7f4a7c15;
  let disposed = false;

  function random(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }

  function burst(index: number, startAt: number, strength: Strength = "flip") {
    if (
      disposed ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 63 ||
      !Number.isFinite(startAt)
    )
      return;
    const x = (index % 8) - 3.5;
    const z = Math.floor(index / 8) - 3.5;
    const amount = strength === "flip" ? 6 : 4;
    const offset = random() * Math.PI * 2;
    for (let i = 0; i < amount; i++) {
      const particle = particles[nextParticle];
      nextParticle = (nextParticle + 1) % POOL_SIZE;
      const angle = offset + (i / amount) * Math.PI * 2 + random() * 0.3;
      const tile = i === 4 && random() > 0.35 ? 3 : i % 3;
      const radius = 0.25 + random() * 0.12;
      const travel = 0.18 + random() * 0.25;
      particle.active = true;
      particle.mesh.visible = false;
      particle.mesh.geometry = geometries[tile];
      particle.start = startAt + random() * 38;
      particle.duration = 550 + random() * 110;
      particle.x = x + Math.cos(angle) * radius;
      particle.z = z + Math.sin(angle) * radius;
      particle.dx = Math.cos(angle) * travel;
      particle.dz = Math.sin(angle) * travel - 0.1;
      particle.size =
        tile === 3
          ? 0.23
          : tile === 2
            ? 0.14 + random() * 0.035
            : 0.15 + random() * 0.055;
      particle.rotation = random() * Math.PI * 2;
      particle.spin = (random() - 0.5) * (tile === 2 ? 3.2 : 1.7);
      particle.mesh.material.opacity = 0;
    }
    // A quiet ring marks the landing. Keep the ring inside an edge tile.
    const ring = rings[nextRing];
    nextRing = (nextRing + 1) % RING_POOL_SIZE;
    ring.active = true;
    ring.mesh.visible = false;
    ring.start = startAt;
    ring.duration = strength === "flip" ? 370 : 440;
    ring.mesh.position.x = x;
    ring.mesh.position.z = z;
    ring.mesh.material.opacity = 0;
  }

  function update(now: number): boolean {
    if (disposed || !Number.isFinite(now)) return false;
    let active = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      const particle = particles[i];
      if (!particle.active) continue;
      const progress = (now - particle.start) / particle.duration;
      if (progress >= 1) {
        particle.active = false;
        particle.mesh.visible = false;
        continue;
      }
      active = true;
      if (progress < 0) {
        particle.mesh.visible = false;
        continue;
      }
      const mesh = particle.mesh;
      mesh.visible = true;
      const drift = 1 - Math.pow(1 - progress, 2);
      const lift = Math.sin(progress * Math.PI);
      const scale = particle.size * (0.72 + lift * 0.28);
      const edge = EDGE - scale / 2;
      mesh.position.set(
        Math.max(-edge, Math.min(edge, particle.x + particle.dx * drift)),
        0.62 + lift * 0.35,
        Math.max(
          -edge,
          Math.min(edge, particle.z + particle.dz * drift - lift * 0.08),
        ),
      );
      mesh.scale.setScalar(scale);
      mesh.rotation.z = particle.rotation + particle.spin * progress;
      const entrance = Math.min(1, progress / 0.11);
      const fade = progress < 0.35 ? 1 : (1 - progress) / 0.65;
      mesh.material.opacity = entrance * fade * 0.94;
    }
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const ring = rings[i];
      if (!ring.active) continue;
      const progress = (now - ring.start) / ring.duration;
      if (progress >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      active = true;
      if (progress < 0) {
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.visible = true;
      const edgeTile =
        Math.abs(ring.mesh.position.x) > 3 ||
        Math.abs(ring.mesh.position.z) > 3;
      const scale = 0.91 + (edgeTile ? 0.14 : 0.46) * progress;
      ring.mesh.scale.setScalar(scale);
      ring.mesh.material.opacity =
        0.42 * (1 - progress) * Math.min(1, progress / 0.12);
    }
    return active;
  }

  function clear() {
    for (let i = 0; i < POOL_SIZE; i++) {
      particles[i].active = false;
      particles[i].mesh.visible = false;
    }
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      rings[i].active = false;
      rings[i].mesh.visible = false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    scene.remove(group);
    for (const particle of particles) particle.mesh.material.dispose();
    for (const ring of rings) ring.mesh.material.dispose();
    for (const geometry of geometries) geometry.dispose();
    ringGeometry.dispose();
    atlas.dispose();
  }

  function count(): number {
    let result = 0;
    for (let i = 0; i < POOL_SIZE; i++) if (particles[i].active) result++;
    for (let i = 0; i < RING_POOL_SIZE; i++) if (rings[i].active) result++;
    return result;
  }

  return { burst, update, clear, dispose, count };
}
