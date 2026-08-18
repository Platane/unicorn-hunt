import { mat4, vec3, vec4 } from "gl-matrix";
import meshFragmentShaderCode from "./mesh/shader.frag" with { type: "text" };
import meshVertexShaderCode from "./mesh/shader.vert" with { type: "text" };
import spriteFragmentShaderCode from "./sprite/shader.frag" with { type: "text" };
import spriteVertexShaderCode from "./sprite/shader.vert" with { type: "text" };
import { createProgram } from "./utils";
import { createSpriteSheet } from "./geometries/sprite";
import { createRecursiveSphere } from "./geometries/recursiveSphere";
import { getFlatShadingNormals } from "../utils/geometry-normals";
import { createColorPalette } from "./geometries/colorPatette";

export const MAX_ENTITIES = 1 << 10;

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
export const createRenderer = async (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl2")!;

  const cameraUBOArray = new Float32Array(16 + 16 + 4);
  const projectionMatrix = new Float32Array(cameraUBOArray.buffer, 0, 16);
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

    const aspect = canvas.width / canvas.height;
    mat4.perspective(projectionMatrix, Math.PI / 4, aspect, 0.1, 2000);
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

  const spriteEntitiesData = new Float32Array(MAX_ENTITIES * 4 * 5);
  const spritesEntities = {
    items: Array.from({ length: MAX_ENTITIES }, (_, i) => ({
      transform: new Float32Array(spriteEntitiesData.buffer, i * 16 * 5, 16) as mat4,
      spriteBox: new Float32Array(spriteEntitiesData.buffer, i * 16 * 5 + 16 * 4, 4) as vec4,
    })),
    count: 0,
  };

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
  // ball
  //
  const meshProgram = createProgram(gl, meshVertexShaderCode, meshFragmentShaderCode);

  gl.uniformBlockBinding(
    meshProgram,
    gl.getUniformBlockIndex(meshProgram, "Camera"),
    UBO_BINDING_POINT_CAMERA,
  );

  let ballVertexCount = 0;
  const ballVao = gl.createVertexArray();
  gl.bindVertexArray(ballVao);

  {
    const positions = new Float32Array(createRecursiveSphere({ tessellationStep: 4 }));
    const normals = getFlatShadingNormals(positions);
    const colorIndex = new Uint8Array(
      Array.from({ length: positions.length / (3 * 3) }, () => {
        const a = Math.floor(Math.random() * 8);
        return [a, a, a];
      }).flat(),
    );

    ballVertexCount = positions.length / 3;

    const a_position = gl.getAttribLocation(meshProgram, "a_position");
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
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
    gl.bufferData(gl.ARRAY_BUFFER, colorIndex, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_colorIndex);
    gl.vertexAttribIPointer(a_colorIndex, 1, gl.UNSIGNED_BYTE, 0, 0);
  }

  const ballEntitiesBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ballEntitiesBuffer);
  byteOffset = 0;
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

  const ballEntitiesData = new Float32Array(MAX_ENTITIES * 4 * 5);
  const ballsEntities = {
    items: Array.from({ length: MAX_ENTITIES }, (_, i) => ({
      transform: new Float32Array(ballEntitiesData.buffer, i * 16 * 5, 16) as mat4,
      colorPalette: new Float32Array(ballEntitiesData.buffer, i * 16 * 5 + 16 * 4, 4) as vec4,
    })),
    count: 0,
  };

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

    gl.bindBuffer(gl.ARRAY_BUFFER, ballEntitiesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ballEntitiesData, gl.DYNAMIC_DRAW, 0, ballsEntities.count * 20);

    gl.useProgram(meshProgram);
    gl.bindVertexArray(ballVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, ballVertexCount, ballsEntities.count);

    gl.bindBuffer(gl.ARRAY_BUFFER, spriteEntitiesBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      spriteEntitiesData,
      gl.DYNAMIC_DRAW,
      0,
      spritesEntities.count * 20,
    );

    gl.useProgram(spriteProgram);
    gl.bindVertexArray(spriteVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, spritesEntities.count);
  };

  return { resize, viewMatrix, spritesEntities, ballsEntities, draw };
};
