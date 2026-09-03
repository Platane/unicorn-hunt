export const lerp = (min: number, max: number, value: number) => (1 - value) * min + value * max;

export const invLerp = (min: number, max: number, value: number) => (value - min) / (max - min);

export const clamp = (min: number, max: number, value: number) =>
  Math.min(Math.max(value, min), max);
