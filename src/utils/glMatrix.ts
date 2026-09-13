const EPSILON = 0.000001;

type Arr = Float32Array | number[];
export type vec2 = Arr;
export type vec3 = Arr;
export type vec4 = Arr;
export type quat = Arr;
export type mat4 = Arr;

export const vec2 = {
  clone: (a: vec2) => new Float32Array([a[0], a[1]]) as vec2,
  fromValues: (x: number, y: number) => new Float32Array([x, y]) as vec2,
  copy: (out: vec2, a: vec2) => {
    out[0] = a[0];
    out[1] = a[1];
    return out;
  },
  sub: (out: vec2, a: vec2, b: vec2) => {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    return out;
  },
  scale: (out: vec2, a: vec2, b: number) => {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    return out;
  },
  scaleAndAdd: (out: vec2, a: vec2, b: vec2, scale: number) => {
    out[0] = a[0] + b[0] * scale;
    out[1] = a[1] + b[1] * scale;
    return out;
  },
  sqrDist: (a: vec2, b: vec2) => {
    const x = b[0] - a[0];
    const y = b[1] - a[1];
    return x * x + y * y;
  },
  len: (a: vec2) => Math.hypot(a[0], a[1]),
  negate: (out: vec2, a: vec2) => {
    out[0] = -a[0];
    out[1] = -a[1];
    return out;
  },
  normalize: (out: vec2, a: vec2) => {
    let len = a[0] * a[0] + a[1] * a[1];
    if (len > 0) len = 1 / Math.sqrt(len);
    out[0] = a[0] * len;
    out[1] = a[1] * len;
    return out;
  },
  dot: (a: vec2, b: vec2) => a[0] * b[0] + a[1] * b[1],
  lerp: (out: vec2, a: vec2, b: vec2, t: number) => {
    const ax = a[0];
    const ay = a[1];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    return out;
  },
};

export const vec3 = {
  set: (out: vec3, x: number, y: number, z: number) => {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  },
  copy: (out: vec3, a: vec3) => {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
  },
  add: (out: vec3, a: vec3, b: vec3) => {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },
  sub: (out: vec3, a: vec3, b: vec3) => {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },
  scaleAndAdd: (out: vec3, a: vec3, b: vec3, scale: number) => {
    out[0] = a[0] + b[0] * scale;
    out[1] = a[1] + b[1] * scale;
    out[2] = a[2] + b[2] * scale;
    return out;
  },
  distance: (a: vec3, b: vec3) => {
    const x = b[0] - a[0];
    const y = b[1] - a[1];
    const z = b[2] - a[2];
    return Math.sqrt(x * x + y * y + z * z);
  },
  lerp: (out: vec3, a: vec3, b: vec3, t: number) => {
    const ax = a[0];
    const ay = a[1];
    const az = a[2];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    out[2] = az + t * (b[2] - az);
    return out;
  },
  normalize: (out: vec3, a: vec3) => {
    let len = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    if (len > 0) len = 1 / Math.sqrt(len);
    out[0] = a[0] * len;
    out[1] = a[1] * len;
    out[2] = a[2] * len;
    return out;
  },
  cross: (out: vec3, a: vec3, b: vec3) => {
    const ax = a[0];
    const ay = a[1];
    const az = a[2];
    const bx = b[0];
    const by = b[1];
    const bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  transformMat4: (out: vec3, a: vec3, m: mat4) => {
    const x = a[0];
    const y = a[1];
    const z = a[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
  },
  transformQuat: (out: vec3, a: vec3, q: quat) => {
    const qx = q[0];
    const qy = q[1];
    const qz = q[2];
    const qw = q[3];
    const vx = a[0];
    const vy = a[1];
    const vz = a[2];
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    out[0] = vx + qw * tx + qy * tz - qz * ty;
    out[1] = vy + qw * ty + qz * tx - qx * tz;
    out[2] = vz + qw * tz + qx * ty - qy * tx;
    return out;
  },
};

export const quat = {
  identity: (out: quat) => {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
  },
  multiply: (out: quat, a: quat, b: quat) => {
    const ax = a[0];
    const ay = a[1];
    const az = a[2];
    const aw = a[3];
    const bx = b[0];
    const by = b[1];
    const bz = b[2];
    const bw = b[3];
    out[0] = ax * bw + aw * bx + ay * bz - az * by;
    out[1] = ay * bw + aw * by + az * bx - ax * bz;
    out[2] = az * bw + aw * bz + ax * by - ay * bx;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
  },
  slerp: (out: quat, a: quat, b: quat, t: number) => {
    const ax = a[0];
    const ay = a[1];
    const az = a[2];
    const aw = a[3];
    let bx = b[0];
    let by = b[1];
    let bz = b[2];
    let bw = b[3];
    let scale0 = 1 - t;
    let scale1 = t;

    let cosom = ax * bx + ay * by + az * bz + aw * bw;
    if (cosom < 0) {
      cosom = -cosom;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    if (1 - cosom > EPSILON) {
      const omega = Math.acos(cosom);
      const sinom = Math.sin(omega);
      scale0 = Math.sin((1 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    }

    out[0] = scale0 * ax + scale1 * bx;
    out[1] = scale0 * ay + scale1 * by;
    out[2] = scale0 * az + scale1 * bz;
    out[3] = scale0 * aw + scale1 * bw;
    return out;
  },
  conjugate: (out: quat, a: quat) => {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] = a[3];
    return out;
  },
  // zyx order, the gl-matrix default
  fromEuler: (out: quat, x: number, y: number, z: number) => {
    const halfToRad = Math.PI / 360;
    const sx = Math.sin(x * halfToRad);
    const cx = Math.cos(x * halfToRad);
    const sy = Math.sin(y * halfToRad);
    const cy = Math.cos(y * halfToRad);
    const sz = Math.sin(z * halfToRad);
    const cz = Math.cos(z * halfToRad);
    out[0] = sx * cy * cz - cx * sy * sz;
    out[1] = cx * sy * cz + sx * cy * sz;
    out[2] = cx * cy * sz - sx * sy * cz;
    out[3] = cx * cy * cz + sx * sy * sz;
    return out;
  },
};

const mat4Identity = (out: mat4) => {
  for (let i = 16; i--;) out[i] = i % 5 ? 0 : 1;
  return out;
};

export const mat4 = {
  multiply: (out: mat4, a: mat4, b: mat4) => {
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    for (let i = 0; i < 16; i += 4) {
      const b0 = b[i],
        b1 = b[i + 1],
        b2 = b[i + 2],
        b3 = b[i + 3];
      out[i] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  perspective: (out: mat4, fovy: number, aspect: number, near: number, far: number) => {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    mat4Identity(out);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  },
  lookAt: (out: mat4, eye: vec3, center: vec3, up: vec3) => {
    const eyex = eye[0];
    const eyey = eye[1];
    const eyez = eye[2];
    const upx = up[0];
    const upy = up[1];
    const upz = up[2];

    if (
      Math.abs(eyex - center[0]) < EPSILON &&
      Math.abs(eyey - center[1]) < EPSILON &&
      Math.abs(eyez - center[2]) < EPSILON
    )
      return mat4Identity(out);

    let z0 = eyex - center[0];
    let z1 = eyey - center[1];
    let z2 = eyez - center[2];
    let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    let x0 = upy * z2 - upz * z1;
    let x1 = upz * z0 - upx * z2;
    let x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    len = len && 1 / len;
    x0 *= len;
    x1 *= len;
    x2 *= len;

    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;
    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    len = len && 1 / len;
    y0 *= len;
    y1 *= len;
    y2 *= len;

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;
    return out;
  },
  fromRotationTranslationScale: (out: mat4, q: quat, v: vec3, s: vec3) => {
    const x = q[0];
    const y = q[1];
    const z = q[2];
    const w = q[3];
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    out[0] = (1 - (yy + zz)) * s[0];
    out[1] = (xy + wz) * s[0];
    out[2] = (xz - wy) * s[0];
    out[3] = 0;
    out[4] = (xy - wz) * s[1];
    out[5] = (1 - (xx + zz)) * s[1];
    out[6] = (yz + wx) * s[1];
    out[7] = 0;
    out[8] = (xz + wy) * s[2];
    out[9] = (yz - wx) * s[2];
    out[10] = (1 - (xx + yy)) * s[2];
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    return out;
  },
};
