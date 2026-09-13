import { quat, vec3 } from "../../utils/glMatrix";

/**
 * a box, tessellated so the quads come out roughly square whatever the box
 * dimensions. the subdivision is what lets a skinned box bend instead of
 * hinging at its ends.
 */

const divisions = new Int32Array(3);

const setDivisions = (size: ArrayLike<number>, quadSize: number) => {
  for (let k = 3; k--;) divisions[k] = Math.max(1, Math.round((size[k] * 2) / quadSize));
};

export const getBoxVertexCount = (size: ArrayLike<number>, quadSize: number) => {
  setDivisions(size, quadSize);
  const [nx, ny, nz] = divisions;
  // 6 faces, 2 triangles per quad, 3 vertices per triangle
  return 12 * (ny * nz + nx * nz + nx * ny);
};

const p = new Float32Array(3) as vec3;

/** writes 3 floats per vertex, returns the offset past what it wrote */
export const fillBox = (
  out: Float32Array,
  offset: number,
  center: ArrayLike<number>,
  rotation: quat,
  size: ArrayLike<number>,
  quadSize: number,
) => {
  setDivisions(size, quadSize);

  const push = (a: number, s: number, u: number, v: number, i: number, j: number) => {
    const uAxis = (a + 1) % 3;
    const vAxis = (a + 2) % 3;

    p[a] = s * size[a];
    p[uAxis] = ((i / u) * 2 - 1) * size[uAxis];
    p[vAxis] = ((j / v) * 2 - 1) * size[vAxis];

    vec3.transformQuat(p, p, rotation);

    out[offset++] = p[0] + center[0];
    out[offset++] = p[1] + center[1];
    out[offset++] = p[2] + center[2];
  };

  for (let a = 0; a < 3; a++) {
    const u = divisions[(a + 1) % 3];
    const v = divisions[(a + 2) % 3];

    for (const s of [1, -1])
      for (let i = 0; i < u; i++)
        for (let j = 0; j < v; j++) {
          const [i0, i1] = s > 0 ? [i, i + 1] : [i + 1, i];

          push(a, s, u, v, i0, j);
          push(a, s, u, v, i1, j);
          push(a, s, u, v, i1, j + 1);

          push(a, s, u, v, i0, j);
          push(a, s, u, v, i1, j + 1);
          push(a, s, u, v, i0, j + 1);
        }
  }

  return offset;
};
