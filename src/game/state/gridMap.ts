import { hashInt } from "../../utils/hash";
import { lerp } from "../../utils/math";

export const OPEN = 0;
export const WALL = 1;
export const JUMPABLE = 2;
export const BLOCKING = 3; // = same as wall but no constructed the same way

const MAP_WIDTH = 15;
const MAP_HEIGHT = 1000;

const CORRIDOR_SEGMENT_LENGTH = [8, 16];
const CORRIDOR_SEGMENT_WIDTH = [3, 6];
const CORRIDOR_SEGMENT_X = [2, MAP_WIDTH - 2];

export const createGridMap = (seed: number) => {
  const grid: number[][] = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(WALL));

  const rand = (max: number) => {
    seed = hashInt(seed + 111);
    return seed % max;
  };

  //
  // corridor carving
  //
  let x = MAP_WIDTH / 2;
  let width = 6;
  for (let i = 0, y = 0; y < MAP_HEIGHT; i++) {
    const nextX = lerp(CORRIDOR_SEGMENT_X[0], CORRIDOR_SEGMENT_X[1], rand(100) / 100);
    const nextWidth = lerp(CORRIDOR_SEGMENT_WIDTH[0], CORRIDOR_SEGMENT_WIDTH[1], rand(100) / 100);
    const length =
      CORRIDOR_SEGMENT_LENGTH[0] + rand(CORRIDOR_SEGMENT_LENGTH[1] - CORRIDOR_SEGMENT_LENGTH[0]);

    for (let k = 0; k < length && y < MAP_HEIGHT; k++, y++) {
      const cx = x + ((nextX - x) * k) / length;
      const w = width + ((nextWidth - width) * k) / length;

      for (let c = 0; c < MAP_WIDTH; c++) if (Math.abs(c + 0.5 - cx) < w / 2) grid[y][c] = OPEN;
    }

    x = nextX;
    width = nextWidth;
  }

  //
  // obstacle rows
  //
  let y = 5;
  while (y < MAP_HEIGHT) {
    const from = grid[y].indexOf(OPEN);
    const to = grid[y].lastIndexOf(OPEN);
    const parts = Math.min(to - from + 1, 3 + rand(3));

    const results = [OPEN];
    while (results.length < parts) results.push([OPEN, JUMPABLE, BLOCKING][rand(3)]);

    for (let i = parts; i--;) {
      const j = rand(i + 1);
      [results[i], results[j]] = [results[j], results[i]];
    }

    for (let c = from; c <= to; c++)
      grid[y][c] = results[Math.floor(((c - from) * parts) / (to - from + 1))];

    y += 2 + rand(2);
  }

  return grid;
};
