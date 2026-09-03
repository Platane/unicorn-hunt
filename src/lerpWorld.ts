import { vec2 } from "gl-matrix";
import { lerp } from "./utils/math";
import type { Hunter, Unicorn, WorldSnapshot } from "./game/state/types";

const lerpVec2 = (a: vec2, b: vec2, t: number) => vec2.lerp(new Float32Array(2) as vec2, a, b, t);

const lerpDirection = (a: vec2, b: vec2, t: number) => {
  const d = lerpVec2(a, b, t);
  vec2.normalize(d, d);
  return d;
};

export const lerpWorld = (
  aWorld: WorldSnapshot,
  bWorld: WorldSnapshot,
  t: number,
): WorldSnapshot => {
  const rainbowTrails = [...bWorld.rainbowTrails];

  const hunters = bWorld.hunters.map((bHunter): Hunter => {
    const aHunter = aWorld.hunters.find((h) => h.id === bHunter.id);
    if (!aHunter) return bHunter;

    return {
      ...bHunter,
      position: lerpVec2(aHunter.position, bHunter.position, t),
      direction: lerpDirection(aHunter.direction, bHunter.direction, t),
      jumping:
        bHunter.jumping && aHunter.jumping
          ? {
              ...bHunter.jumping,
              remainingTime: lerp(aHunter.jumping.remainingTime, bHunter.jumping.remainingTime, t),
            }
          : bHunter.jumping,
    };
  });

  for (const hunter of hunters)
    if (hunter.riding) {
      const tr = rainbowTrails[hunter.riding.trailIndex].slice();
      tr.shift();
      tr.unshift(hunter.position);
      rainbowTrails[hunter.riding.trailIndex] = tr;
    }

  const unicorns = bWorld.unicorns.map((bUnicorn): Unicorn => {
    const aUnicorn = aWorld.unicorns.find((u) => u.id === bUnicorn.id);
    return aUnicorn
      ? {
          ...bUnicorn,
          position: lerpVec2(aUnicorn.position, bUnicorn.position, t),
          direction: lerpDirection(aUnicorn.direction, bUnicorn.direction, t),
        }
      : bUnicorn;
  });

  return { ...bWorld, hunters, unicorns, rainbowTrails };
};
