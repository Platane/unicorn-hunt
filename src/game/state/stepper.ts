import { vec2 } from "gl-matrix";
import { PlayerInput, WorldSnapshot } from "./types";

// input angles are quantified to 16 positions, precompute them
const DIRECTIONS = Array.from({ length: 16 }, (_, i) =>
  vec2.fromValues(Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)),
);

export const STEP_DURATION = 1 / 20;

export const step = (world: WorldSnapshot, inputs: (PlayerInput & { playerId: string })[]) => {
  world = structuredClone(world);

  world.generation++;

  // treat inputs
  for (const input of inputs) {
    const player = world.players.find((p) => p.id === input.playerId);
    if (player) {
      vec2.copy(player.direction, DIRECTIONS[input.angle & 15]);
    }
  }

  // world stepper
  for (const player of world.players) {
    vec2.scaleAndAdd(player.position, player.position, player.direction, 1 * STEP_DURATION);
  }

  // TODO:
  // - player collision
  // - obstacle generation
  // - obstacle collision

  return world;
};

export const createInitialState = (): WorldSnapshot => ({
  generation: 0,
  seed: 0 | (Math.random() * (1 << 16)),
  players: [],
});
