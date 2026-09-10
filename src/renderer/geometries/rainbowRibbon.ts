import { vec2 } from "gl-matrix";

export const RAINBOW_COLOR_COUNT = 5;
export const fillRainbowRibbon2 = (
  out: Float32Array,
  offset: number,
  controlPoints: vec2[],
  radius: number,
) => {
  if (controlPoints.length < 2) return offset;

  for (let i = 0; i < controlPoints.length - 1; i++) {
    const a = controlPoints[i];
    const b = controlPoints[i + 1];

    vec2.sub(v, b, a);
    const l = vec2.len(v);
    vec2.scale(v, v, 1 / l);

    // trangente at a
    const a_ = controlPoints[i - 1];
    if (a_) vec2.sub(ta, b, a_);
    else vec2.sub(ta, b, a);
    vec2.normalize(ta, ta);
    na[0] = ta[1];
    na[1] = -ta[0];

    // trangente at b
    const b_ = controlPoints[i + 2];
    if (b_) vec2.sub(tb, a, b_);
    else vec2.sub(tb, a, b);
    vec2.normalize(tb, tb);
    nb[0] = tb[1];
    nb[1] = -tb[0];
    vec2.negate(nb, nb);

    const curvature =
      0 +
      (1 - Math.abs(vec2.dot(v, ta))) +
      (1 - Math.abs(vec2.dot(v, tb))) +
      (1 - Math.abs(vec2.dot(ta, tb)));
    const n = Math.max(1, Math.ceil(10 * curvature));

    for (let j = 0; j < n; j++) {
      const k1 = j / n;
      const k2 = (j + 1) / n;

      for (let i = 0; i < RAINBOW_COLOR_COUNT; i++) {
        const h1 = (i / RAINBOW_COLOR_COUNT) * 2 - 1;
        const h2 = ((i + 1) / RAINBOW_COLOR_COUNT) * 2 - 1;

        const ah1x = a[0] + na[0] * h1 * radius;
        const ah1y = a[1] + na[1] * h1 * radius;

        const ah2x = a[0] + na[0] * h2 * radius;
        const ah2y = a[1] + na[1] * h2 * radius;

        const bh1x = b[0] + nb[0] * h1 * radius;
        const bh1y = b[1] + nb[1] * h1 * radius;

        const bh2x = b[0] + nb[0] * h2 * radius;
        const bh2y = b[1] + nb[1] * h2 * radius;

        const H = 0.2;
        const cah1x = ah1x + ta[0] * l * H;
        const cah1y = ah1y + ta[1] * l * H;

        const cah2x = ah2x + ta[0] * l * H;
        const cah2y = ah2y + ta[1] * l * H;

        const cbh1x = bh1x + tb[0] * l * H;
        const cbh1y = bh1y + tb[1] * l * H;

        const cbh2x = bh2x + tb[0] * l * H;
        const cbh2y = bh2y + tb[1] * l * H;

        // cubic bezier
        const c1x = cubicBezier(ah1x, cah1x, cbh1x, bh1x, k1);
        const c1y = cubicBezier(ah1y, cah1y, cbh1y, bh1y, k1);

        const c2x = cubicBezier(ah2x, cah2x, cbh2x, bh2x, k1);
        const c2y = cubicBezier(ah2y, cah2y, cbh2y, bh2y, k1);

        const c3x = cubicBezier(ah2x, cah2x, cbh2x, bh2x, k2);
        const c3y = cubicBezier(ah2y, cah2y, cbh2y, bh2y, k2);

        const c4x = cubicBezier(ah1x, cah1x, cbh1x, bh1x, k2);
        const c4y = cubicBezier(ah1y, cah1y, cbh1y, bh1y, k2);

        out[offset + 0] = c1x;
        out[offset + 1] = c1y;
        out[offset + 2] = 0;

        out[offset + 3] = c2x;
        out[offset + 4] = c2y;
        out[offset + 5] = 0;

        out[offset + 6] = c3x;
        out[offset + 7] = c3y;
        out[offset + 8] = 0;

        offset += 9;

        out[offset + 0] = c1x;
        out[offset + 1] = c1y;
        out[offset + 2] = 0;

        out[offset + 3] = c3x;
        out[offset + 4] = c3y;
        out[offset + 5] = 0;

        out[offset + 6] = c4x;
        out[offset + 7] = c4y;
        out[offset + 8] = 0;

        offset += 9;
      }
    }
  }

  return offset;
};

export const fillRainbowRibbon = (
  out: Float32Array,
  offset: number,
  controlPoints: vec2[],
  radius: number,
) => {
  if (controlPoints.length < 2) return offset;

  for (let i = 0; i < controlPoints.length - 1; i++) {
    const a = controlPoints[i];
    const b = controlPoints[i + 1];

    vec2.sub(v, b, a);
    const l = vec2.len(v);
    vec2.scale(v, v, 1 / l);

    // trangente at a
    const a_ = controlPoints[i - 1];
    if (a_) vec2.sub(ta, b, a_);
    else vec2.sub(ta, b, a);
    vec2.normalize(ta, ta);
    na[0] = ta[1];
    na[1] = -ta[0];

    // trangente at b
    const b_ = controlPoints[i + 2];
    if (b_) vec2.sub(tb, a, b_);
    else vec2.sub(tb, a, b);
    vec2.normalize(tb, tb);
    nb[0] = tb[1];
    nb[1] = -tb[0];
    vec2.negate(nb, nb);

    vec2.scaleAndAdd(ca, a, ta, l * 0.2);
    vec2.scaleAndAdd(cb, b, tb, l * 0.2);

    const curvature =
      (0.5 * (1 - vec2.dot(v, ta)) + 0.5 * (1 + vec2.dot(v, tb)) + 0.5 * (1 + vec2.dot(ta, tb))) /
      3;

    const n = Math.max(2, Math.ceil(60 * curvature));

    let e,
      ne,
      te,
      ze = 0;

    if (i === 0) {
      e = a;
      ne = na;
      te = ta;
      ze = 0.00111;
    } else if (i === controlPoints.length - 2) {
      e = b;
      ne = nb;
      te = tb;
      ze = 0.0001;
    }
    if (e && ne && te) {
      for (let c = 0; c < RAINBOW_COLOR_COUNT; c++) {
        const h1 = (c / RAINBOW_COLOR_COUNT) * 2 - 1;
        const h2 = ((c + 1) / RAINBOW_COLOR_COUNT) * 2 - 1;

        const y1 = Math.cos(Math.asin(h1)) * 0.6;
        const y2 = Math.cos(Math.asin(h2)) * 0.6;

        out[offset + 0] = e[0] + ne[0] * h1 * radius;
        out[offset + 1] = e[1] + ne[1] * h1 * radius;
        out[offset + 2] = ze;

        out[offset + 3] = e[0] + ne[0] * h2 * radius;
        out[offset + 4] = e[1] + ne[1] * h2 * radius;
        out[offset + 5] = ze;

        out[offset + 6] = e[0] + (ne[0] * h2 - te[0] * y2) * radius;
        out[offset + 7] = e[1] + (ne[1] * h2 - te[1] * y2) * radius;
        out[offset + 8] = ze;

        offset += 9;

        out[offset + 0] = e[0] + ne[0] * h1 * radius;
        out[offset + 1] = e[1] + ne[1] * h1 * radius;
        out[offset + 2] = ze;

        out[offset + 3] = e[0] + (ne[0] * h1 - te[0] * y1) * radius;
        out[offset + 4] = e[1] + (ne[1] * h1 - te[1] * y1) * radius;
        out[offset + 5] = ze;

        out[offset + 6] = e[0] + (ne[0] * h2 - te[0] * y2) * radius;
        out[offset + 7] = e[1] + (ne[1] * h2 - te[1] * y2) * radius;
        out[offset + 8] = ze;

        offset += 9;
      }
    }

    for (let j = 0; j < n; j++) {
      const k1 = j / n;
      const k2 = (j + 1) / n;

      const m1x = cubicBezier(a[0], ca[0], cb[0], b[0], k1);
      const m1y = cubicBezier(a[1], ca[1], cb[1], b[1], k1);

      t1[0] = cubicBezierTangent(a[0], ca[0], cb[0], b[0], k1);
      t1[1] = cubicBezierTangent(a[1], ca[1], cb[1], b[1], k1);
      vec2.normalize(t1, t1);

      const m2x = cubicBezier(a[0], ca[0], cb[0], b[0], k2);
      const m2y = cubicBezier(a[1], ca[1], cb[1], b[1], k2);

      t2[0] = cubicBezierTangent(a[0], ca[0], cb[0], b[0], k2);
      t2[1] = cubicBezierTangent(a[1], ca[1], cb[1], b[1], k2);
      vec2.normalize(t2, t2);

      for (let c = 0; c < RAINBOW_COLOR_COUNT; c++) {
        const h1 = (c / RAINBOW_COLOR_COUNT) * 2 - 1;
        const h2 = ((c + 1) / RAINBOW_COLOR_COUNT) * 2 - 1;

        const z =
          0.0001 +
          (1 - (i + j / n + (c / RAINBOW_COLOR_COUNT) * 0.2) / controlPoints.length) * 0.001;

        out[offset + 0] = m1x + t1[1] * h1 * radius;
        out[offset + 1] = m1y - t1[0] * h1 * radius;
        out[offset + 2] = z;

        out[offset + 3] = m1x + t1[1] * h2 * radius;
        out[offset + 4] = m1y - t1[0] * h2 * radius;
        out[offset + 5] = z;

        out[offset + 6] = m2x + t2[1] * h2 * radius;
        out[offset + 7] = m2y - t2[0] * h2 * radius;
        out[offset + 8] = z;

        offset += 9;

        out[offset + 0] = m1x + t1[1] * h1 * radius;
        out[offset + 1] = m1y - t1[0] * h1 * radius;
        out[offset + 2] = z;

        out[offset + 3] = m2x + t2[1] * h1 * radius;
        out[offset + 4] = m2y - t2[0] * h1 * radius;
        out[offset + 5] = z;

        out[offset + 6] = m2x + t2[1] * h2 * radius;
        out[offset + 7] = m2y - t2[0] * h2 * radius;
        out[offset + 8] = z;

        offset += 9;
      }
    }
  }

  return offset;
};

const cubicBezier = (a: number, ca: number, cb: number, b: number, k: number) => {
  const k_ = 1 - k;
  const k2 = k * k;
  const k_2 = k_ * k_;
  return a * k_ * k_2 + 3 * ca * k * k_2 + 3 * cb * k2 * k_ + k * k2 * b;
};
const cubicBezierTangent = (a: number, ca: number, cb: number, b: number, k: number) => {
  const k_ = 1 - k;
  return 3 * k_ ** 2 * (ca - a) + 6 * k * k_ * (cb - ca) + 3 * k ** 2 * (b - cb);
};

const ca = new Float32Array(2) as vec2;
const cb = new Float32Array(2) as vec2;
const na = new Float32Array(2) as vec2;
const nb = new Float32Array(2) as vec2;
const ta = new Float32Array(2) as vec2;
const tb = new Float32Array(2) as vec2;
const t1 = new Float32Array(2) as vec2;
const t2 = new Float32Array(2) as vec2;
const v = new Float32Array(2) as vec2;
const u = new Float32Array(2) as vec2;
const z = new Float32Array(2) as vec2;

export const createRainbowRibbonGeometry = () => {
  const colorIndex = new Uint8Array(1 << 18);
  const positions = new Float32Array(colorIndex.length * 3);
  const normals = new Float32Array(colorIndex.length * 3);

  for (let i = colorIndex.length; i--;) {
    normals[i * 3 + 2] = 1;
    colorIndex[i] = 15 - (Math.floor(i / 6) % RAINBOW_COLOR_COUNT);
  }

  return { positions, normals, colorIndex };
};
