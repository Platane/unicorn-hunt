import {
  createGridMap,
  createGridBushes,
  createGridObstacles,
  createGridDebugCanvas,
} from "./gridMap";

// how far up the track goes, in cells. one cell is CELL world units
const MAP_ROWS = 200;

export const createMap = (seed: number) => {
  const grid = createGridMap(seed, MAP_ROWS);

  return {
    seed,
    grid,
    bushes: createGridBushes(grid),
    obstacles: createGridObstacles(grid),
  };
};

export type Map = ReturnType<typeof createMap>;

export const createDebugMap = (map: Map) =>
  createGridDebugCanvas(map.grid, 9, 80, undefined, undefined, map.bushes);
