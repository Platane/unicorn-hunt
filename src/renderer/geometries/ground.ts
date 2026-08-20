import { vec3 } from "gl-matrix";
import { hashInt } from "../../utils/hash";
import { getFlatShadingNormals } from "../../utils/geometry-normals";

export const createGroundGeometry = () => {
  const colorIndex = new Uint8Array(1 << 16);
  const positions = new Float32Array(colorIndex.length * 3);
  const normals = new Float32Array(colorIndex.length * 3);

  return { positions, normals, colorIndex, vertexCount: 0 };
};

export const updateGroundGeometry = (
  out: ReturnType<typeof createGroundGeometry>,
  seed: number,
  range: [number, number],
) => {
  // triangle index
  let i = 0;

  const push = (px: number, py: number, color: number) => {
    // TODO:
    //  - domain wrap x,y,z?
    //  - sum of sin to create a height field

    const k = hashInt(px * 7 + py);
    // const dy = (k % 17) / 50
    const dy = 0;

    px *= 1.118;
    out.positions[i * 3 + 0] = px;
    out.positions[i * 3 + 1] = py + dy;
    out.positions[i * 3 + 2] = 0;
    out.colorIndex[i] = color;
    i++;
  };

  const W = 20;
  for (let x = -W; x <= W; x++) {
    for (let y = Math.floor(range[0]); y <= Math.floor(range[1]); y++) {
      const u = hashInt(seed + x * 738 + y * 1932);

      const o0 = (y & 1) * 0.5;
      const o1 = 0.5 - o0;

      const ax = x + o0;
      const bx = x + 1 + o0;
      const cx = x + o1;
      const dx = x + 1 + o1;

      let color = u % 16;

      if (o0) {
        push(ax, y, color);
        push(bx, y, color);
        push(dx, y + 1, color);

        color = (u >> 4) % 16;

        push(ax, y, color);
        push(dx, y + 1, color);
        push(cx, y + 1, color);
      } else {
        push(ax, y, color);
        push(bx, y, color);
        push(cx, y + 1, color);

        color = (u >> 4) % 16;

        push(bx, y, color);
        push(dx, y + 1, color);
        push(cx, y + 1, color);
      }
    }
  }

  getFlatShadingNormals(out.normals, out.positions);

  out.vertexCount = i;
};
