import { PlayerInput, WorldSnapshot } from "../types";
import type { Map } from "../map";
import {
  forEachInRangeY,
  HUNTER_RADIUS,
  MAX_BUSH_RADIUS,
  MAX_OBSTACLE_RADIUS,
  TRAIL_RADIUS,
} from "../stepper";
import { vec2 } from "../../../utils/glMatrix";
import { hashString } from "../../../utils/hash";

const GRID_HEIGHT = 60;
const GRID_RESOLUTION = 0.6;
const GRID_WIDTH = 30 / GRID_RESOLUTION;

const snapToGrid = (v: number) => Math.floor(v / GRID_RESOLUTION) * GRID_RESOLUTION;

const isOutside = (x: number, y: number) => x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT;

export const createBot = (playerId: string, registerInput: (i: PlayerInput) => void) => {
  let gridX = 0;
  let gridY = 0;
  const grid = Array.from({ length: GRID_HEIGHT * GRID_WIDTH }, () => ({ cost: 0, weight: 0 }));

  let rebuildTimer = -(hashString(playerId) % 10);
  let angle = 4;

  const markDisk = (x: number, y: number, r: number, cost: number) => {
    const x0 = Math.max(0, Math.floor((x - r - gridX) / GRID_RESOLUTION));
    const x1 = Math.min(GRID_WIDTH - 1, Math.floor((x + r - gridX) / GRID_RESOLUTION));
    const y0 = Math.max(0, Math.floor((y - r - gridY) / GRID_RESOLUTION));
    const y1 = Math.min(GRID_HEIGHT - 1, Math.floor((y + r - gridY) / GRID_RESOLUTION));

    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const dx = gridX + (gx + 0.5) * GRID_RESOLUTION - x;
        const dy = gridY + (gy + 0.5) * GRID_RESOLUTION - y;
        if (dx * dx + dy * dy < r * r) {
          const cell = grid[gx * GRID_HEIGHT + gy];
          cell.cost = cost;
        }
      }
  };

  const rebuildGrid = (map: Map, world: WorldSnapshot, cx: number, cy: number) => {
    gridX = cx;
    gridY = cy;

    for (const cell of grid) {
      cell.cost = 1;
      cell.weight = Infinity;
    }

    const maxY = cy + GRID_HEIGHT * GRID_RESOLUTION;

    for (const trail of world.rainbowTrails)
      for (const p of trail) markDisk(p[0], p[1], TRAIL_RADIUS, 0.3);

    forEachInRangeY(
      map.bushes,
      cy - MAX_BUSH_RADIUS - HUNTER_RADIUS / 2,
      maxY + MAX_BUSH_RADIUS + HUNTER_RADIUS / 2,
      (o) => markDisk(o[0], o[1], o[2] + HUNTER_RADIUS / 2, 1.5),
    );

    forEachInRangeY(
      map.obstacles,
      cy - MAX_OBSTACLE_RADIUS - HUNTER_RADIUS / 2,
      maxY + MAX_OBSTACLE_RADIUS + HUNTER_RADIUS / 2,
      (o) => markDisk(o[0], o[1], o[2] + HUNTER_RADIUS / 2, 2),
    );

    forEachInRangeY(
      map.bushes,
      cy - MAX_BUSH_RADIUS - HUNTER_RADIUS / 2,
      maxY + MAX_BUSH_RADIUS + HUNTER_RADIUS / 2,
      (o) => markDisk(o[0], o[1], o[2], Infinity),
    );

    {
      const changed = new Set<number>();
      for (let y = GRID_HEIGHT; y-- && changed.size === 0;) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          const id = x * GRID_HEIGHT + y;
          if (grid[id].weight == grid[id].cost) continue;
          grid[id].weight = grid[id].cost;
          changed.add(id);
        }
      }

      while (changed.size > 0) {
        const o = [...changed];
        changed.clear();
        for (const id of o) {
          const x = 0 | (id / GRID_HEIGHT);
          const y = id % GRID_HEIGHT;

          for (const [dx, dy] of around) {
            const ex = x + dx;
            const ey = y + dy;
            if (isOutside(ex, ey)) continue;
            const eid = ex * GRID_HEIGHT + ey;
            const weight = grid[id].weight + grid[eid].cost;
            if (weight < grid[eid].weight) {
              grid[eid].weight = weight;
              changed.add(eid);
            }
          }
        }
      }
    }
  };

  const getLowestNeighbour = (id: number) => {
    const x = 0 | (id / GRID_HEIGHT);
    const y = id % GRID_HEIGHT;

    let best = id;
    for (const [dx, dy] of around) {
      const ex = x + dx;
      const ey = y + dy;
      if (isOutside(ex, ey)) continue;
      const eid = ex * GRID_HEIGHT + ey;
      if (grid[eid].weight < grid[best].weight) best = eid;
    }

    return best;
  };

  const getCellCenter = (out: vec2, id: number) => {
    out[0] = gridX + ((0 | (id / GRID_HEIGHT)) + 0.5) * GRID_RESOLUTION;
    out[1] = gridY + ((id % GRID_HEIGHT) + 0.5) * GRID_RESOLUTION;
    return out;
  };

  const step = (map: Map, world: WorldSnapshot) => {
    const player = world.hunters.find((h) => h.id === playerId);

    if (!player) return;

    if (rebuildTimer-- <= 0) {
      rebuildTimer += 20;
      rebuildGrid(
        map,
        world,
        snapToGrid(player.p[0] - (GRID_WIDTH * GRID_RESOLUTION) / 2),
        snapToGrid(player.p[1] - 3),
      );
    }

    const x = Math.floor((player.p[0] - gridX) / GRID_RESOLUTION);
    const y = Math.floor((player.p[1] - gridY) / GRID_RESOLUTION);

    if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
      rebuildTimer = -10;
      return;
    }

    const next = getLowestNeighbour(x * GRID_HEIGHT + y);
    const nextNext = getLowestNeighbour(next);

    getCellCenter(a, next);
    getCellCenter(b, nextNext);

    const t =
      1 -
      Math.min(
        1,
        (Math.max(0, Math.abs(player.p[0] - a[0]) - GRID_RESOLUTION / 2) +
          Math.max(0, Math.abs(player.p[1] - a[1]) - GRID_RESOLUTION / 2)) /
          GRID_RESOLUTION,
      );
    vec2.lerp(target, a, b, t);

    const newAngle = Math.round(
      (Math.atan2(target[1] - player.p[1], target[0] - player.p[0]) / (Math.PI * 2)) * 16,
    );

    if (angle !== newAngle) {
      angle = newAngle;
      registerInput({ angle });
    }
  };

  return step;
};

const a = new Float32Array(2);
const b = new Float32Array(2);
const target = new Float32Array(2);

const around = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
