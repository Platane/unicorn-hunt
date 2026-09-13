import "../global.css";
import { createWorldRenderer } from "../worldRenderer/createWorldRenderer";
import { createMap } from "../game/state/map";
import { OPEN } from "../game/state/gridMap";
import { mat4 } from "../utils/glMatrix";
import type { WorldSnapshot } from "../game/state/types";

// static scene for screenshots, not part of the game bundle

const SEED = 1;
const RIDER_Y = 30;
const CAMERA_DISTANCE = 6;
const CAMERA_TARGET_BEHIND = 1.5;
const CAMERA_ANGLE = Math.PI / 9;

const map = createMap(SEED);

// corridor center at a world y, so the scene sits in the open
const centerX = (y: number) => {
  const row = map.grid[Math.floor(y / 2)];
  const open = row.flatMap((cell, c) => (cell === OPEN ? [c] : []));
  return ((open[0] + open[open.length - 1] + 1) / 2 - row.length / 2) * 2;
};

const at = (dx: number, y: number) => new Float32Array([centerX(y) + dx, y]);
const up = () => new Float32Array([0, 1]);

// gentle curve, 0 at the rider
const trailX = (behind: number) => Math.sin(behind * 0.2) * 0.6;

const world: WorldSnapshot = {
  seed: SEED,
  generation: 0,
  hunters: [
    {
      id: "rider",
      p: at(0, RIDER_Y),
      d: up(),
      riding: { remainingTime: 300, trailIndex: 0, unicornId: 0 },
    },
    { id: "a", p: at(trailX(3), RIDER_Y - 3), d: up(), onTrail: 3 },
  ],
  unicorns: [{ id: 1, p: at(-2, RIDER_Y + 5), d: up() }],
  rainbowTrails: [Array.from({ length: 16 }, (_, i) => at(trailX(i), RIDER_Y - i))],
};

// camera at 45°, on the side of the rider, looking at the unicorn flank
const lookAt = mat4.lookAt;
mat4.lookAt = (out) => {
  const x = world.hunters[0].p[0];
  const y = world.hunters[0].p[1] - CAMERA_TARGET_BEHIND;
  return lookAt(
    out,
    [
      x + CAMERA_DISTANCE * Math.cos(CAMERA_ANGLE),
      y,
      CAMERA_DISTANCE * Math.sin(CAMERA_ANGLE) + 0.6,
    ],
    [x, y, 0.6],
    [0, 0, 1],
  );
};

const state = {
  snapshots: [world],
  currentGeneration: 0,
  hostLatency: 0,
  map,
} as any;

const worldRenderer = createWorldRenderer(c as HTMLCanvasElement);

const loop = () => {
  requestAnimationFrame(loop);
  worldRenderer.step(state, "rider");
};
loop();
