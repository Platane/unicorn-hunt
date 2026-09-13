import { NodeIO } from "@gltf-transform/core";
import { quat } from "gl-matrix";

/**
 * file format
 *
 * the model is a set of boxes.
 *
 * 1     uint8     model count = M
 * 3     float32   bbox min x,y,z          global, covers cube centers and bone positions
 * 3     float32   bbox size x,y,z
 * 1     float32   max cube half extent    global, quantization range for the sizes
 *
 * M*
 *    1  uint8     cube count
 *    1  uint8     bone count
 *    1  uint8     pose count              the first pose is always the rest pose
 *
 * then, plane by plane, every model one after the other:
 *
 *   cube colors       per cube  1 uint8   index into the model's own color list
 *   cube sizes        per cube  3 uint8   half extent over the global max
 *   cube centers      per cube  3 uint8   quantized into the bbox
 *   cube rotations    per cube  4 uint8   smallest three
 *
 *   bones             per bone  1 uint8   parent index, 255 for a root
 *                               3 uint8   global position quantized into the bbox
 *                               4 uint8   rest rotation, smallest three
 *
 *   poses             per pose, per bone
 *                               4 uint8   local rotation, smallest three
 *
 * a rotation is packed as smallest three: the largest component is dropped and
 * recomputed as sqrt(1 - a^2 - b^2 - c^2), which leaves 2 bits for its index and
 * 10 bits for each of the other three. same 4 bytes as a byte per component, but
 * the stored components are bounded by 1/sqrt(2) rather than 1, so ~5x the precision.
 */

const MODELS = ["hunter", "unicorn"];

// bones the blender exporter or the rig leaves behind. they are leaves at the end
// of the joint list, so dropping them shifts no index. neutral_bone matters: it sits
// at the origin, inside the model, so computeBoneWeights would hand it real weight.
const JUNK_BONE = /^neutral_bone|^useless/;

const POSE_STRIDE = 12; // frames between two poses, at blender's 24fps

// blender units are much bigger than world units. folded into the quantization
// ranges, so it costs nothing at decode time
const MODEL_SCALE = 1 / 8;

const document = await new NodeIO().readBinary(
  new Uint8Array(await Bun.file(__dirname + "/../src/assets/Unicorn.glb").arrayBuffer()),
);

const root = document.getRoot();

//
// gather
//
const models = MODELS.map((name) => {
  const groupNode = root.listNodes().find((n) => n.getName() === name);
  if (!groupNode) throw new Error(`no node named "${name}"`);

  // the group node is itself a cube, the rest hang off it
  const cubeNodes = [groupNode, ...groupNode.listChildren()];

  const skin = root.listSkins().find((s) => s.getName() === name + " Armature");
  if (!skin) throw new Error(`no skin named "${name} Armature"`);

  const joints = skin.listJoints().filter((j) => !JUNK_BONE.test(j.getName()));

  const animation = root
    .listAnimations()
    .find((a) => a.listChannels().some((c) => joints.includes(c.getTargetNode()!)));
  if (!animation) throw new Error(`no animation targeting "${name} Armature"`);

  // one rotation track per bone, sampled at every frame by the exporter.
  // a bone with no track never moves, so it stays at its rest rotation.
  const tracks = joints.map((joint) => {
    const channel = animation
      .listChannels()
      .find((c) => c.getTargetNode() === joint && c.getTargetPath() === "rotation");
    return channel?.getSampler()?.getOutput()?.getArray() ?? null;
  });

  const sampleCount = Math.max(...tracks.map((t) => (t ? t.length / 4 : 0)), 1);

  const cubes = cubeNodes.map((node) => {
    const material = node.getMesh()?.listPrimitives()[0].getMaterial();
    return {
      center: node.getWorldTranslation() as [number, number, number],
      rotation: node.getWorldRotation() as [number, number, number, number],
      // blender mirror modifiers leave negative scale. a box is symmetric under
      // reflection and we generate its faces ourselves, so the sign carries nothing
      size: (node.getWorldScale() as number[]).map(Math.abs) as [number, number, number],
      color: material ? material.getBaseColorFactor().slice(0, 3).join(",") : "",
    };
  });

  // colors are scoped to the model, merged by value. blender keeps duplicates
  // around (black / black.001 / black.002) that are the same colour
  const colors = [...new Set(cubes.map((c) => c.color))];

  return { name, cubes, colors, joints, tracks, sampleCount };
});

//
// quantization ranges
//
const bbox = { min: [Infinity, Infinity, Infinity], size: [0, 0, 0] };
const max = [-Infinity, -Infinity, -Infinity];
let maxCubeSize = 0;

for (const model of models) {
  for (const cube of model.cubes) {
    for (let k = 3; k--;) {
      bbox.min[k] = Math.min(bbox.min[k], cube.center[k]);
      max[k] = Math.max(max[k], cube.center[k]);
      maxCubeSize = Math.max(maxCubeSize, cube.size[k]);
    }
  }
  for (const joint of model.joints) {
    const p = joint.getWorldTranslation();
    for (let k = 3; k--;) {
      bbox.min[k] = Math.min(bbox.min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
}
for (let k = 3; k--;) bbox.size[k] = max[k] - bbox.min[k];

//
// encoding
//
const bytes: number[] = [];

const u8 = (v: number) => bytes.push(Math.max(0, Math.min(255, Math.round(v))));

const quantPosition = (p: ArrayLike<number>) => {
  for (let k = 0; k < 3; k++) u8(((p[k] - bbox.min[k]) / bbox.size[k]) * 255);
};

const q = new Float32Array(4) as quat;

/** smallest three, 2 bits for the dropped index then 10 bits each, big endian */
const quantRotation = (r: ArrayLike<number>) => {
  quat.set(q, r[0], r[1], r[2], r[3]);
  quat.normalize(q, q);

  let largest = 0;
  for (let k = 1; k < 4; k++) if (Math.abs(q[k]) > Math.abs(q[largest])) largest = k;

  // q and -q are the same rotation, so we can always drop a positive component
  // and recover it with a plain sqrt
  const sign = q[largest] < 0 ? -1 : 1;

  let packed = largest;
  for (let k = 0; k < 4; k++) {
    if (k === largest) continue;
    const c = (sign * q[k]) / Math.SQRT1_2; // bounded by 1 now
    packed = packed * 1024 + Math.max(0, Math.min(1023, Math.round((c * 0.5 + 0.5) * 1023)));
  }

  // not u8(), that rounds. these are bit slices of a 32 bit value
  bytes.push(Math.floor(packed / 0x1000000) & 0xff);
  bytes.push((packed >>> 16) & 0xff);
  bytes.push((packed >>> 8) & 0xff);
  bytes.push(packed & 0xff);
};

// file header
u8(models.length);
{
  const head = new DataView(new ArrayBuffer(7 * 4));
  for (let k = 0; k < 3; k++) {
    head.setFloat32(k * 4, bbox.min[k] * MODEL_SCALE);
    head.setFloat32(12 + k * 4, bbox.size[k] * MODEL_SCALE);
  }
  head.setFloat32(24, maxCubeSize * MODEL_SCALE);
  for (const b of new Uint8Array(head.buffer)) bytes.push(b);
}

// model headers
for (const model of models) {
  u8(model.cubes.length);
  u8(model.joints.length);
  u8(Math.floor((model.sampleCount - 1) / POSE_STRIDE) + 2); // + the rest pose
}

// cube colors
for (const model of models) for (const cube of model.cubes) u8(model.colors.indexOf(cube.color));

// cube sizes
for (const model of models)
  for (const cube of model.cubes)
    for (let k = 0; k < 3; k++) u8((cube.size[k] / maxCubeSize) * 255);

// cube centers
for (const model of models) for (const cube of model.cubes) quantPosition(cube.center);

// cube rotations
for (const model of models) for (const cube of model.cubes) quantRotation(cube.rotation);

// bones, interleaved
for (const model of models)
  for (const joint of model.joints) {
    const parent = joint.getParentNode();
    const parentIndex = model.joints.findIndex((j) => j === parent);
    u8(parentIndex === -1 ? 255 : parentIndex);

    quantPosition(joint.getWorldTranslation());
    quantRotation(joint.getRotation());
  }

// poses. the first one is the rest pose, the rest are sampled every POSE_STRIDE frames
for (const model of models) {
  for (const joint of model.joints) void joint;

  const poseCount = Math.floor((model.sampleCount - 1) / POSE_STRIDE) + 2;

  for (let p = 0; p < poseCount; p++)
    for (let b = 0; b < model.joints.length; b++) {
      const track = model.tracks[b];

      if (p === 0 || !track) {
        quantRotation(model.joints[b].getRotation());
        continue;
      }

      const sample = Math.min((p - 1) * POSE_STRIDE, track.length / 4 - 1);
      quantRotation(track.subarray(sample * 4, sample * 4 + 4));
    }
}

//
// color palette, 16x16 rgba at the end of the file
// drawn by the game code into a fake canvas
{
  const pixels = new Uint8Array(16 * 16 * 4);

  const parseColor = (s: string) => {
    if (s.startsWith("#")) {
      const hex = s.length === 4 ? [...s.slice(1)].map((c) => c + c).join("") : s.slice(1);
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
    }
    const [h, sat, l] = s.match(/-?[\d.]+/g)!.map(Number);
    const a = (sat / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + (((h % 360) + 360) % 360) / 30) % 12;
      return Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return [f(0), f(8), f(4), 255];
  };

  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => {
        let color = [0, 0, 0, 255];
        return {
          set fillStyle(s: string) {
            color = parseColor(s);
          },
          fillRect: (x: number, y: number, w: number, h: number) => {
            for (let j = y; j < y + h; j++)
              for (let i = x; i < x + w; i++) pixels.set(color, (j * 16 + i) * 4);
          },
        };
      },
    }),
  };

  const { createColorPalette } = await import("../src/renderer/geometries/colorPatette");
  createColorPalette();

  for (const b of pixels) bytes.push(b);
}

await Bun.file(__dirname + "/../src/assets/models.bin").write(new Uint8Array(bytes));

//
// report
//
for (const model of models)
  console.log(
    model.name.padEnd(9),
    "cubes",
    String(model.cubes.length).padStart(3),
    "bones",
    String(model.joints.length).padStart(3),
    "poses",
    String(Math.floor((model.sampleCount - 1) / POSE_STRIDE) + 2).padStart(2),
    "colors",
    String(model.colors.length).padStart(2),
    model.cubes.some((c) => !c.color) ? " <- some cubes have no material" : "",
  );
console.log(
  "\nbbox",
  bbox.min.map((v) => (v * MODEL_SCALE).toFixed(2)).join(","),
  "size",
  bbox.size.map((v) => (v * MODEL_SCALE).toFixed(2)).join(","),
  "maxCubeSize",
  (maxCubeSize * MODEL_SCALE).toFixed(3),
  `(scaled by ${MODEL_SCALE})`,
);
console.log("models.bin", bytes.length, "bytes");
