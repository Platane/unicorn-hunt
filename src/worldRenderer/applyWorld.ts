import { quat, vec3 } from "gl-matrix";
import { createRenderer, ENTITY_STRIDE, MAX_ENTITIES } from "../renderer";
import { HUNTER_JUMP_DURATION } from "../game/state/stepper";
import type { WorldSnapshot } from "../game/state/types";
import type { Map } from "../game/state/map";
import { setTransformAt, setVec4At } from "../utils/transform";
import { createGroundGeometry, updateGroundGeometry } from "../renderer/geometries/ground";
import {
  SPRITE_BOX_COWBOY,
  SPRITE_BOX_NEMESIS,
  SPRITE_BOX_STAR,
  SPRITE_BOX_UNICORN,
} from "../renderer/geometries/sprite";

// scratch, reused on every call
const q = quat.identity(new Float32Array(4) as quat);
const v = new Float32Array(3) as vec3;

// row of the palette texture, see createColorPalette
const BUSH_COLOR_PALETTE = [0, 0, 0, 0];
const OBSTACLE_COLOR_PALETTE = [3, 0, 0, 0];

export const applyDecorum = (
  map: Map,
  range: [number, number],
  entities: { data: Float32Array; count: number; version: number },
) => {
  entities.count = 0;

  const add = (disks: [number, number, number][], palette: number[]) => {
    let a = 0;
    let b = disks.length;
    while (a < b) {
      const e = (a + b) >> 1;
      if (disks[e][1] < range[0]) a = e + 1;
      else b = e;
    }

    for (let i = a; disks[i] && disks[i][1] <= range[1]; i++) {
      if (entities.count >= MAX_ENTITIES) return;

      const o = entities.count * ENTITY_STRIDE;
      vec3.set(v, disks[i][0], disks[i][1], 0);
      setTransformAt(entities.data, o, v, q, disks[i][2]);
      // written every time: the buffer is reused, a stale palette would repaint
      // a bush as a hurdle
      setVec4At(entities.data, o + 16, palette);

      entities.count++;
    }
  };

  // obstacles first, so a full buffer never drops the thing you have to react to
  add(map.obstacles, OBSTACLE_COLOR_PALETTE);
  add(map.bushes, BUSH_COLOR_PALETTE);

  entities.version++;
};

export const applyGround = (
  map: Map,
  range: [number, number],
  geometry: ReturnType<typeof createGroundGeometry>,
) => {
  updateGroundGeometry(geometry, map, range);
  geometry.version++;
};

export const applyWorld = (
  snapshot: WorldSnapshot,
  renderer: ReturnType<typeof createRenderer>,
  playerId: string,
) => {
  const sprites = renderer.spritesEntities;
  sprites.count = 0;

  const setSprite = (position: vec3, spriteBox: number[], size = 1) => {
    const o = sprites.count * ENTITY_STRIDE;
    setTransformAt(sprites.data, o, position, q, size);
    setVec4At(sprites.data, o + 16, spriteBox);
    sprites.count++;
  };

  // snapshot.rainbowTrails.forEach((trail) => {
  //   trail.forEach((p) => {
  //     vec3.set(v, p[0], p[1], 0.002);
  //     setSprite(v, SPRITE_BOX_STAR, 0.5);
  //   });
  // });

  snapshot.hunters.forEach((p) => {
    const jumpHeight = p.jumping
      ? 1 - (2 * Math.abs(0.5 - p.jumping.remainingTime / HUNTER_JUMP_DURATION)) ** 2
      : 0;

    vec3.set(v, p.position[0], p.position[1], 0.01 + jumpHeight * 2);
    setSprite(v, p.id === playerId ? SPRITE_BOX_COWBOY : SPRITE_BOX_NEMESIS);

    if (p.riding) {
      vec3.set(v, p.position[0], p.position[1] - 0.2, 0.005 + jumpHeight * 2);
      setSprite(v, SPRITE_BOX_UNICORN);
    }
  });

  snapshot.unicorns.forEach((p) => {
    vec3.set(v, p.position[0], p.position[1], 0.01);
    setSprite(v, SPRITE_BOX_UNICORN);
  });

  sprites.version++;
};
