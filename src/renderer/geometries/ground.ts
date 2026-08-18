import { vec3 } from "gl-matrix";

export const createGround = () => {
  const positions = new Float32Array([
    //
    10, 0, -0.001,

    0, 0, -0.001,

    0, 10, -0.001,
  ]);
  const normals = new Float32Array([
    //
    0, 0, 1,

    0, 0, 1,

    0, 0, 1,
  ]);
  const colorIndex = new Uint8Array([0, 0, 0]);

  return { positions, normals, colorIndex };
};
