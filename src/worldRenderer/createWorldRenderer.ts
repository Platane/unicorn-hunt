import { mat4, quat, vec3 } from "gl-matrix";
import { BONE_STRIDE, createRenderer, MAX_BONES, uploadMesh, type Mesh } from "../renderer";
import { getModelsGeometry } from "../renderer/geometries/models";
import { createRecursiveSphere } from "../renderer/geometries/recursiveSphere";
import { createGroundGeometry } from "../renderer/geometries/ground";
import { setBoneAt } from "../utils/transform";
import { stepSpring3 } from "../utils/spring";
import { applyDecorum, applyGround, applyWorld } from "./applyWorld";
import { lerpWorld } from "./lerpWorld";
import type { WorldSnapshot } from "../game/state/types";
import type { createGameSync } from "../game/state/sync";
import {
  createRainbowRibbonGeometry,
  fillRainbowRibbon,
} from "../renderer/geometries/rainbowRibbon";
import { TRAIL_RADIUS } from "../game/state/stepper";

const INSTANTIATED_MODEL_BUSH = 0;

const CAMERA_ALTITUDE = 10;

const createSphereGeometry = (tessellationStep: number) => {
  const positions = new Float32Array(createRecursiveSphere({ tessellationStep }));
  const colorIndexes = new Uint8Array(positions.length / 3);
  for (let i = 0; i < colorIndexes.length; i += 3)
    colorIndexes[i] = colorIndexes[i + 1] = colorIndexes[i + 2] = Math.floor(Math.random() * 8);
  return { positions, colorIndexes };
};

export const createWorldRenderer = (canvas: HTMLCanvasElement) => {
  const groundGeometry = createGroundGeometry();
  const rainbowRibbonGeometry = createRainbowRibbonGeometry();

  let renderer: ReturnType<typeof createRenderer>;
  let groundMesh: Mesh;
  let rainbowRibbonMesh: Mesh;

  const geometryPromise = getModelsGeometry().then((geometries) => {
    renderer = createRenderer(canvas, geometries, [createSphereGeometry(3)]);

    groundMesh = renderer.addMesh();
    rainbowRibbonMesh = renderer.addMesh();

    uploadMesh(
      renderer.gl,
      rainbowRibbonMesh,
      rainbowRibbonGeometry.positions,
      rainbowRibbonGeometry.normals,
      rainbowRibbonGeometry.colorIndex,
      rainbowRibbonGeometry.colorIndex.length,
    );

    // debug
    {
      // const data = new Float32Array(MAX_BONES * BONE_STRIDE);
      // const identity = quat.identity(new Float32Array(4) as quat);
      // const zero = new Float32Array(3) as vec3;
      // for (let k = MAX_BONES; k--;) setBoneAt(data, k * BONE_STRIDE, zero, identity);
      // renderer.skinnedModelEntities.push({ data, modelId: 0 });
    }

    window.onresize = () =>
      renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    (window as any).onresize();
  });

  // scratch, reused every frame
  const v = new Float32Array(3) as vec3;

  let renderedTrailIndex = 0;
  let renderedTrailOffset = 0;
  let renderedGroundOrigin = -Infinity;
  let renderedWorldSnapshot: WorldSnapshot | undefined;
  let lastFrameDate = 0;

  const camera = {
    position: [0, -2, 10] as unknown as vec3,
    velocity: new Float32Array(3) as vec3,
    fov: Math.PI * 0.25,
  };

  // hunter position in screen space, serves as the touch stick origin
  const getHunterScreenPos = (snapshot: WorldSnapshot | undefined, playerId: string) => {
    const p = snapshot?.hunters.find((h) => h.id === playerId);
    if (!p || !renderer) return;

    const viewProjMatrix = mat4.create();
    const projectedPoint = vec3.create();

    mat4.multiply(viewProjMatrix, renderer.projectionMatrix, renderer.viewMatrix);

    vec3.set(projectedPoint, p.position[0], p.position[1], 0.01);
    vec3.transformMat4(projectedPoint, projectedPoint, viewProjMatrix);

    return [
      ((projectedPoint[0] + 1) / 2) * canvas.clientWidth,
      ((1 - projectedPoint[1]) / 2) * canvas.clientHeight,
    ] as [number, number];
  };

  const step = (state: ReturnType<typeof createGameSync>, playerId: string) => {
    const s0 = state.snapshots[0];
    if (!renderer || !s0) return;

    //
    // ground follows the player, rebuilt only when they drift far enough
    {
      const p = s0.hunters.find((h) => h.id === playerId);
      if (p && state.map && Math.abs(p.position[1] - renderedGroundOrigin) > 16) {
        renderedGroundOrigin = Math.round(p.position[1]);
        const range: [number, number] = [renderedGroundOrigin - 32, renderedGroundOrigin + 32];
        applyGround(state.map, range, groundGeometry);
        uploadMesh(
          renderer.gl,
          groundMesh,
          groundGeometry.positions,
          groundGeometry.normals,
          groundGeometry.colorIndex,
          groundGeometry.vertexCount,
        );

        applyDecorum(state.map, range, renderer.instantiatedModelEntities[INSTANTIATED_MODEL_BUSH]);
      }
    }

    //
    // lerp the logical world
    renderedWorldSnapshot = renderedWorldSnapshot ?? s0;

    const target = lerpWorld(
      state.snapshots[1] ?? state.snapshots[0],
      state.snapshots[0],
      state.currentGeneration % 1,
    );

    const now = Date.now();
    const dt = lastFrameDate ? now - lastFrameDate : Infinity;
    lastFrameDate = now;

    // how fast the rendered world catches up with the interpolated target
    const tau = state.hostLatency * 0.5;

    renderedWorldSnapshot =
      tau > 0 ? lerpWorld(renderedWorldSnapshot, target, 1 - Math.exp(-dt / tau)) : target;

    const player = renderedWorldSnapshot.hunters.find((h) => h.id === playerId);
    if (!player) return;

    //
    // camera
    {
      const fovxTarget = player.riding && player.onTrail ? Math.PI * 0.2 : Math.PI * 0.25;
      camera.fov = camera.fov * 0.9 + fovxTarget * 0.1;

      const aspect = canvas.width / canvas.height;
      const fovy = 2 * Math.atan(Math.tan(camera.fov / 2) / aspect);
      mat4.perspective(renderer.projectionMatrix, fovy, aspect, 0.1, 2000);

      vec3.set(v, player.position[0], player.position[1] - CAMERA_ALTITUDE * 0.3, CAMERA_ALTITUDE);

      stepSpring3(camera.position, camera.velocity, v, { tension: 120, friction: 12 }, dt);

      vec3.copy(camera.position, v);

      mat4.lookAt(
        renderer.viewMatrix,
        camera.position,
        [player.position[0], player.position[1] + 2, 0],
        [0, 1, 0],
      );
    }

    applyWorld(renderedWorldSnapshot, renderer, playerId);

    //
    // rainbow ribbon
    {
      const o = renderedTrailIndex;
      let i = renderedTrailIndex;
      let offset = renderedTrailOffset;
      for (; i < renderedWorldSnapshot.rainbowTrails.length; i++) {
        offset = fillRainbowRibbon(
          rainbowRibbonGeometry.positions,
          offset,
          renderedWorldSnapshot.rainbowTrails[i],
          TRAIL_RADIUS,
        );

        if (!renderedWorldSnapshot.hunters.some((h) => h.riding?.trailIndex === i)) {
          renderedTrailIndex = i + 1;
          renderedTrailOffset = offset;
        }
      }
      rainbowRibbonMesh.vertexCount = offset / 3;
      const { gl } = renderer;
      gl.bindBuffer(gl.ARRAY_BUFFER, rainbowRibbonMesh.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, rainbowRibbonGeometry.positions, gl.DYNAMIC_DRAW, 0, offset);
    }

    renderer.draw();
  };

  return { step, getHunterScreenPos, ready: geometryPromise };
};
