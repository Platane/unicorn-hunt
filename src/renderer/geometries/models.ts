import { quat, vec3 } from "gl-matrix";
import modelBinUrl from "../../assets/models.bin" with { type: "file" };
import { computeBoneWeights } from "./utils/computeBoneWeights";
import { fillBox, getBoxVertexCount } from "./box";

/** see scripts/build-assets.ts for the format */

// target edge length for a tessellated quad, in model units. smaller bends more
// smoothly under skinning and costs vertices quadratically
const QUAD_SIZE = 0.04;

const MODEL_HEADER_SIZE = 3;

// the rig stacks several bones on the same head — two arms rooted at the same
// shoulder, three mane strands off one point. computeBoneWeights only knows a
// position, so those are indistinguishable to it and every nearby vertex ends up
// split evenly between bones that rotate opposite ways.
//
// blender's bone local +Y runs head to tail and survives in the rest rotation,
// so pushing the weighting point along it separates them again. this only feeds
// computeBoneWeights, the skinning transform still uses the real rest position
const BONE_WEIGHT_OFFSET = 0.3;
const BONE_AXIS = [0, 1, 0] as vec3;

export type Bone = {
  parent: number; // -1 for a root
  localPosition: vec3; // rest offset from the parent
  restRotation: quat; // global
  restPosition: vec3; // global
  poses: quat[]; // one local rotation per pose, pose 0 is the rest pose

  // scratch, overwritten by every applyPose. safe because one skeleton is
  // evaluated at a time
  globalRotation: quat;
  globalPosition: vec3;
};

export const getModelsGeometry = async () => {
  const view = new DataView(await (await fetch(modelBinUrl)).arrayBuffer());

  let offset = 0;
  const u8 = () => view.getUint8(offset++);

  const modelCount = u8();

  const bboxMin = [view.getFloat32(1), view.getFloat32(5), view.getFloat32(9)];
  const bboxSize = [view.getFloat32(13), view.getFloat32(17), view.getFloat32(21)];
  const maxCubeSize = view.getFloat32(25);
  offset = 29;

  const readPosition = (out: vec3) => {
    for (let k = 0; k < 3; k++) out[k] = (u8() / 255) * bboxSize[k] + bboxMin[k];
  };

  /** smallest three, see the encoder */
  const readRotation = (out: quat) => {
    const packed = view.getUint32(offset);
    offset += 4;

    const largest = Math.floor(packed / 0x40000000);
    let rest = packed % 0x40000000;

    let sum = 0;
    for (let k = 0; k < 4; k++) {
      if (k === largest) continue;
      const u = Math.floor(rest / 0x100000);
      rest = (rest % 0x100000) * 1024;
      const c = ((u / 1023) * 2 - 1) * Math.SQRT1_2;
      out[k] = c;
      sum += c * c;
    }
    out[largest] = Math.sqrt(Math.max(0, 1 - sum));
  };

  const headers = Array.from({ length: modelCount }, (_, i) => ({
    cubeCount: view.getUint8(29 + i * MODEL_HEADER_SIZE + 0),
    boneCount: view.getUint8(29 + i * MODEL_HEADER_SIZE + 1),
    poseCount: view.getUint8(29 + i * MODEL_HEADER_SIZE + 2),
  }));
  offset = 29 + modelCount * MODEL_HEADER_SIZE;

  const models = headers.map(({ cubeCount, boneCount, poseCount }) => ({
    cubeCount,
    poseCount,
    bonesCount: boneCount,
    colors: new Uint8Array(cubeCount),
    sizes: Array.from({ length: cubeCount }, () => new Float32Array(3) as vec3),
    centers: Array.from({ length: cubeCount }, () => new Float32Array(3) as vec3),
    rotations: Array.from({ length: cubeCount }, () => new Float32Array(4) as quat),
    bones: Array.from({ length: boneCount }, (): Bone => ({
      parent: -1,
      localPosition: new Float32Array(3) as vec3,
      restRotation: new Float32Array(4) as quat,
      restPosition: new Float32Array(3) as vec3,
      poses: Array.from({ length: poseCount }, () => new Float32Array(4) as quat),
      globalRotation: new Float32Array(4) as quat,
      globalPosition: new Float32Array(3) as vec3,
    })),
  }));

  //
  // cubes, plane by plane
  for (const m of models) for (let i = 0; i < m.cubeCount; i++) m.colors[i] = u8();

  for (const m of models)
    for (const size of m.sizes) for (let k = 0; k < 3; k++) size[k] = (u8() / 255) * maxCubeSize;

  for (const m of models) for (const center of m.centers) readPosition(center);

  for (const m of models) for (const rotation of m.rotations) readRotation(rotation);

  //
  // bones, interleaved
  for (const m of models)
    for (const bone of m.bones) {
      const parent = u8();
      bone.parent = parent === 255 ? -1 : parent;

      readPosition(bone.restPosition);
      readRotation(bone.restRotation); // still local at this point
    }

  //
  // poses
  for (const m of models)
    for (let p = 0; p < m.poseCount; p++) for (const bone of m.bones) readRotation(bone.poses[p]);

  //
  // resolve the rest pose. the file stores a local rotation and a global
  // position, we want the global rotation and the local offset
  for (const m of models)
    for (const bone of m.bones) {
      const parent = m.bones[bone.parent];

      if (!parent) {
        vec3.copy(bone.localPosition, bone.restPosition);
        continue;
      }

      // parents always come first, so the parent is already resolved
      quat.multiply(bone.restRotation, parent.restRotation, bone.restRotation);

      vec3.sub(bone.localPosition, bone.restPosition, parent.restPosition);
      quat.conjugate(q, parent.restRotation);
      vec3.transformQuat(bone.localPosition, bone.localPosition, q);
    }

  //
  // geometry
  return models.map((m) => {
    let vertexCount = 0;
    for (const size of m.sizes) vertexCount += getBoxVertexCount(size, QUAD_SIZE);

    const positions = new Float32Array(vertexCount * 3);
    const colorIndexes = new Uint8Array(vertexCount);

    let o = 0;
    for (let i = 0; i < m.cubeCount; i++) {
      const from = o / 3;
      o = fillBox(positions, o, m.centers[i], m.rotations[i], m.sizes[i], QUAD_SIZE);
      colorIndexes.fill(m.colors[i], from, o / 3);
    }

    const { boneWeights, boneIndexes } = computeBoneWeights(
      m.bones.map((b) =>
        vec3.scaleAndAdd(
          vec3.create(),
          b.restPosition,
          vec3.transformQuat(vec3.create(), BONE_AXIS, b.restRotation),
          BONE_WEIGHT_OFFSET,
        ),
      ),
      positions,
    );

    return {
      positions,
      colorIndexes,
      boneWeights,
      boneIndexes,
      bonesCount: m.bonesCount,
      poseCount: m.poseCount,
      bones: m.bones,
      applyPose: (
        out: Float32Array,
        outOffset: number,
        a: number,
        b: number,
        alpha: number,
        position: vec3,
        rotation: quat,
      ) => applyPose(out, outOffset, m.bones, a, b, alpha, position, rotation),
    };
  });
};

/**
 * blends two poses and writes one rigid transform per bone into out, as the
 * quaternion then the translation in xyz — the layout u_bones expects.
 *
 * the transform is poseGlobal * restGlobal^-1, so it applies to a vertex still
 * in its rest position.
 *
 * position and rotation place the model in the world. the skinned shader has no
 * object matrix, so it has to be folded in here — which costs nothing, a world
 * transform is just a virtual parent of every root bone.
 */
const applyPose = (
  out: Float32Array,
  outOffset: number,
  bones: Bone[],
  a: number,
  b: number,
  alpha: number,
  position: vec3,
  rotation: quat,
) => {
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    const parent = bones[bone.parent];

    quat.slerp(q, bone.poses[a], bone.poses[b], alpha);

    if (!parent) {
      quat.multiply(bone.globalRotation, rotation, q);
      vec3.transformQuat(bone.globalPosition, bone.localPosition, rotation);
      vec3.add(bone.globalPosition, bone.globalPosition, position);
    } else {
      quat.multiply(bone.globalRotation, parent.globalRotation, q);
      vec3.transformQuat(bone.globalPosition, bone.localPosition, parent.globalRotation);
      vec3.add(bone.globalPosition, bone.globalPosition, parent.globalPosition);
    }

    // skinning transform, rigid: (q, p) = (gq * rq^-1, gp - (gq * rq^-1) . rp)
    quat.conjugate(q, bone.restRotation);
    quat.multiply(q, bone.globalRotation, q);

    vec3.transformQuat(p, bone.restPosition, q);

    const o = outOffset + i * 8;
    out[o + 0] = q[0];
    out[o + 1] = q[1];
    out[o + 2] = q[2];
    out[o + 3] = q[3];
    out[o + 4] = bone.globalPosition[0] - p[0];
    out[o + 5] = bone.globalPosition[1] - p[1];
    out[o + 6] = bone.globalPosition[2] - p[2];
  }
};

// scratch, reused on every call
const p = new Float32Array(3) as vec3;
const q = new Float32Array(4) as quat;

export const UNICORN_MODELID = 2;
export const HUNTER_MODELID = 0;
export const HAT_MODELID = 1;
