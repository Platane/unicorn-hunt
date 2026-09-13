import { mat4, vec3, quat } from "gl-matrix";
import { BONE_STRIDE, createRenderer, MAX_BONES, uploadMesh, type Mesh } from "../renderer";
import {
  getModelsGeometry,
  HAT_MODELID,
  HUNTER_MODELID,
  UNICORN_MODELID,
} from "../renderer/geometries/models";
import { createRecursiveSphere } from "../renderer/geometries/recursiveSphere";
import { createGroundGeometry } from "../renderer/geometries/ground";
import { stepSpring3 } from "../utils/spring";
import { applyDecorum, applyGround, applyWorld } from "./applyWorld";
import { lerpWorld } from "./lerpWorld";
import type { WorldSnapshot } from "../game/state/types";
import type { createGameSync } from "../game/state/sync";
import {
  createRainbowRibbonGeometry,
  fillRainbowRibbon,
} from "../renderer/geometries/rainbowRibbon";
import { HUNTER_JUMP_DURATION, TRAIL_RADIUS } from "../game/state/stepper";
import { HUNTERS_VARIANTS, UNICORN_VARIANTS } from "../renderer/geometries/colorPatette";
import { hashString } from "../utils/hash";

const INSTANTIATED_MODEL_BUSH = 0;

const CAMERA_FOVY = Math.PI * 0.25;
const VISIBLE_WIDTH = 16;
const VISIBLE_MIN_HEIGHT = 10;
const VISIBLE_MAX_HEIGHT = 28;

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
  let geometries: Awaited<ReturnType<typeof getModelsGeometry>> = [];
  let groundMesh: Mesh;
  let rainbowRibbonMesh: Mesh;

  const geometryPromise = getModelsGeometry().then((g) => {
    geometries = g;
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
  let lastFrameDate: number;

  const camera = {
    position: [0, -2, 10] as unknown as vec3,
    velocity: new Float32Array(3) as vec3,
  };

  // hunter position in screen space, serves as the touch stick origin
  // reads the rendered snapshot, so the origin sits on the hunter as drawn
  const getHunterScreenPos = (playerId: string) => {
    const p = renderedWorldSnapshot?.hunters.find((h) => h.id === playerId);
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
    const dt = Math.max(60, now - (lastFrameDate ?? now));
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
      let w = canvas.width;
      let h = canvas.height;

      // letterbox: keep the visible height within [min, max] at the fixed width
      if (w / h > VISIBLE_WIDTH / VISIBLE_MIN_HEIGHT) w = (h * VISIBLE_WIDTH) / VISIBLE_MIN_HEIGHT;
      if (w / h < VISIBLE_WIDTH / VISIBLE_MAX_HEIGHT) h = (w * VISIBLE_MAX_HEIGHT) / VISIBLE_WIDTH;
      renderer.gl.viewport((canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

      const aspect = w / h;
      mat4.perspective(renderer.projectionMatrix, CAMERA_FOVY, aspect, 2, 80);

      // altitude that fits VISIBLE_WIDTH, 1.17 ≈ distance / altitude for the 0.6 offset
      const zoom = player.riding && player.onTrail ? 0.8 : 1;
      const altitude = (zoom * VISIBLE_WIDTH) / aspect / (2 * Math.tan(CAMERA_FOVY / 2) * 1.17);

      vec3.set(v, player.position[0], player.position[1] - altitude * 0.6, altitude);

      // first frame snaps, then the spring follows; dt is ms, the spring wants seconds,
      // clamped so a stalled tab does not blow it up

      stepSpring3(camera.position, camera.velocity, v, { tension: 120, friction: 12 }, dt / 1000);

      mat4.lookAt(
        renderer.viewMatrix,
        camera.position,
        [player.position[0], player.position[1] + 2, 0],
        [0, 1, 0],
      );
    }

    applyWorld(renderedWorldSnapshot, renderer, playerId);

    {
      //
      // entities

      let skinnedEntityIndex = 0;
      const getNextEntity = () => {
        while (!renderer.skinnedModelEntities[skinnedEntityIndex])
          renderer.skinnedModelEntities.push({
            data: new Float32Array(MAX_BONES * BONE_STRIDE),
            modelId: 0,
            colorPalette: 0,
          });
        const e = renderer.skinnedModelEntities[skinnedEntityIndex];
        skinnedEntityIndex++;
        return e;
      };

      renderedWorldSnapshot.unicorns.forEach((u) => {
        const e = getNextEntity();
        e.modelId = UNICORN_MODELID;
        e.colorPalette = UNICORN_VARIANTS[u.id % UNICORN_VARIANTS.length];

        const q = new Float32Array(4) as quat;
        quat.fromEuler(q, 0, 0, (Math.atan2(u.direction[0], -u.direction[1]) / Math.PI) * 180);

        geometries[e.modelId].applyPose(
          e.data,
          ...cyclePoses(UNICORN_WALKING_POSES, Date.now() / 280),
          [...u.position, 0],
          q,
        );
      });

      renderedWorldSnapshot.hunters.forEach((h, i) => {
        const q = new Float32Array(4) as quat;
        quat.fromEuler(q, 0, 0, (Math.atan2(h.direction[0], -h.direction[1]) / Math.PI) * 180);

        const jumpHeight = h.jumping
          ? 1 - (2 * Math.abs(0.5 - h.jumping.remainingTime / HUNTER_JUMP_DURATION)) ** 2
          : 0;

        const e = getNextEntity();

        e.modelId = HUNTER_MODELID;
        e.colorPalette = HUNTERS_VARIANTS[i % HUNTERS_VARIANTS.length];

        // const hh = getNextEntity();
        // hh.modelId = HAT_MODELID;
        // hh.colorPalette = HUNTERS_VARIANTS[0];
        // geometries[e.modelId].applyPose(
        //   hh.data,
        //   ...cyclePoses(HAT_POSES, Date.now() / 230),
        //   [...h.position, jumpHeight * 1.05 + 1],
        //   q,
        // );

        if (h.riding) {
          geometries[e.modelId].applyPose(
            e.data,
            ...cyclePoses(HUNTER_SITTING_POSES, Date.now() / 230),
            [...h.position, jumpHeight + 0.5],
            q,
          );

          const u = getNextEntity();

          u.modelId = UNICORN_MODELID;
          u.colorPalette = UNICORN_VARIANTS[h.riding.unicornId % UNICORN_VARIANTS.length];
          geometries[u.modelId].applyPose(
            u.data,
            ...cyclePoses(UNICORN_RUNNING_POSES, Date.now() / 60),
            [...h.position, jumpHeight],
            q,
          );
        } else {
          if (jumpHeight > 0)
            geometries[e.modelId].applyPose(
              e.data,
              HUNTER_WALKING_POSES[0],
              HUNTER_WALKING_POSES[0],
              0,
              [...h.position, jumpHeight],
              q,
            );
          else
            geometries[e.modelId].applyPose(
              e.data,
              ...cyclePoses(HUNTER_WALKING_POSES, Date.now() / 230),
              [...h.position, jumpHeight],
              q,
            );
        }
      });

      renderer.skinnedModelEntities.length = skinnedEntityIndex;
    }

    //
    // rainbow ribbon
    {
      const o = renderedTrailOffset;
      let i = renderedTrailIndex;
      let offset = 0;
      for (; i < renderedWorldSnapshot.rainbowTrails.length; i++) {
        offset = fillRainbowRibbon(
          rainbowRibbonGeometry.positions,
          offset,
          renderedWorldSnapshot.rainbowTrails[i],
          TRAIL_RADIUS,
        );

        if (!renderedWorldSnapshot.hunters.some((h) => h.riding?.trailIndex === i)) {
          renderedTrailIndex = i + 1;
          renderedTrailOffset = o + offset;
        }
      }
      rainbowRibbonMesh.vertexCount = (o + offset) / 3;
      const { gl } = renderer;
      gl.bindBuffer(gl.ARRAY_BUFFER, rainbowRibbonMesh.positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, o * 4, rainbowRibbonGeometry.positions, 0, offset);
    }

    renderer.draw();
  };

  return { step, getHunterScreenPos, ready: geometryPromise };
};

const cyclePoses = (poses: number[], k: number) => {
  const u = k / poses.length;
  const a = Math.floor(u) % poses.length;
  const b = (a + 1) % poses.length;

  return [poses[a], poses[b], u % 1] as [number, number, number];
};

const HUNTER_IDLE_POSE = 2;
const HUNTER_WALKING_POSES = [3, 4];
const HUNTER_SITTING_POSES = [5, 6];

const UNICORN_WALKING_POSES = [2, 3];
const UNICORN_RUNNING_POSES = [4, 5, 6];

const HAT_POSES = [2, 3];
