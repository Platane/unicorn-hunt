import { PlayerInput, WorldSnapshot } from "../types";
import type { Map } from "../map";

export const createBot = (playerId: string, registerInput: (i: PlayerInput) => void) => {
  const step = (map: Map, world: WorldSnapshot) => {};
  return step;
};
