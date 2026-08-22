export const lerp = (value: number, min: number, max: number) => (1 - value) * min + value * max;

export const invLerp = (value: number, min: number, max: number) => (value - min) / (max - min);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
