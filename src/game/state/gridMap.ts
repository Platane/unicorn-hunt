import { hashInt } from "../../utils/hash";
import { clamp } from "../../utils/math";

//
// TODO: rewrite this mess

//
// grid map
//
// everything is aligned on a grid of CELL sized cells. a cell is either
// entirely traversable, a wall, or a jumpable obstacle.
//
// generated row by row going up, so it can be streamed as the player climbs
// and anything derived from it comes out sorted by y.
//

export const CELL = 2; // twice the hunter diameter

export const OPEN = 0;
export const WALL = 1;
export const JUMPABLE = 2;

const COLS = 25; // odd, so there is a middle column
const HALF_COLS = COLS >> 1;

// the corridor leans left and right, alternating every SNAKE_PERIOD rows
const SNAKE_PERIOD = 14;
const SNAKE_AMPLITUDE = 5;

const CORRIDOR_MIN_HALF_WIDTH = 2;
const CORRIDOR_MAX_HALF_WIDTH = 3;

// caves are narrow twisting passages dug sideways out of the corridor. that is
// where the unicorns linger: going in is a detour, and the detour is the risk
const CAVE_CHANCE = 26; // in percent, per row
const CAVE_MIN_LENGTH = 8;
const CAVE_MAX_LENGTH = 22;
const CAVE_RETURN_CHANCE = 45; // in percent, a cave that loops back to the corridor
const CAVE_BRANCH_ODDS = 13; // one in N steps spawns a branch
const CAVE_MAX_DEPTH = 2;

// obstacles sitting in the corridor. they are always horizontal runs, so they
// face the hunter running up, and they always leave a gap to steer to
const OBSTACLE_CHANCE = 34; // in percent, per row
const OBSTACLE_SPACING = 3; // rows, so each one can be read and answered
const OBSTACLE_MAX_RUN = 3;
const OBSTACLE_JUMPABLE_CHANCE = 55; // in percent, otherwise it is a solid wall

const between = (h: number, min: number, max: number) => min + (h % (max - min + 1));

export const createGridMap = (seed: number, rows: number) => {
  const cells = new Uint8Array(rows * COLS).fill(WALL);

  // corridor center and half width, in cells, per row
  const centers = new Int32Array(rows);
  const halfWidths = new Int32Array(rows);

  const set = (c: number, r: number, cell: number) => {
    if (r >= 0 && r < rows && c >= -HALF_COLS && c <= HALF_COLS)
      cells[r * COLS + c + HALF_COLS] = cell;
  };

  //
  // carve the corridor. it moves at most one cell per row and is never
  // narrower than CORRIDOR_MIN_HALF_WIDTH, so consecutive rows always overlap
  // and the way up is always open
  let center = 0;

  for (let r = 0; r < rows; r++) {
    const h = hashInt(seed + r * 7919);

    const target = ((0 | (r / SNAKE_PERIOD)) % 2 ? 1 : -1) * SNAKE_AMPLITUDE;
    if (h % 3) center += Math.sign(target - center);

    const halfWidth = between(h >>> 8, CORRIDOR_MIN_HALF_WIDTH, CORRIDOR_MAX_HALF_WIDTH);

    center = clamp(-HALF_COLS + halfWidth + 1, HALF_COLS - halfWidth - 1, center);

    centers[r] = center;
    halfWidths[r] = halfWidth;

    for (let c = center - halfWidth; c <= center + halfWidth; c++) set(c, r, OPEN);
  }

  //
  // caves: a one cell wide walk digging away from the corridor, keeping its
  // heading most of the time and turning a quarter now and then. some of them
  // sprout branches, and some steer back to the corridor and become a loop.
  // where two walks cross they simply share the cell, which is the whole
  // network for free
  const digCave = (
    c: number,
    r: number,
    dc: number,
    dr: number,
    length: number,
    h: number,
    depth: number,
  ) => {
    const side = dc || (h & 1 ? 1 : -1);
    const returning = (h >>> 20) % 100 < CAVE_RETURN_CHANCE;

    for (let k = 0; k < length; k++) {
      set(c, r, OPEN);

      h = hashInt(h + k);

      if (returning && k * 2 > length) {
        // head home, so the cave comes out on the corridor further up
        const home = centers[clamp(0, rows - 1, r)];
        dc = Math.sign(home - c);
        dr = dc ? 0 : 1;
      } else if (h % 5 < 2) {
        // turn a quarter, never straight back
        if (dc) {
          dc = 0;
          dr = (h >>> 8) & 1 ? 1 : -1;
        } else {
          dc = side;
          dr = 0;
        }
      }

      c += dc;
      r += dr;

      if (depth < CAVE_MAX_DEPTH && (h >>> 12) % CAVE_BRANCH_ODDS === 0)
        digCave(
          c,
          r,
          dc ? 0 : side,
          dc ? ((h >>> 16) & 1 ? 1 : -1) : 0,
          between(h >>> 18, CAVE_MIN_LENGTH, CAVE_MAX_LENGTH) >> 1,
          hashInt(h + 104729),
          depth + 1,
        );
    }
  };

  for (let r = 1; r < rows; r++) {
    const h = hashInt(seed + r * 15485863);
    if (h % 100 >= CAVE_CHANCE) continue;

    const side = (h >>> 7) & 1 ? 1 : -1;
    const mouth = centers[r] + side * (halfWidths[r] + 1);

    digCave(mouth, r, side, 0, between(h >>> 8, CAVE_MIN_LENGTH, CAVE_MAX_LENGTH), h, 0);

    // a single cell gate at the mouth, so stepping off the corridor costs a jump
    if ((h >>> 16) & 1) set(mouth, r, JUMPABLE);
  }

  //
  // corridor obstacles: a horizontal run, always leaving a gap. either react
  // and jump the low ones, or steer around and lose ground
  let lastObstacleRow = -OBSTACLE_SPACING;

  for (let r = 2; r < rows; r++) {
    const h = hashInt(seed + r * 104729);
    if (h % 100 >= OBSTACLE_CHANCE) continue;
    if (r - lastObstacleRow < OBSTACLE_SPACING) continue;

    lastObstacleRow = r;

    const width = halfWidths[r] * 2 + 1;
    const run = Math.min(between(h >>> 8, 1, OBSTACLE_MAX_RUN), width - 1);

    // a run of 2 or more is anchored to one edge of the corridor, so the cells
    // it leaves open stay one contiguous span reaching the opposite edge. a
    // run floating in the middle would split the row in two, and the rows
    // above and below only meet one of the halves
    const from =
      run > 1
        ? (h >>> 16) & 1
          ? centers[r] - halfWidths[r]
          : centers[r] + halfWidths[r] - run + 1
        : centers[r] - halfWidths[r] + ((h >>> 16) % width);

    const cell = (h >>> 24) % 100 < OBSTACLE_JUMPABLE_CHANCE ? JUMPABLE : WALL;

    for (let c = from; c < from + run; c++) set(c, r, cell);
  }

  const get = (c: number, r: number) =>
    r < 0 || r >= rows || c < -HALF_COLS || c > HALF_COLS ? WALL : cells[r * COLS + c + HALF_COLS];

  return { seed, rows, cols: COLS, halfCols: HALF_COLS, cells, centers, halfWidths, get };
};

export type GridMap = ReturnType<typeof createGridMap>;

//
// bushes
//
// the grid stays the truth, bushes are only how a WALL cell gets filled in.
// each wall cell gets one core circle big enough that it overlaps its
// neighbours' cores, then a handful of satellites around it for the silhouette.
//
// a ball may cross a cell edge freely as long as the cell on the other side is
// a wall too: nothing is ever touched over there. it is only the open that has
// to be kept clear, and only OPEN_MARGIN of it may be eaten. so every ball is
// sized by how much room it has where it actually sits, which lets a ball
// lining the corridor stay tight on the corridor face and still grow fat
// backwards into the mass
//
// only the core is load bearing:
// - two cores of adjacent cells sit CELL + 2 * CORE_JITTER apart at
//   CORE_MIN_RADIUS, leaving a 0.7 gap. narrower than a hunter, so a wall is
//   never squeezed through
// - nothing eats more than OPEN_MARGIN of an open cell, so even a one cell wide
//   cave keeps CELL - 2 * OPEN_MARGIN = 1.5 of clearance
//
// satellites can only add, never open a hole, so they are free to be as messy
// as they like
//
// JUMPABLE cells get nothing here, they are obstacles and have their own list
//
const CORE_MIN_RADIUS = 0.85;
const CORE_JITTER = 0.2;

// how far a ball may reach into a cell that is not a wall
const OPEN_MARGIN = 0.25;

// nothing gets bigger than this, it is the stepper's MAX_BUSH_RADIUS, the
// window it searches for collisions
const MAX_RADIUS = 1.9;

const SATELLITE_MIN_RADIUS = 0.3;
const SATELLITE_MIN_DISTANCE = 0.3;
// a ball center never leaves its own cell, so it is always outside every
// neighbour's square and the room it has is a plain distance
const SATELLITE_MAX_DISTANCE = CELL / 2;

//
// the biggest ball allowed at (px, py), which lies inside wall cell (c, r)
//
const roomFor = (map: GridMap, c: number, r: number, px: number, py: number) => {
  let radius = MAX_RADIUS;

  for (let dc = -1; dc <= 1; dc++)
    for (let dr = -1; dr <= 1; dr++) {
      if (map.get(c + dc, r + dr) === WALL) continue;

      // distance from the point to that neighbour's square
      const dx = Math.max(0, Math.abs(px - (c + dc) * CELL) - CELL / 2);
      const dy = Math.max(0, Math.abs(py - (r + dr) * CELL) - CELL / 2);

      radius = Math.min(radius, OPEN_MARGIN + Math.sqrt(dx * dx + dy * dy));
    }

  return radius;
};

// hash to a float in [-1, 1[
const signed = (h: number) => (h & 511) / 256 - 1;

// hash to a float in [0, 1[
const unit = (h: number) => (h & 255) / 256;

export const createGridBushes = (map: GridMap) => {
  const bushes: [number, number, number][] = [];

  for (let r = 0; r < map.rows; r++)
    for (let c = -map.halfCols; c <= map.halfCols; c++) {
      if (map.get(c, r) !== WALL) continue;

      const x = c * CELL;
      const y = r * CELL;

      let h = hashInt(map.seed + r * map.cols + c + map.halfCols);

      const cx = x + signed(h) * CORE_JITTER;
      const cy = y + signed(h >>> 9) * CORE_JITTER;

      // the core is never squeezed below CORE_MIN_RADIUS: at CORE_JITTER off
      // center it still has 1.05 of room even facing straight into the open
      bushes.push([
        cx,
        cy,
        Math.max(
          CORE_MIN_RADIUS,
          Math.min(
            CORE_MIN_RADIUS + unit(h >>> 18) * (MAX_RADIUS - CORE_MIN_RADIUS),
            roomFor(map, c, r, cx, cy),
          ),
        ),
      ]);

      for (let k = 2 + ((h >>> 26) % 3); k--;) {
        h = hashInt(h);

        // a direction, normalized with sqrt rather than trig: sin and cos are
        // not bit identical across engines and these positions end up in the
        // collision, so every peer has to compute the very same map
        const ux = signed(h);
        const uy = signed(h >>> 9);
        const l = Math.sqrt(ux * ux + uy * uy) || 1;

        const distance =
          SATELLITE_MIN_DISTANCE +
          unit(h >>> 18) * (SATELLITE_MAX_DISTANCE - SATELLITE_MIN_DISTANCE);

        const sx = x + (ux / l) * distance;
        const sy = y + (uy / l) * distance;

        // whatever fits where it landed. a satellite pushed towards the mass
        // gets to be huge, one pushed towards the corridor stays a pebble
        bushes.push([
          sx,
          sy,
          Math.min(
            SATELLITE_MIN_RADIUS + unit(h >>> 24) * (MAX_RADIUS - SATELLITE_MIN_RADIUS),
            roomFor(map, c, r, sx, sy),
          ),
        ]);
      }
    }

  // the stepper and the renderer both binary search this by y
  bushes.sort((a, b) => a[1] - b[1]);

  return bushes;
};

//
// obstacles
//
// a short line of small balls across each JUMPABLE cell, so a run of cells
// reads as one continuous low hedge. they are never solid: the stepper only
// asks whether a hunter overlaps one, so these are zones, not colliders
//
// what a hunter feels is a ball grown by HUNTER_RADIUS, and consecutive zones
// along a run have to meet or there is a slot to walk it without ever being
// staggered. the balls sit OBSTACLE_SPREAD apart inside a cell and
// CELL - 2 * OBSTACLE_SPREAD apart across two cells, so the widest gap is 0.8,
// against two zones of at least 0.3 + 0.5 each. sealed with room to spare
//
// keeping the balls small is also what keeps the hurdle thin: the zone is
// 2 * (radius + 0.5) deep, and that is the whole cost of ploughing one
//
const OBSTACLE_BALLS = 3;
const OBSTACLE_SPREAD = 0.6;
const OBSTACLE_MIN_RADIUS = 0.3;
const OBSTACLE_MAX_RADIUS = 0.45;
// along the row only. jittering across it would push neighbours in a run
// further apart, which is exactly how a slot opens
const OBSTACLE_JITTER = 0.1;

export const createGridObstacles = (map: GridMap) => {
  const obstacles: [number, number, number][] = [];

  for (let r = 0; r < map.rows; r++)
    for (let c = -map.halfCols; c <= map.halfCols; c++) {
      if (map.get(c, r) !== JUMPABLE) continue;

      const h = hashInt(map.seed + 786433 + r * map.cols + c + map.halfCols);

      for (let k = 0; k < OBSTACLE_BALLS; k++) {
        const hk = hashInt(h + k);

        obstacles.push([
          c * CELL + (k - (OBSTACLE_BALLS - 1) / 2) * OBSTACLE_SPREAD,
          r * CELL + signed(hk) * OBSTACLE_JITTER,
          OBSTACLE_MIN_RADIUS + unit(hk >>> 18) * (OBSTACLE_MAX_RADIUS - OBSTACLE_MIN_RADIUS),
        ]);
      }
    }

  obstacles.sort((a, b) => a[1] - b[1]);

  return obstacles;
};

//
// debug view, one square per cell
//
export const createGridDebugCanvas = (
  map: GridMap,
  px = 9,
  rows = 80,
  field?: { get: (c: number, r: number) => number },
  traces?: [number, number][][],
  bushes?: [number, number, number][],
) => {
  const canvas = document.createElement("canvas");
  canvas.width = map.cols * px;
  canvas.height = rows * px;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // scale the heat map over the costs actually on screen
  let maxCost = 1;
  if (field)
    for (let r = 0; r < rows; r++)
      for (let c = -map.halfCols; c <= map.halfCols; c++) {
        const d = field.get(c, r);
        if (d < 0xffff) maxCost = Math.max(maxCost, d);
      }

  for (let r = 0; r < rows; r++)
    for (let c = -map.halfCols; c <= map.halfCols; c++) {
      const cell = map.get(c, r);

      if (field && cell !== WALL) {
        const d = field.get(c, r);
        ctx.fillStyle =
          d >= 0xffff
            ? "#c0392b"
            : `hsl(${260 - (d / maxCost) * 260},85%,${cell === JUMPABLE ? 75 : 50}%)`;
      } else {
        ctx.fillStyle = cell === OPEN ? "#e8e4d9" : cell === JUMPABLE ? "#e8913a" : "#2f6b3a";
      }

      // rows go up, draw them bottom first
      ctx.fillRect((c + map.halfCols) * px, (rows - 1 - r) * px, px - 1, px - 1);
    }

  // bushes, in world units, one cell being CELL of them
  if (bushes) {
    ctx.fillStyle = "rgba(20,90,40,.45)";
    ctx.strokeStyle = "rgba(10,50,20,.9)";
    ctx.lineWidth = 1;
    for (const [x, y, radius] of bushes) {
      if (y / CELL > rows) continue;
      ctx.beginPath();
      ctx.arc(
        (x / CELL + map.halfCols + 0.5) * px,
        (rows - 1 - y / CELL + 0.5) * px,
        (radius / CELL) * px,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
  }

  // bot paths, in cell coordinates
  traces?.forEach((trace, i) => {
    ctx.strokeStyle = `hsl(${(i * 67) % 360},95%,45%)`;
    ctx.lineWidth = px / 3;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.beginPath();
    trace.forEach(([c, r], k) => {
      const x = (c + map.halfCols + 0.5) * px;
      const y = (rows - 1 - r + 0.5) * px;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });

  return canvas;
};
