import { vec2 } from "gl-matrix";
import { WorldSnapshot } from ".";

// input angles are quantified to 16 positions, precompute them
const DIRECTIONS = Array.from({ length: 16 }, (_, i) =>
  vec2.fromValues(Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)),
);

export const step = (world: WorldSnapshot) => {
  world.generation++;
  for (const player of world.players) {
    const input = world.inputs[player.id];
    if (input) vec2.copy(player.direction, DIRECTIONS[input.angle & 15]);
    vec2.scaleAndAdd(player.position, player.position, player.direction, 0.01);
  }

  // TODO:
  // - player collision
  // - obstacle generation
  // - obstacle collision
};
