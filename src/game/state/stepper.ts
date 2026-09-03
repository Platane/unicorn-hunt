import { vec2, vec3 } from "gl-matrix";
import { PlayerInput, WorldSnapshot } from "./types";
import type { Map } from "./map";
import { hashInt } from "../../utils/hash";

// input angles are quantified to 16 positions, precompute them
const DIRECTIONS = Array.from({ length: 16 }, (_, i) =>
  vec2.fromValues(Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)),
);

export const STEP_DURATION = 1 / 20;
export const HUNTER_SPEED = 2;
export const WILD_UNICORN_SPEED = 0.6;
export const MOUNTED_UNICORN_SPEED = 3;
export const HUNTER_ON_TRAIL_SPEED = 3;
export const HUNTER_JUMP_DURATION = 16;

export const HUNTER_STAGGERED_SPEED = 0.35;
export const HUNTER_STAGGER_DURATION = 3;
export const TRAIL_RADIUS = 1.4;

export const UNICORN_RADIUS = 0.5;
export const HUNTER_RADIUS = 0.5;
export const MAX_BUSH_RADIUS = 2;
export const MAX_OBSTACLE_RADIUS = 1;

const TRAIL_POINT_DISTANCE = 1;

const COLLISION_SAFETY_MARGIN = 0.2;

//
// TODO
// - resolve unicorn collision with the same codepath as hunters
//    - do the hunter / unicorn collision first, so they get removed from the list
// - speed boost obstacle

export const step = (
  map: Map,
  world: WorldSnapshot,
  inputs: (PlayerInput & { playerId: string })[],
) => {
  world = structuredClone(world);

  world.generation++;

  // treat inputs
  for (const input of inputs) {
    const hunter = world.hunters.find((p) => p.id === input.playerId);
    if (hunter) {
      vec2.copy(hunter.direction, DIRECTIONS[input.angle & 15]);

      // no jumping out of a stagger: mistiming a hurdle costs you the next one
      if (input.jump && !hunter.jumping && !hunter.staggered)
        hunter.jumping = {
          remainingTime: HUNTER_JUMP_DURATION,
          direction: [...hunter.direction],
        };
    }
  }

  // move unicorn
  for (const unicorn of world.unicorns) {
    if ((unicorn.id + world.generation) % 100 === 0) {
      let a = ((hashInt(unicorn.id + world.generation) % 16) / 16) * Math.PI * 2 - Math.PI;

      if (unicorn.position[0] > 0 && unicorn.position[0] < 5 && a < 0) a = -a;
      if (unicorn.position[0] < 0 && unicorn.position[0] > -5 && a > 0) a = -a;

      unicorn.direction[0] = Math.sin(a);
      unicorn.direction[1] = Math.cos(a);
    }

    unicorn.position[0] += unicorn.direction[0] * WILD_UNICORN_SPEED * STEP_DURATION;
    unicorn.position[1] += unicorn.direction[1] * WILD_UNICORN_SPEED * STEP_DURATION;

    let a = 0;
    let b = map.bushes.length;
    for (let k = 8; k--;) {
      const e = Math.floor((a + b) / 2);
      if (map.bushes[e][1] < unicorn.position[1] - UNICORN_RADIUS - MAX_BUSH_RADIUS) a = e;
      else b = e;
    }

    while (
      map.bushes[a] &&
      map.bushes[a][1] <= unicorn.position[1] + UNICORN_RADIUS + MAX_BUSH_RADIUS
    ) {
      const vx = map.bushes[a][0] - unicorn.position[0];
      const vy = map.bushes[a][1] - unicorn.position[1];

      const l = Math.hypot(vx, vy);

      if (l <= 0) unicorn.position[1] += 1;
      else {
        const p = UNICORN_RADIUS + map.bushes[a][2] - l;
        if (p > 0) {
          unicorn.position[0] -= (vx / l) * p;
          unicorn.position[1] -= (vy / l) * p;
        }
      }
      a++;
    }
  }

  //
  // move hunters
  const islands: Island[] = [];
  for (const hunter of world.hunters) {
    if (hunter.riding && hunter.riding.remainingTime-- <= 0) hunter.riding = undefined;
    if (hunter.jumping && hunter.jumping.remainingTime-- <= 0) hunter.jumping = undefined;
    if (hunter.onTrail) hunter.onTrail--;
    if (hunter.staggered) hunter.staggered--;

    const speed = hunter.staggered
      ? HUNTER_STAGGERED_SPEED
      : hunter.riding
        ? MOUNTED_UNICORN_SPEED
        : hunter.onTrail
          ? HUNTER_ON_TRAIL_SPEED
          : HUNTER_SPEED;

    // move
    const direction = hunter.jumping?.direction ?? hunter.direction;
    vec2.scaleAndAdd(hunter.position, hunter.position, direction, speed * STEP_DURATION);

    // hunter leave a trail while riding
    if (hunter.riding) {
      const trail = world.rainbowTrails[hunter.riding.trailIndex];
      if (vec2.sqrDist(hunter.position, trail[1]) > TRAIL_POINT_DISTANCE ** 2) {
        trail.unshift(vec2.create());
      }
      trail[0][0] = hunter.position[0];
      trail[0][1] = hunter.position[1];
    }

    //
    // unicorn catch
    for (let i = world.unicorns.length; i--;) {
      if (
        !hunter.riding &&
        vec2.squaredDistance(hunter.position, world.unicorns[i].position) <
          (HUNTER_RADIUS + UNICORN_RADIUS / 2) ** 2
      ) {
        hunter.riding = { remainingTime: 300, trailIndex: world.rainbowTrails.length };

        world.rainbowTrails.push([[...hunter.position], [...hunter.position]]);
        world.unicorns.splice(i, 1);
      }
    }

    //
    // on Trail detection
    for (const trail of world.rainbowTrails) {
      for (const p of trail)
        if (vec2.squaredDistance(hunter.position, p) < TRAIL_RADIUS ** 2) {
          hunter.onTrail = 3;
        }
    }

    //
    // obstacle collision
    if (!hunter.jumping) {
      let a = 0;
      let b = map.obstacles.length;
      for (let k = 8; k--;) {
        const e = Math.floor((a + b) / 2);
        if (map.obstacles[e][1] < hunter.position[1] - HUNTER_RADIUS - MAX_OBSTACLE_RADIUS) a = e;
        else b = e;
      }

      while (
        map.obstacles[a] &&
        map.obstacles[a][1] <= hunter.position[1] + HUNTER_RADIUS + MAX_OBSTACLE_RADIUS
      ) {
        if (
          vec2.squaredDistance(map.obstacles[a], hunter.position) <
          (HUNTER_RADIUS / 2 + map.obstacles[a][2]) ** 2
        )
          hunter.staggered = HUNTER_STAGGER_DURATION;

        a++;
      }
    }

    //
    // island construction
    const circles = new Set<vec3>();

    let a = 0;
    let b = map.bushes.length;
    for (let k = 8; k--;) {
      const e = Math.floor((a + b) / 2);
      if (
        map.bushes[e][1] <
        hunter.position[1] - HUNTER_RADIUS - MAX_BUSH_RADIUS - COLLISION_SAFETY_MARGIN
      )
        a = e;
      else b = e;
    }

    while (
      map.bushes[a] &&
      map.bushes[a][1] <=
        hunter.position[1] + HUNTER_RADIUS + MAX_BUSH_RADIUS + COLLISION_SAFETY_MARGIN
    ) {
      if (
        vec2.squaredDistance(map.bushes[a], hunter.position) <
        (HUNTER_RADIUS + map.bushes[a][2] + COLLISION_SAFETY_MARGIN) ** 2
      )
        circles.add(map.bushes[a]);

      a++;
    }

    const hunters = new Set<{ position: vec2 }>();
    hunters.add(hunter);
    islands.push({ circles, hunters });
  }

  // merge islands
  for (let i = islands.length; i--;)
    for (let j = i; j--;) {
      if (
        islands[i].circles.values().some((c) => islands[j].circles.has(c)) ||
        islands[i].hunters
          .values()
          .some((p1) =>
            islands[j].hunters
              .values()
              .some(
                (p2) =>
                  vec2.squaredDistance(p1.position, p2.position) <
                  (HUNTER_RADIUS + HUNTER_RADIUS + COLLISION_SAFETY_MARGIN) ** 2,
              ),
          )
      ) {
        islands[j].circles = islands[j].circles.union(islands[i].circles);
        islands[j].hunters = islands[j].hunters.union(islands[i].hunters);
        islands.splice(i, 1);
        break;
      }
    }

  // resolve islands
  for (const { hunters, circles } of islands) {
    const ps = [...hunters.values()];

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

          const p = l - br - HUNTER_RADIUS;

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

          const p = l - HUNTER_RADIUS - HUNTER_RADIUS;

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
  hunters: Set<{ position: vec2 }>;
  circles: Set<vec3>;
};

export const createInitialState = (): WorldSnapshot => ({
  generation: 0,
  seed: 0 | (Math.random() * (1 << 16)),
  hunters: [],
  rainbowTrails: [],
  unicorns: [
    { id: 13132, position: new Float32Array([0, 0]), direction: [1, 0] },
    { id: 313132, position: new Float32Array([0, 2]), direction: [1, 0] },
    { id: 1443132, position: new Float32Array([0, 3]), direction: [1, 0] },
    { id: 1432, position: new Float32Array([0, 6]), direction: [1, 0] },
    ...Array.from({ length: 10 }, (_, i) => ({
      id: 0 | (i * 7777),
      position: new Float32Array([2 + Math.random() * 10, i * 15 + Math.random() * 20]),
      direction: [0, 1],
    })),
  ],
});
