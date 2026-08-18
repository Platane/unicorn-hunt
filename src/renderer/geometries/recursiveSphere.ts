import { vec3 } from "gl-matrix";
/**
 * return recursive sphere with a radius of 1 centered on origin
 */
export const createRecursiveSphere = ({
  tessellationStep = 2,
}: { tessellationStep?: number } = {}) =>
  createPyramidKernel(5).flatMap((face) =>
    tesselateRec(face, tessellationStep).flatMap((face) => face.flatMap((p) => [...p])),
  );

/**
 * create the primitive of a recursive sphere
 * some kind of double pyramid
 *
 * returns an array of oriented faces
 */
const createPyramidKernel = (n: number) => {
  const faces: [vec3, vec3, vec3][] = [];

  for (let i = n; i--;) {
    const a = [Math.cos((i / n) * Math.PI * 2), 0, Math.sin((i / n) * Math.PI * 2)] as vec3;
    const b = [
      Math.cos(((i + 1) / n) * Math.PI * 2),
      0,
      Math.sin(((i + 1) / n) * Math.PI * 2),
    ] as vec3;

    faces.push(
      //
      [a, [0, 1, 0], b],
      [[0, -1, 0], a, b],
    );
  }

  return faces;
};

/**
 * tesselate face a face, assuming it's part of the unit sphere
 *
 * returns an array of oriented faces
 */
const tesselate = (face: [vec3, vec3, vec3]) => {
  const m01 = vec3.lerp(vec3.create(), face[0], face[1], 0.5);
  const m12 = vec3.lerp(vec3.create(), face[1], face[2], 0.5);
  const m20 = vec3.lerp(vec3.create(), face[2], face[0], 0.5);

  vec3.normalize(m01, m01);
  vec3.normalize(m12, m12);
  vec3.normalize(m20, m20);

  return [
    [m01, m12, m20],
    [m01, face[1], m12],
    [m12, face[2], m20],
    [m20, face[0], m01],
  ] as [vec3, vec3, vec3][];
};

const tesselateRec = (face: [vec3, vec3, vec3], n = 0): [vec3, vec3, vec3][] => {
  if (n <= 0) return [face];
  return tesselate(face)
    .map((f) => tesselateRec(f, n - 1))
    .flat();
};
