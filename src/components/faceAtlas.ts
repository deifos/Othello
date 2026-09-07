import * as THREE from "three";
import {
  BLINK_PHASES,
  EXPRESSIONS,
  ellipsePath,
  getFaceFeatures,
} from "../styles/expressions";
import type { BlinkPhase, Expression } from "../styles/expressions";

/** All faces share one GPU texture. A pose change only selects cached UVs. */
export function createFaceAtlas(baseGeometry: THREE.PlaneGeometry) {
  const cell = 128;
  const columns = EXPRESSIONS.length;
  const rows = BLINK_PHASES.length * 4;
  const canvas = document.createElement("canvas");
  canvas.width = cell * columns;
  canvas.height = cell * rows;
  const context = canvas.getContext("2d")!;

  for (let variant = 0; variant < 4; variant++) {
    for (let blink = 0; blink < BLINK_PHASES.length; blink++) {
      for (let expression = 0; expression < columns; expression++) {
        context.save();
        context.translate(expression * cell, (variant * 3 + blink) * cell);
        context.beginPath();
        context.rect(0, 0, cell, cell);
        context.clip();
        context.scale(cell / 84, cell / 64);
        context.translate(-8, -26);
        const panda = variant % 2 === 1;
        const dark = variant >= 2;
        if (panda) {
          context.fillStyle = "#53534a";
          for (const x of [35, 65])
            context.fill(new Path2D(ellipsePath(x, 54, 9, 11)));
        }
        context.fillStyle = "#f0a48d";
        for (const x of [26.5, 73.5])
          context.fill(new Path2D(ellipsePath(x, 63, 6, 3.8)));
        for (const feature of getFaceFeatures(
          EXPRESSIONS[expression],
          BLINK_PHASES[blink],
          dark,
        )) {
          const path = new Path2D(feature.d);
          if (feature.fill && feature.fill !== "none") {
            context.fillStyle = feature.fill;
            context.fill(path);
          }
          if (feature.stroke) {
            context.strokeStyle = feature.stroke;
            context.lineWidth = feature.strokeWidth ?? 2;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.stroke(path);
          }
        }
        context.restore();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.025,
    toneMapped: false,
  });
  const geometries = new Map<string, THREE.PlaneGeometry>();
  return {
    material,
    geometry(
      expression: Expression,
      blink: BlinkPhase,
      panda: boolean,
      dark: boolean,
    ) {
      const column = EXPRESSIONS.indexOf(expression);
      const row =
        (Number(dark) * 2 + Number(panda)) * 3 + BLINK_PHASES.indexOf(blink);
      const key = `${column}:${row}`;
      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = baseGeometry.clone();
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++)
          uv.setXY(
            i,
            (column + uv.getX(i)) / columns,
            (rows - row - 1 + uv.getY(i)) / rows,
          );
        uv.needsUpdate = true;
        geometries.set(key, geometry);
      }
      return geometry;
    },
    dispose() {
      for (const geometry of geometries.values()) geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
