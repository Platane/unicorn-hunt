import { vec2, vec3 } from "../../utils/glMatrix";
import { PlayerInput, WorldSnapshot } from "./types";
import type { Map } from "./map";
import { hashInt } from "../../utils/hash";
import { lerp } from "../../utils/math";

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

export const HUNTER_STAGGERED_SPEED = 0.8;
export const HUNTER_STAGGER_DURATION = 3;
export const TRAIL_RADIUS = 0.8;

export const HUNTER_RADIUS = 0.5;
export const MAX_BUSH_RADIUS = 2;
export const MAX_OBSTACLE_RADIUS = 1;

const TRAIL_POINT_DISTANCE = 1;

const UNICORN_SPAWN_INTERVAL = 5;
const UNICORN_SPAWN_CHECK_ZONE = [-4, 30];
const UNICORN_SPAWN_ZONE = [18, 30];
const UNICORNS_PER_PLAYER = 0.8;

const COLLISION_SAFETY_MARGIN = 0.2;

//
// TODO
// - speed boost obstacle
// - rubber banding

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
      vec2.copy(hunter.d, DIRECTIONS[input.angle & 15]);

      // no jumping out of a stagger: mistiming a hurdle costs you the next one
      if (input.jump && !hunter.jumping && !hunter.staggered)
        hunter.jumping = {
          remainingTime: HUNTER_JUMP_DURATION,
          d: [...hunter.d],
        };
    }
  }

  // move unicorn
  for (const unicorn of world.unicorns) {
    if ((unicorn.id + world.generation) % 100 === 0) {
      let a = ((hashInt(unicorn.id + world.generation) % 16) / 16) * Math.PI * 2 - Math.PI;

      if (unicorn.p[0] > 0 && unicorn.p[0] < 5 && a < 0) a = -a;
      if (unicorn.p[0] < 0 && unicorn.p[0] > -5 && a > 0) a = -a;

      unicorn.d[0] = Math.sin(a);
      unicorn.d[1] = Math.cos(a);
    }

    unicorn.p[0] += unicorn.d[0] * WILD_UNICORN_SPEED * STEP_DURATION;
    unicorn.p[1] += unicorn.d[1] * WILD_UNICORN_SPEED * STEP_DURATION;
  }

  //
  // spawn unicorns ahead of the first player
  if (world.generation % UNICORN_SPAWN_INTERVAL === 0 && world.hunters.length) {
    const firstY = Math.max(...world.hunters.map((h) => h.p[1]));

    while (
      world.unicorns.filter(
        (u) =>
          u.p[1] > firstY - UNICORN_SPAWN_CHECK_ZONE[0] &&
          u.p[1] < firstY + UNICORN_SPAWN_CHECK_ZONE[1],
      ).length <
      world.hunters.length * UNICORNS_PER_PLAYER
    )
      world.unicorns.push({
        id: world.generation + world.unicorns.length * 12313,
        p: new Float32Array([
          0,
          firstY +
            lerp(
              UNICORN_SPAWN_ZONE[0],
              UNICORN_SPAWN_ZONE[1],
              (hashInt(world.generation + world.unicorns.length) % 10) / 10,
            ),
        ]),
        d: [0, 1],
      });
  }

  //
  // move hunters
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
    const facing = hunter.jumping?.d ?? hunter.d;
    vec2.scaleAndAdd(hunter.p, hunter.p, facing, speed * STEP_DURATION);

    // hunter leave a trail while riding
    if (hunter.riding) {
      const trail = world.rainbowTrails[hunter.riding.trailIndex];
      if (vec2.sqrDist(hunter.p, trail[1]) > TRAIL_POINT_DISTANCE ** 2) {
        trail.unshift(new Float32Array(2));
      }
      trail[0][0] = hunter.p[0];
      trail[0][1] = hunter.p[1];
    }

    //
    // unicorn catch
    for (let i = world.unicorns.length; i--;) {
      if (
        !hunter.riding &&
        vec2.sqrDist(hunter.p, world.unicorns[i].p) < (HUNTER_RADIUS + HUNTER_RADIUS) ** 2
      ) {
        hunter.riding = {
          remainingTime: 300,
          unicornId: world.unicorns[i].id,
          trailIndex: world.rainbowTrails.length,
        };

        world.rainbowTrails.push([[...hunter.p], [...hunter.p]]);
        world.unicorns.splice(i, 1);
      }
    }

    //
    // on Trail detection
    for (const trail of world.rainbowTrails) {
      for (const p of trail)
        if (vec2.sqrDist(hunter.p, p) < TRAIL_RADIUS ** 2) {
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
        if (map.obstacles[e]?.[1] < hunter.p[1] - HUNTER_RADIUS - MAX_OBSTACLE_RADIUS) a = e;
        else b = e;
      }

      while (
        map.obstacles[a] &&
        map.obstacles[a][1] <= hunter.p[1] + HUNTER_RADIUS + MAX_OBSTACLE_RADIUS
      ) {
        if (
          vec2.sqrDist(map.obstacles[a], hunter.p) <
          (HUNTER_RADIUS / 2 + map.obstacles[a][2]) ** 2
        )
          hunter.staggered = HUNTER_STAGGER_DURATION;

        a++;
      }
    }
  }

  //
  // build collision island
  const islands: {
    bodies: Set<{ p: vec2 }>;
    circles: Set<vec3>;
  }[] = [];
  for (const body of [...world.hunters, ...world.unicorns]) {
    const circles = new Set<vec3>();

    let a = 0;
    let b = map.bushes.length;
    for (let k = 8; k--;) {
      const e = Math.floor((a + b) / 2);
      if (map.bushes[e][1] < body.p[1] - HUNTER_RADIUS - MAX_BUSH_RADIUS - COLLISION_SAFETY_MARGIN)
        a = e;
      else b = e;
    }

    while (
      map.bushes[a] &&
      map.bushes[a][1] <= body.p[1] + HUNTER_RADIUS + MAX_BUSH_RADIUS + COLLISION_SAFETY_MARGIN
    ) {
      if (
        vec2.sqrDist(map.bushes[a], body.p) <
        (HUNTER_RADIUS + map.bushes[a][2] + COLLISION_SAFETY_MARGIN) ** 2
      )
        circles.add(map.bushes[a]);

      a++;
    }

    islands.push({ circles, bodies: new Set([body]) });
  }

  // merge islands
  for (let i = islands.length; i--;)
    for (let j = i; j--;) {
      if (
        islands[i].circles.values().some((c) => islands[j].circles.has(c)) ||
        islands[i].bodies
          .values()
          .some((p1) =>
            islands[j].bodies
              .values()
              .some(
                (p2) =>
                  vec2.sqrDist(p1.p, p2.p) <
                  (HUNTER_RADIUS + HUNTER_RADIUS + COLLISION_SAFETY_MARGIN) ** 2,
              ),
          )
      ) {
        islands[j].circles = islands[j].circles.union(islands[i].circles);
        islands[j].bodies = islands[j].bodies.union(islands[i].bodies);
        islands.splice(i, 1);
        break;
      }
    }

  // resolve islands
  for (const { bodies, circles } of islands) {
    const ps = [...bodies.values()];

    for (let k = 8; k--;) {
      pen.fill(0);
      for (let i = ps.length; i--;) {
        for (const [bx, by, br] of circles) {
          const vx = bx - ps[i].p[0];
          let vy = by - ps[i].p[1];
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
          const vx = ps[j].p[0] - ps[i].p[0];
          let vy = ps[j].p[1] - ps[i].p[1];
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
          ps[i].p[0] += pen[i * 3 + 0] / pen[i * 3 + 2];
          ps[i].p[1] += pen[i * 3 + 1] / pen[i * 3 + 2];
        }
      }
    }
  }

  return world;
};

const pen = new Float32Array(3 * 64);

export const createInitialState = (): WorldSnapshot => ({
  generation: 0,
  seed: 0 | (Math.random() * (1 << 16)),
  hunters: [],
  rainbowTrails: [],
  unicorns: [{ id: 123, p: [0, 5], d: [0, -1] }],
});
