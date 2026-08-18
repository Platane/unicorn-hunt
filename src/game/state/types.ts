import { vec2 } from "gl-matrix";

export type WorldSnapshot = {
  seed: number; // determine the object placement
  generation: number;
  players: Player[];
};
export type Player = {
  id: string;
  direction: vec2;
  position: vec2;
};
export type PlayerInput = {
  angle: number; // quantified to 16 positions
};
