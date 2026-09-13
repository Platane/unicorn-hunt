import { vec3 } from "../../../utils/glMatrix";

export const computeBoneWeights = (bonePositions: vec3[], positions: ArrayLike<number>) => {
  const nVertices = positions.length / 3;
  const boneIndexes = new Uint8Array(nVertices * 4);
  const boneWeights = new Float32Array(nVertices * 4);

  const p = new Float32Array(3);

  const ws = new Float32Array(4);
  const is = new Uint8Array(4);

  const getWeight = (bone: vec3, p: vec3) => {
    const d = vec3.distance(p, bone);
    return 1 / d ** 4;
  };

  for (let i = 0; i < positions.length / 3; i++) {
    p[0] = positions[i * 3 + 0];
    p[1] = positions[i * 3 + 1];
    p[2] = positions[i * 3 + 2];

    ws[0] = ws[1] = ws[2] = ws[3] = 0;
    is[0] = is[1] = is[2] = is[3] = 0;

    for (let j = bonePositions.length; j--;) {
      const w = getWeight(bonePositions[j], p);

      let k = 4;
      while (k > 0 && w > ws[k - 1]) k--;

      for (let u = 3; u >= k; u--) {
        ws[u + 1] = ws[u];
        is[u + 1] = is[u];
      }

      ws[k] = w;
      is[k] = j;
    }

    const sum = ws[0] + ws[1] + ws[2] + ws[3];

    boneWeights[i * 4 + 0] = ws[0] / sum;
    boneWeights[i * 4 + 1] = ws[1] / sum;
    boneWeights[i * 4 + 2] = ws[2] / sum;
    boneWeights[i * 4 + 3] = ws[3] / sum;

    boneIndexes[i * 4 + 0] = is[0];
    boneIndexes[i * 4 + 1] = is[1];
    boneIndexes[i * 4 + 2] = is[2];
    boneIndexes[i * 4 + 3] = is[3];
  }

  return { boneWeights, boneIndexes };
};
