import { hashInt } from "../../utils/hash";
import { BLOCKING, OPEN, WALL } from "./gridMap";

const TRIES = 4;
const RADIUS = [0.3, 1];
const MARGIN = 8;
const BLOCKING_LINE = 3;
const BLOCKING_RADIUS = 0.3;
const BLOCKING_OVERFLOW = 0.2;
const BLOCKING_Y_JITTER = 0.1;
const GRID_CELL_SIZE = 2;

export const random = (s: number) => (hashInt(s) % 1000) / 1000;

export const toWorld = (
  grid: number[][],
  x: number,
  y: number,
  radius: number,
): [number, number, number] => [
  (x - grid[0].length / 2) * GRID_CELL_SIZE,
  y * GRID_CELL_SIZE,
  radius * GRID_CELL_SIZE,
];

const get = (grid: number[][], c: number, r: number) => {
  if (r < 0) return OPEN;
  return grid[r]?.[c] ?? WALL;
};

const fitsInWall = (grid: number[][], x: number, y: number, radius: number) => {
  for (let r = Math.floor(y - radius); r <= Math.floor(y + radius); r++)
    for (let c = Math.floor(x - radius); c <= Math.floor(x + radius); c++) {
      const dx = x - Math.max(c, Math.min(c + 1, x));
      const dy = y - Math.max(r, Math.min(r + 1, y));
      if (dx * dx + dy * dy < radius * radius && get(grid, c, r) !== WALL) return false;
    }
  return true;
};

export const createBushes = (grid: number[][], seed: number) => {
  const bushes: [number, number, number][] = [];
  let s = seed;

  for (let r = 0; r < grid.length + MARGIN; r++)
    for (let c = -MARGIN; c < grid[0].length + MARGIN; c++) {
      const cell = get(grid, c, r);

      if (cell === BLOCKING)
        for (let k = 0; k < BLOCKING_LINE; k++) {
          const x =
            c - BLOCKING_OVERFLOW + ((k + 0.5) / BLOCKING_LINE) * (1 + 2 * BLOCKING_OVERFLOW);
          const y = r + 0.5 + (random(s++) * 2 - 1) * BLOCKING_Y_JITTER;
          bushes.push(toWorld(grid, x, y, BLOCKING_RADIUS));
        }

      if (cell !== WALL) continue;

      for (let tries = 0, found = 0; tries < TRIES || found === 0; tries++) {
        const x = c + random(s++);
        const y = r + random(s++);
        const radius = RADIUS[0] + random(s++) * (RADIUS[1] - RADIUS[0]);

        if (fitsInWall(grid, x, y, radius)) {
          bushes.push(toWorld(grid, x, y, radius));
          found++;
        }
      }
    }

  return bushes;
};
