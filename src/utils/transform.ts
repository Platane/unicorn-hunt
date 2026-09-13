import { mat4, quat, vec3, vec4 } from "./glMatrix";

// scratch, reused on every call
const m = new Float32Array(16) as mat4;
const s = new Float32Array(3) as vec3;

export const setTransformAt = (
  data: Float32Array,
  offset: number,
  pos: vec3,
  rotation: quat,
  size: number,
) => {
  s[0] = s[1] = s[2] = size;
  mat4.fromRotationTranslationScale(m, rotation, pos, s);
  data.set(m, offset);
};

export const setBoneAt = (data: Float32Array, offset: number, pos: vec3, rotation: quat) => {
  data.set(rotation, offset);
  data.set(pos, offset + 4);
};

export const setVec4At = (data: Float32Array, offset: number, v: vec4 | number[]) => {
  data[offset] = v[0];
  data[offset + 1] = v[1];
  data[offset + 2] = v[2];
  data[offset + 3] = v[3];
};
