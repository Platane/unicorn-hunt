import { vec2, vec3 } from "gl-matrix";
import { PlayerInput, WorldSnapshot } from "./types";
import type { Map } from "./map";

// input angles are quantified to 16 positions, precompute them
const DIRECTIONS = Array.from({ length: 16 }, (_, i) =>
  vec2.fromValues(Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)),
);

export const STEP_DURATION = 1 / 20;

const PLAYER_RADIUS = 0.5;
const MAX_BUSH_RADIUS = 3;

const COLLISION_SAFETY_MARGIN = 0.2;

export const step = (
  map: Map,
  world: WorldSnapshot,
  inputs: (PlayerInput & { playerId: string })[],
) => {
  world = structuredClone(world);

  world.generation++;

  // treat inputs
  for (const input of inputs) {
    const player = world.players.find((p) => p.id === input.playerId);
    if (player) {
      vec2.copy(player.direction, DIRECTIONS[input.angle & 15]);
    }
  }

  for (const player of world.players)
    vec2.scaleAndAdd(player.position, player.position, player.direction, 1 * STEP_DURATION);

  // detect collisions
  const islands: Island[] = [];
  for (const player of world.players) {
    const circles = new Set<vec3>();

    let a = 0;
    let b = map.bushes.length;
    for (let k = 8; k--;) {
      const e = Math.floor((a + b) / 2);
      if (
        map.bushes[e][1] <
        player.position[1] - PLAYER_RADIUS - MAX_BUSH_RADIUS - COLLISION_SAFETY_MARGIN
      )
        a = e;
      else b = e;
    }

    while (
      map.bushes[a] &&
      map.bushes[a][1] <=
        player.position[1] + PLAYER_RADIUS + MAX_BUSH_RADIUS + COLLISION_SAFETY_MARGIN
    ) {
      if (
        vec2.squaredDistance(map.bushes[a], player.position) <
        (PLAYER_RADIUS + map.bushes[a][2] + COLLISION_SAFETY_MARGIN) ** 2
      )
        circles.add(map.bushes[a]);

      a++;
    }

    const players = new Set<{ position: vec2 }>();
    players.add(player);
    islands.push({ circles, players });
  }

  // merge islands
  for (let i = islands.length; i--;)
    for (let j = i; j--;) {
      if (
        islands[i].circles.values().some((c) => islands[j].circles.has(c)) ||
        islands[i].players
          .values()
          .some((p1) =>
            islands[j].players
              .values()
              .some(
                (p2) =>
                  vec2.squaredDistance(p1.position, p2.position) <
                  (PLAYER_RADIUS + PLAYER_RADIUS + COLLISION_SAFETY_MARGIN) ** 2,
              ),
          )
      ) {
        islands[j].circles = islands[j].circles.union(islands[i].circles);
        islands[j].players = islands[j].players.union(islands[i].players);
        islands.splice(i, 1);
        break;
      }
    }

  // resolve islands
  for (const { players, circles } of islands) {
    const ps = [...players.values()];

    for (let k = 8; k--;) {
      pen.fill(0);
      for (let i = ps.length; i--;) {
        for (const [bx, by, br] of circles) {
          const vx = bx - ps[i].position[0];
          let vy = by - ps[i].position[1];
          let l = Math.hypot(vx, vy);

          if (l === 0) {
            vy = 0.1;
            l = 0.1;
          }

          const p = l - br - PLAYER_RADIUS;

          if (p >= 0) continue;

          pen[i * 3 + 0] += (vx / l) * p;
          pen[i * 3 + 1] += (vy / l) * p;
          pen[i * 3 + 2]++;
        }

        for (let j = i; j--;) {
          const vx = ps[j].position[0] - ps[i].position[0];
          let vy = ps[j].position[1] - ps[i].position[1];
          let l = Math.hypot(vx, vy);

          if (l === 0) {
            vy = 0.1;
            l = 0.1;
          }

          const p = l - PLAYER_RADIUS - PLAYER_RADIUS;

          if (p >= 0) continue;

          pen[i * 3 + 0] += ((vx / l) * p) / 2;
          pen[i * 3 + 1] += ((vy / l) * p) / 2;
          pen[i * 3 + 2]++;

          pen[j * 3 + 0] += (-(vx / l) * p) / 2;
          pen[j * 3 + 1] += (-(vy / l) * p) / 2;
          pen[j * 3 + 2]++;
        }
      }

      if (pen.every((u) => u === 0)) break;

      for (let i = ps.length; i--;) {
        if (pen[i * 3 + 2]) {
          ps[i].position[0] += pen[i * 3 + 0] / pen[i * 3 + 2];
          ps[i].position[1] += pen[i * 3 + 1] / pen[i * 3 + 2];
        }
      }
    }
  }

  return world;
};

const pen = new Float32Array(64);

type Island = {
  players: Set<{ position: vec2 }>;
  circles: Set<vec3>;
};

export const createInitialState = (): WorldSnapshot => ({
  generation: 0,
  seed: 0 | (Math.random() * (1 << 16)),
  players: [],
});
