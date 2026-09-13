import { JUMPABLE } from "./gridMap";
import { random, toWorld } from "./bushes";

const LINE = 3;
const RADIUS = [0.15, 0.22];

export const createObstacles = (grid: number[][], seed: number) => {
  const obstacles: [number, number, number][] = [];
  let s = seed;

  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== JUMPABLE) continue;

      for (let k = 0; k < LINE; k++) {
        const radius = RADIUS[0] + random(s++) * (RADIUS[1] - RADIUS[0]);
        obstacles.push(toWorld(grid, c + (k + 0.5) / LINE, r + 0.5, radius));
      }
    }

  return obstacles;
};
