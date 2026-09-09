import { mat4, vec3 } from "gl-matrix";
import meshFragmentShaderCode from "./mesh/shader.frag" with { type: "text" };
import meshVertexShaderCode from "./mesh/shader.vert" with { type: "text" };
import meshSkinnedFragmentShaderCode from "./meshSkinned/shader.frag" with { type: "text" };
import meshSkinnedVertexShaderCode from "./meshSkinned/shader.vert" with { type: "text" };
import spriteFragmentShaderCode from "./sprite/shader.frag" with { type: "text" };
import spriteVertexShaderCode from "./sprite/shader.vert" with { type: "text" };
import { createProgram } from "./utils";
import { createSpriteSheet } from "./geometries/sprite";
import { createColorPalette } from "./geometries/colorPatette";
import { getFlatShadingNormals } from "./geometries/utils/getFlatShadingNormals";

export const MAX_ENTITIES = 1 << 11;
export const MAX_BONES = 16;

export const ENTITY_STRIDE = 4 * 5;
export const BONE_STRIDE = 8;

const UBO_BINDING_POINT_CAMERA = 1;

const TEXTURE_INDEX_SPRITE_SHEET = 0;
const TEXTURE_INDEX_COLOR_PALETTES = 1;

/**
 * sprite renderer
 *
 * usage:
 *   - caller fill the entities attributes
 *   - caller mutate viewMatrix
 *   - draw
 */
export const createRenderer = (
  canvas: HTMLCanvasElement,
  skinedModelGeometries: {
    bonesCount: number;
    positions: Float32Array;
    colorIndexes: Uint8Array;
    boneWeights: Float32Array;
    boneIndexes: Uint8Array;
  }[],
  instantiatedModelGeometries: {
    positions: Float32Array;
    colorIndexes: Uint8Array;
  }[],
) => {
  const gl = canvas.getContext("webgl2")!;

  const cameraUBOArray = new Float32Array(16 + 16 + 4);
  const projectionMatrix = new Float32Array(cameraUBOArray.buffer, 0, 16) as mat4;
  const viewMatrix = new Float32Array(cameraUBOArray.buffer, 16 * 4, 16) as mat4;
  const lightDirection = new Float32Array(cameraUBOArray.buffer, (16 + 16) * 4, 3) as vec3;
  vec3.set(lightDirection, 1, 2, 0.5);
  vec3.normalize(lightDirection, lightDirection);
  const cameraUBOBuffer = gl.createBuffer();

  gl.bindBufferBase(gl.UNIFORM_BUFFER, UBO_BINDING_POINT_CAMERA, cameraUBOBuffer);
  gl.bufferData(gl.UNIFORM_BUFFER, cameraUBOArray, gl.DYNAMIC_DRAW);

  const resize = (width: number, height: number, dpr: number) => {
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  //
  // sprite
  //
  const spriteProgram = createProgram(gl, spriteVertexShaderCode, spriteFragmentShaderCode);

  gl.uniformBlockBinding(
    spriteProgram,
    gl.getUniformBlockIndex(spriteProgram, "Camera"),
    UBO_BINDING_POINT_CAMERA,
  );

  const spriteVao = gl.createVertexArray();
  gl.bindVertexArray(spriteVao);

  {
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);

    gl.bufferData(
      gl.ARRAY_BUFFER,
      // interleaved position and texCoord
      new Float32Array([
        -0.5, 0.5, 0, 0,

        -0.5, -0.5, 0, 1,

        0.5, 0.5, 1, 0,

        0.5, -0.5, 1, 1,
      ]),
      gl.STATIC_DRAW,
    );

    const a_position = gl.getAttribLocation(spriteProgram, "a_position");
    const a_texCoord = gl.getAttribLocation(spriteProgram, "a_texCoord");

    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 16, 0); // read interleaved data, each vertex have 16 bytes ( (2+2) * 4 bytes for float32 ), position offset is 0

    gl.enableVertexAttribArray(a_texCoord);
    gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 16, 8);
  }

  const spriteEntitiesBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteEntitiesBuffer);
  {
    let byteOffset = 0;
    for (const attributeName of [
      "a_objectMatrix1",
      "a_objectMatrix2",
      "a_objectMatrix3",
      "a_objectMatrix4",
      "a_spriteBox",
    ]) {
      const location = gl.getAttribLocation(spriteProgram, attributeName);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 16 * 5, byteOffset);
      gl.vertexAttribDivisor(location, 1);
      byteOffset += 16;
    }
  }

  const spritesEntities = {
    data: new Float32Array(MAX_ENTITIES * ENTITY_STRIDE),
    count: 0,
    version: 0,
  };
  let spritesUploadedVersion = -1;

  {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_INDEX_SPRITE_SHEET);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createSpriteSheet());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(spriteProgram);
    gl.uniform1i(
      gl.getUniformLocation(spriteProgram, "u_colorTexture"),
      TEXTURE_INDEX_SPRITE_SHEET,
    );
  }

  //
  // instantiated models
  //
  const meshProgram = createProgram(gl, meshVertexShaderCode, meshFragmentShaderCode);

  gl.uniformBlockBinding(
    meshProgram,
    gl.getUniformBlockIndex(meshProgram, "Camera"),
    UBO_BINDING_POINT_CAMERA,
  );

  const instantiatedModelVaos = instantiatedModelGeometries.map((g) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const normals = new Float32Array(g.positions.length);
    getFlatShadingNormals(normals, g.positions);

    const a_position = gl.getAttribLocation(meshProgram, "a_position");
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);

    const a_normal = gl.getAttribLocation(meshProgram, "a_normal");
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_normal);
    gl.vertexAttribPointer(a_normal, 3, gl.FLOAT, false, 0, 0);

    const a_colorIndex = gl.getAttribLocation(meshProgram, "a_colorIndex");
    const colorIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, g.colorIndexes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_colorIndex);
    gl.vertexAttribIPointer(a_colorIndex, 1, gl.UNSIGNED_BYTE, 0, 0);

    const entitiesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, entitiesBuffer);
    let byteOffset = 0;
    for (const attributeName of [
      "a_objectMatrix1",
      "a_objectMatrix2",
      "a_objectMatrix3",
      "a_objectMatrix4",
      "a_colorPalette",
    ]) {
      const location = gl.getAttribLocation(meshProgram, attributeName);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 16 * 5, byteOffset);
      gl.vertexAttribDivisor(location, 1);
      byteOffset += 16;
    }

    return { vao, entitiesBuffer, vertexCount: g.positions.length / 3, uploadedVersion: -1 };
  });

  const instantiatedModelEntities = instantiatedModelGeometries.map(() => ({
    data: new Float32Array(MAX_ENTITIES * ENTITY_STRIDE),
    count: 0,
    version: 0,
  }));

  {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_INDEX_COLOR_PALETTES);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createColorPalette());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(meshProgram);
    gl.uniform1i(
      gl.getUniformLocation(meshProgram, "u_colorPalettesTexture"),
      TEXTURE_INDEX_COLOR_PALETTES,
    );
  }

  //
  // meshes
  //
  const meshes: Mesh[] = [];

  const addMesh = (): Mesh => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    const a_position = gl.getAttribLocation(meshProgram, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);

    const normalBuffer = gl.createBuffer();
    const a_normal = gl.getAttribLocation(meshProgram, "a_normal");
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.enableVertexAttribArray(a_normal);
    gl.vertexAttribPointer(a_normal, 3, gl.FLOAT, false, 0, 0);

    const colorIndexBuffer = gl.createBuffer();
    const a_colorIndex = gl.getAttribLocation(meshProgram, "a_colorIndex");
    gl.bindBuffer(gl.ARRAY_BUFFER, colorIndexBuffer);
    gl.enableVertexAttribArray(a_colorIndex);
    gl.vertexAttribIPointer(a_colorIndex, 1, gl.UNSIGNED_BYTE, 0, 0);

    // left disabled, so the generic attribute value stands in: identity object matrix
    gl.vertexAttrib4f(gl.getAttribLocation(meshProgram, "a_objectMatrix1"), 1, 0, 0, 0);
    gl.vertexAttrib4f(gl.getAttribLocation(meshProgram, "a_objectMatrix2"), 0, 1, 0, 0);
    gl.vertexAttrib4f(gl.getAttribLocation(meshProgram, "a_objectMatrix3"), 0, 0, 1, 0);
    gl.vertexAttrib4f(gl.getAttribLocation(meshProgram, "a_objectMatrix4"), 0, 0, 0, 1);
    gl.vertexAttrib4f(gl.getAttribLocation(meshProgram, "a_colorPalette"), 0, 0, 0, 0);

    const mesh = {
      vao,
      positionBuffer,
      normalBuffer,
      colorIndexBuffer,
      vertexCount: 0,
    };
    meshes.push(mesh);

    return mesh;
  };

  //
  // skinned models
  //
  const meshSkinnedProgram = createProgram(
    gl,
    meshSkinnedVertexShaderCode,
    meshSkinnedFragmentShaderCode,
  );
  gl.uniformBlockBinding(
    meshSkinnedProgram,
    gl.getUniformBlockIndex(meshSkinnedProgram, "Camera"),
    UBO_BINDING_POINT_CAMERA,
  );
  const u_meshSkinnedBones = gl.getUniformLocation(meshSkinnedProgram, "u_bones");

  // sorted by modelId, we only rebind on change
  const skinnedModelEntities: { data: Float32Array; modelId: number }[] = [];
  const modelVaos = skinedModelGeometries.map((g) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vertexCount = g.positions.length / 3;

    const a_position = gl.getAttribLocation(meshSkinnedProgram, "a_position");
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);

    const a_boneWeight = gl.getAttribLocation(meshSkinnedProgram, "a_boneWeight");
    const weightBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, weightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, g.boneWeights, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_boneWeight);
    gl.vertexAttribPointer(a_boneWeight, 4, gl.FLOAT, false, 0, 0);

    // the skinned shader has no a_colorIndex, so the location comes back -1 and
    // setting it up raises INVALID_VALUE. left guarded rather than deleted, for
    // when the shader does take one
    const a_colorIndex = gl.getAttribLocation(meshSkinnedProgram, "a_colorIndex");
    if (a_colorIndex >= 0) {
      const colorIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colorIndexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, g.colorIndexes, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a_colorIndex);
      gl.vertexAttribIPointer(a_colorIndex, 1, gl.UNSIGNED_BYTE, 0, 0);
    }

    const a_boneIndex = gl.getAttribLocation(meshSkinnedProgram, "a_boneIndex");
    const boneIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, boneIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, g.boneIndexes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_boneIndex);
    gl.vertexAttribIPointer(a_boneIndex, 4, gl.UNSIGNED_BYTE, 0, 0);

    return { vao, vertexCount };
  });

  //
  //
  //

  gl.disable(gl.CULL_FACE);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const draw = () => {
    gl.bindBufferBase(gl.UNIFORM_BUFFER, UBO_BINDING_POINT_CAMERA, cameraUBOBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, cameraUBOArray, gl.DYNAMIC_DRAW);

    //
    // meshes

    gl.useProgram(meshProgram);
    for (const m of meshes) {
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.vertexCount);
      // gl.drawArrays(gl.LINE_STRIP, 0, m.vertexCount);
    }

    //
    // instantiated models

    for (let i = 0; i < instantiatedModelVaos.length; i++) {
      const m = instantiatedModelVaos[i];
      const e = instantiatedModelEntities[i];

      gl.bindVertexArray(m.vao);

      if (m.uploadedVersion !== e.version) {
        m.uploadedVersion = e.version;

        gl.bindBuffer(gl.ARRAY_BUFFER, m.entitiesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, e.data, gl.DYNAMIC_DRAW, 0, e.count * ENTITY_STRIDE);
      }

      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.vertexCount, e.count);
    }

    //
    // skinned models

    gl.useProgram(meshSkinnedProgram);
    let modelId = -1;
    for (const e of skinnedModelEntities) {
      if (e.modelId !== modelId) {
        modelId = e.modelId;
        gl.bindVertexArray(modelVaos[modelId].vao);
      }

      gl.uniform4fv(
        u_meshSkinnedBones,
        e.data,
        0,
        skinedModelGeometries[modelId].bonesCount * BONE_STRIDE,
      );

      gl.drawArrays(gl.TRIANGLES, 0, modelVaos[modelId].vertexCount);
    }

    //
    // sprites

    gl.useProgram(spriteProgram);
    gl.bindVertexArray(spriteVao);

    if (spritesUploadedVersion !== spritesEntities.version) {
      spritesUploadedVersion = spritesEntities.version;

      gl.bindBuffer(gl.ARRAY_BUFFER, spriteEntitiesBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        spritesEntities.data,
        gl.DYNAMIC_DRAW,
        0,
        spritesEntities.count * ENTITY_STRIDE,
      );
    }

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, spritesEntities.count);
  };

  return {
    resize,
    viewMatrix,
    projectionMatrix,
    gl,
    addMesh,
    skinnedModelEntities,
    spritesEntities,
    instantiatedModelEntities,
    draw,
  };
};

export const uploadMesh = (
  gl: WebGL2RenderingContext,
  mesh: Mesh,
  positions: Float32Array,
  normals: Float32Array,
  colorIndex: Uint8Array,
  vertexCount: number,
) => {
  mesh.vertexCount = vertexCount;

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW, 0, vertexCount * 3);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW, 0, vertexCount * 3);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorIndexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colorIndex, gl.STATIC_DRAW, 0, vertexCount);
};

export type Mesh = {
  vao: WebGLVertexArrayObject;
  positionBuffer: WebGLBuffer;
  normalBuffer: WebGLBuffer;
  colorIndexBuffer: WebGLBuffer;
  vertexCount: number;
};
