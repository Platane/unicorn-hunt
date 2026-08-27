import { TypedArray } from "@gltf-transform/core";

export const flattenIndex = (out: TypedArray, n: number, indexes: Uint8Array, arr: TypedArray) => {
  for (let i = indexes.length; i--;) {
    for (let k = n; k--;) out[i * n + k] = arr[indexes[i] * n + k];
  }
};
