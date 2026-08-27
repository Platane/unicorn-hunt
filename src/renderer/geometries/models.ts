import { quat, vec3 } from "gl-matrix";
import modelBinUrl from "../../assets/models.bin" with { type: "file" };
import { computeBoneWeights } from "./utils/computeBoneWeights";
import { flattenIndex } from "./utils/flattenIndex";

const HEADER_SIZE = 1 + 2 + 3 * 2 * 2;

export const getModelsGeometry = async () => {
  const res = await fetch(modelBinUrl);
  const view = new DataView(await res.arrayBuffer());

  const n = view.getUint8(0);

  let offset = 1 + n * HEADER_SIZE;
  const models = Array.from({ length: n }, (_, i) => {
    const triangleCount = view.getUint16(1 + i * HEADER_SIZE + 0);
    const bonesCount = view.getUint8(1 + i * HEADER_SIZE + 2);
    const bbboxMin = [
      view.getFloat16(1 + i * HEADER_SIZE + 3 + 0 * 2),
      view.getFloat16(1 + i * HEADER_SIZE + 3 + 1 * 2),
      view.getFloat16(1 + i * HEADER_SIZE + 3 + 2 * 2),
    ];
    const bbboxSize = [
      view.getFloat16(1 + i * HEADER_SIZE + 3 + 3 * 2),
      view.getFloat16(1 + i * HEADER_SIZE + 3 + 4 * 2),
      view.getFloat16(1 + i * HEADER_SIZE + 3 + 5 * 2),
    ];
    const indexes = new Uint8Array(view.buffer, offset, triangleCount * 3);
    offset += triangleCount * 3;
    const vertexCount = indexes.reduce((max, i) => Math.max(max, i)) + 1;

    const positions = new Float32Array(vertexCount * 3);

    const bones = Array.from({ length: bonesCount }, () => ({
      parent: 0,
      rotation: new Float32Array(4) as quat,
      position: new Float32Array(3) as vec3,
      globalPosition: new Float32Array(3) as vec3,
    }));

    return {
      triangleCount,
      bonesCount,
      vertexCount,
      indexes,
      positions,
      bones,
      bbboxSize,
      bbboxMin,

      colorIndexes: new Uint8Array(),
      boneWeights: new Float32Array(),
      boneIndexes: new Uint8Array(),
    };
  });

  for (const model of models) {
    for (let i = model.positions.length; i--;) {
      model.positions[i] =
        (view.getUint8(offset + i) / 255) * model.bbboxSize[i % 3] + model.bbboxMin[i % 3];
    }
    offset += model.positions.length;
  }

  for (const model of models) {
    for (let i = 0; i < model.bones.length; i++) {
      const bone = model.bones[i];

      bone.parent = view.getUint8(offset);
      offset++;

      for (let k = 0; k < 3; k++) {
        bone.globalPosition[k] =
          (view.getUint8(offset) / 255) * model.bbboxSize[k] + model.bbboxMin[k];
        offset++;
      }

      for (let k = 0; k < 4; k++) {
        bone.rotation[k] = (view.getUint8(offset) / 255) * 2 - 1;
        offset++;
      }
      quat.normalize(bone.rotation, bone.rotation);

      //
      // compute local position
      const parent = model.bones[bone.parent];
      if (!parent) vec3.copy(bone.position, bone.globalPosition);
      else {
        const parentGlobalRotation = quat.create();
        quat.identity(parentGlobalRotation);
        let ancestor = parent;
        do {
          quat.multiply(parentGlobalRotation, ancestor.rotation, parentGlobalRotation);
          ancestor = model.bones[ancestor.parent];
        } while (ancestor);

        quat.conjugate(q, parentGlobalRotation);
        quat.multiply(bone.rotation, q, bone.rotation);

        vec3.sub(bone.position, bone.globalPosition, parent.globalPosition);
        vec3.transformQuat(bone.position, bone.position, q);
      }
    }

    // const bonesInvTransforms = model.bones.map(b =>  )

    Object.assign(
      model,
      computeBoneWeights(
        model.bones.map((b) => b.globalPosition),
        model.positions,
      ),
    );

    {
      const p = new Float32Array(model.indexes.length * 3);
      flattenIndex(p, 3, model.indexes, model.positions);
      model.positions = p;
    }
    {
      const p = new Uint8Array(model.indexes.length);
      flattenIndex(p, 1, model.indexes, model.colorIndexes);
      model.colorIndexes = p;
    }
    {
      const p = new Uint8Array(model.indexes.length * 4);
      flattenIndex(p, 4, model.indexes, model.boneIndexes);
      model.boneIndexes = p;
    }
    {
      const p = new Float32Array(model.indexes.length * 4);
      flattenIndex(p, 4, model.indexes, model.boneWeights);
      model.boneWeights = p;
    }
  }

  return models;
};

const p = new Float32Array(3);
const q = new Float32Array(4) as quat;
