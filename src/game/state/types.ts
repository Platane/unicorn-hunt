import { vec2 } from "gl-matrix";

export type WorldSnapshot = {
  seed: number; // determine the object placement
  generation: number;
  hunters: Hunter[];
  unicorns: Unicorn[];
};
export type Hunter = {
  id: string;
  direction: vec2;
  position: vec2;
  riding?: number;
};
export type Unicorn = {
  id: number;
  position: vec2;
  direction: vec2;
};
export type PlayerInput = {
  angle: number; // quantified to 16 positions
};
