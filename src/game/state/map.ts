import { vec2 } from "gl-matrix";
import { hashInt } from "../../utils/hash";
import { clamp } from "../../utils/math";

export const createMap = (seed: number) => {
  const bushes: [number, number, number][] = [];

  const rand = () => {
    seed = hashInt(seed);
    return seed;
  };

  const controlPoints = [new Float32Array(2), new Float32Array(2)];

  while (controlPoints.length < 10) {
    const p0 = controlPoints.at(-1)!;

    const p = new Float32Array(2);
    const dy = 20 + (rand() % 20);

    const cx = ((0 | (p0[1] / 30)) % 2) * 2 - 1;
    const dx = (((rand() % 20) - 10) / 10) * 5 + cx * 4.2;

    p[0] = p0[0] + dx;
    p[1] = p0[1] + dy;

    if (Math.abs(p[0]) > 10) p[0] *= 0.9;
    p0[0] = clamp(p0[0], -10, 10);

    controlPoints.push(p);
  }

  const getPath = (out: [number, number] | vec2, k: number) => {
    k *= controlPoints.length - 3;

    const u = 0 | k;
    const t = k % 1;

    const m0x = (controlPoints[u + 0][0] + controlPoints[u + 1][0]) / 2;
    const m1x = (controlPoints[u + 1][0] + controlPoints[u + 2][0]) / 2;
    out[0] = m0x * (1 - t) * (1 - t) + controlPoints[u + 1][0] * 2 * (1 - t) * t + m1x * t * t;

    const m0y = (controlPoints[u + 0][1] + controlPoints[u + 1][1]) / 2;
    const m1y = (controlPoints[u + 1][1] + controlPoints[u + 2][1]) / 2;
    out[1] = m0y * (1 - t) * (1 - t) + controlPoints[u + 1][1] * 2 * (1 - t) * t + m1y * t * t;
  };

  const out = new Float32Array(2) as vec2;
  const getSqDistanceFromPath = (p: [number, number] | vec2) => {
    let a = 0,
      b = 1;

    for (let k = 12; k--;) {
      const e = (a + b) / 2;
      getPath(out, e);
      if (out[1] > p[1]) b = e;
      else a = e;
    }

    return vec2.squaredDistance(out, p);
  };

  for (let y = controlPoints[0][1]; y <= controlPoints.at(-1)![1]; y += 0.1) {
    const o = (2 + (4 * (rand() % 16)) / 16) ** 3;
    const p = new Float32Array(3) as vec2;
    p[1] = y;
    do {
      p[0] = ((rand() % 64) / 64) * 50 - 25;
    } while (getSqDistanceFromPath(p) < o);

    p[2] = (1 + (rand() % 3) / 2) / 2;

    bushes.push(p as any);
  }

  return { seed, getPath, bushes };
};

export type Map = ReturnType<typeof createMap>;

export const createDebugMap = (map: Map) => {
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 800;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 9999, 9999);

  ctx.translate(canvas.width / 2, 0);
  ctx.scale(5, 5);
  ctx.translate(0, 10);

  ctx.fillStyle = "#eee";
  ctx.fillRect(-10, 0, 20, 9999);

  const u = [0, 0];
  map.getPath(u as any, 0);
  ctx.beginPath();
  ctx.moveTo(u[0], u[1]);
  for (let k = 0; k <= 1; k += 0.0001) {
    map.getPath(u as any, k);
    ctx.lineTo(u[0], u[1]);
  }
  ctx.lineCap = "round";
  ctx.lineWidth = 0.1;
  ctx.stroke();

  for (const b of map.bushes) {
    ctx.beginPath();
    ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas;
};

const c = createDebugMap(createMap(Math.random() * 123));
document.body.appendChild(c);
c.style.position = "absolute";
c.style.top = "0";
c.style.right = "0";
