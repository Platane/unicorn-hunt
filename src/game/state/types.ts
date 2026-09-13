import { vec2 } from "../../utils/glMatrix";

export type WorldSnapshot = {
  seed: number; // determine the object placement
  generation: number;
  hunters: Hunter[];
  unicorns: Unicorn[];
  rainbowTrails: vec2[][];
};
export type Hunter = {
  id: string;
  d: vec2;
  p: vec2;
  riding?: { remainingTime: number; trailIndex: number; unicornId: number };
  jumping?: { remainingTime: number; d: vec2 };
  staggered?: number;
  onTrail?: number;
};
export type Unicorn = {
  id: number;
  p: vec2;
  d: vec2;
};
export type PlayerInput = {
  angle: number; // quantified to 16 positions
  jump?: boolean;
};
