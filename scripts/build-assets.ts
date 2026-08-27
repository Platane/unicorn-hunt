import { NodeIO, Scene, Node } from "@gltf-transform/core";
import { reorder, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mat4, vec3, quat } from "gl-matrix";

/**
 * file format
 *
 * 1     uint16    triangle count  = N
 * 1     uint8     bones count  = B
 * 1     uint8     animation count  = A
 * 3     float16   bbox min x,y,z
 * 3     float16   bbox size x,y,z
 *
 * N*3   uint8     triangle vertex indexes   -> we can infer the vertex count from that V
 *
 * V*3   uint8     vertex position quantified into the bbox
 *
 * B*
 *    1 uint8      parent id
 *    3 uint8      global position quantified
 *    4 uint8      rotation as quat quantified
 *
 * A*
 *    1 uint8      bone mask
 *    1 uint8      duration in second
 *
 *    for each bones in the mask
 *       1 uint8   number ok keys = K
 *
 *       K*
 *          1 uint8 key time
 *          4 uint8 rotation
 *
 */

const document = await new NodeIO().readBinary(
  new Uint8Array(await Bun.file(__dirname + "/../src/assets/Unicorn.glb").arrayBuffer()),
);

// weld merges duplicated vertices, reorder optimizes the triangle order for
// vertex cache locality and renumbers the vertices in first use order
await MeshoptEncoder.ready;
await document.transform(weld(), reorder({ encoder: MeshoptEncoder }));

const printTree = (node: Node | Scene, depth = 0) => {
  console.log(
    "  ".repeat(depth) +
      node.getName() +
      (node instanceof Node && node.getMesh() ? "  [mesh]" : "") +
      (node instanceof Node && node.getSkin() ? "  [skin]" : ""),
  );
  for (const child of node.listChildren()) printTree(child, depth + 1);
};
printTree(document.getRoot().listScenes()[0]);

// TODO:
// - delta encode the indexes

const models = document
  .getRoot()
  .listMeshes()
  .map((mesh) => {
    const node = mesh
      .listParents()
      .slice()
      .reverse()
      .find((n) => n instanceof Node)!;

    const primitive = mesh.listPrimitives()[0];
    const indices = primitive.getIndices()!.getArray()!;
    const positions = primitive.getAttribute("POSITION")!.getArray()!;
    const skin = node.getSkin();
    const joints = skin?.listJoints() ?? [];

    console.log(
      node.getName().padEnd(16, " "),
      "triangle count:",
      indices.length / 3,
      "vertex count:",
      positions.length / 3,
    );

    const worldMatrix = node.getWorldMatrix() as mat4;

    // compute bbox
    const bbox = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
      size: vec3.create(),
    };
    for (let i = 0; i < positions.length; i += 3) {
      const p = positions.slice(i, i + 3);
      // vec3.transformMat4(p, p, worldMatrix);  somehow

      for (let k = 3; k--;) {
        bbox.max[k] = Math.max(bbox.max[k], p[k]);
        bbox.min[k] = Math.min(bbox.min[k], p[k]);
      }
    }
    for (const joint of joints) {
      const p = joint.getWorldTranslation();

      for (let k = 3; k--;) {
        bbox.max[k] = Math.max(bbox.max[k], p[k]);
        bbox.min[k] = Math.min(bbox.min[k], p[k]);
      }
    }
    vec3.sub(bbox.size, bbox.max, bbox.min);

    // header
    const header = new Uint8Array(2 + 1 + 3 * 2 + 3 * 2);
    {
      const view = new DataView(header.buffer);

      view.setUint16(0, indices.length / 3);
      view.setUint8(2, joints.length);
      view.setFloat16(3 + 0 * 2, bbox.min[0]);
      view.setFloat16(3 + 1 * 2, bbox.min[1]);
      view.setFloat16(3 + 2 * 2, bbox.min[2]);

      view.setFloat16(3 + 3 * 2, bbox.size[0]);
      view.setFloat16(3 + 4 * 2, bbox.size[1]);
      view.setFloat16(3 + 5 * 2, bbox.size[2]);
    }

    // position
    const quantPositions = new Uint8Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const p = positions.slice(i, i + 3);
      // vec3.transformMat4(p, p, worldMatrix);

      for (let u = 0; u < 3; u++)
        quantPositions[i + u] = Math.round(((p[u] - bbox.min[u]) / bbox.size[u]) * 255);
    }

    // bones
    const bones = new Uint8Array(joints.length * (1 + 3 + 4));
    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i];

      const parent = joint.getParentNode();
      let parentIndex = joints.findIndex((j) => j === parent);
      if (parentIndex === -1) parentIndex = 255;

      bones[i * (1 + 3 + 4) + 0] = parentIndex;

      const p = joint.getWorldTranslation();
      for (let u = 0; u < 3; u++)
        bones[i * (1 + 3 + 4) + 1 + u] = Math.round(((p[u] - bbox.min[u]) / bbox.size[u]) * 255);

      const q = new Float32Array(joint.getRotation());
      quat.normalize(q, q);
      for (let u = 0; u < 4; u++)
        bones[i * (1 + 3 + 4) + 4 + u] = Math.round(((1 + q[u]) / 2) * 255);
    }

    return { header, quantPositions, indices: new Uint8Array(indices), bones };
  });

Bun.file(__dirname + "/../src/assets/models.bin").write(
  Buffer.concat([
    new Uint8Array([models.length]),
    ...models.map(({ header }) => header),
    ...models.map(({ indices }) => indices),
    ...models.map(({ quantPositions }) => quantPositions),
    ...models.map(({ bones }) => bones),
  ]),
);
