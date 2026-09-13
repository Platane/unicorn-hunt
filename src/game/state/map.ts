import { createGridMap } from "./gridMap";
import { createBushes } from "./bushes";
import { createObstacles } from "./obstacles";

export const RACE_LENGTH = 200;

export const createMap = (seed: number) => {
  const grid = createGridMap(seed);

  return {
    seed,
    grid,
    bushes: createBushes(grid, seed).sort((a, b) => a[1] - b[1]),
    obstacles: createObstacles(grid, seed).sort((a, b) => a[1] - b[1]),
  };
};

export type Map = ReturnType<typeof createMap>;
