import "./global.css";
import { createGameSync } from "./game/state/sync";
import { mat4, quat, vec3 } from "gl-matrix";
import { BONE_STRIDE, createRenderer, MAX_BONES } from "./renderer";
import { createKeyboardController } from "./game/state/controller-keyboard";
import { createInitialState } from "./game/state/stepper";
import type { WavedashSDK } from "@wvdsh/sdk-js";
import { getModelsGeometry } from "./renderer/geometries/models";
import { stepSpring, stepSpring3 } from "./utils/spring";
import { applyDecorum, applyGround, applyWorld } from "./applyWorld";
import { createRecursiveSphere } from "./renderer/geometries/recursiveSphere";
import { createGroundGeometry } from "./renderer/geometries/ground";
import { setBoneAt } from "./utils/transform";
import { WorldSnapshot } from "./game/state/types";
import { lerpWorld } from "./lerpWorld";

let playerId = "me";
let state: (ReturnType<typeof createGameSync> & { joinUrl?: string }) | undefined;
const users = [
  { userId: playerId, username: playerId } as any,
  { userId: "1", username: "nemesis" } as any,
  { userId: "2", username: "ares" } as any,
];

const Wavedash = window.Wavedash as WavedashSDK | undefined;

let renderer: Awaited<ReturnType<typeof createRenderer>>;

// hunter position in screen space, serves as the touch stick origin
const getHunterScreenPos = () => {
  const viewProjMatrix = mat4.create();
  const projectedPoint = vec3.create();
  const p = state?.snapshots[0]?.hunters.find((h) => h.id === playerId);
  if (!p || !renderer) return;

  mat4.multiply(viewProjMatrix, renderer.projectionMatrix, renderer.viewMatrix);

  vec3.set(projectedPoint, p.position[0], p.position[1], 0.01);
  vec3.transformMat4(projectedPoint, projectedPoint, viewProjMatrix);

  return [
    ((projectedPoint[0] + 1) / 2) * c.clientWidth,
    ((1 - projectedPoint[1]) / 2) * c.clientHeight,
  ] as [number, number];
};

const createSphereGeometry = (tessellationStep: number) => {
  const positions = new Float32Array(createRecursiveSphere({ tessellationStep }));
  const colorIndexes = new Uint8Array(positions.length / 3);
  for (let i = 0; i < colorIndexes.length; i += 3)
    colorIndexes[i] = colorIndexes[i + 1] = colorIndexes[i + 2] = Math.floor(Math.random() * 8);
  return { positions, colorIndexes };
};

const INSTANTIATED_MODEL_BUSH = 0;
const DYNAMIC_MODEL_GROUND = 0;

const groundGeometry = createGroundGeometry();

// init game renderer
getModelsGeometry().then((geometries) => {
  renderer = createRenderer(c, geometries, [createSphereGeometry(3)], 1);

  renderer.dynamicModels[DYNAMIC_MODEL_GROUND] = groundGeometry;

  // debug
  {
    const data = new Float32Array(MAX_BONES * BONE_STRIDE);
    const identity = quat.identity(new Float32Array(4) as quat);
    const zero = new Float32Array(3) as vec3;
    for (let k = MAX_BONES; k--;) setBoneAt(data, k * BONE_STRIDE, zero, identity);
    renderer.skinnedModelEntities.push({ data, modelId: 0 });
  }

  window.onresize = () =>
    renderer.resize(c.clientWidth, c.clientHeight, window.devicePixelRatio || 1);
  (window as any).onresize();

  if (!Wavedash) {
    state = createGameSync(
      {
        getLobbyHostId: () => null,
        readP2PMessageFromChannel: () => null,
        sendP2PMessage: () => true,
        broadcastP2PMessage: () => true,
      },
      "",
      playerId,
      createInitialState(),
    );

    createKeyboardController(state.registerInput, getHunterScreenPos);
    loop();
  } else {
    Wavedash.init({ debug: true });

    playerId = Wavedash.getUserId();

    Wavedash.on(Wavedash.Events.LOBBY_JOINED, async (p) => {
      const joinUrl =
        (await Wavedash.getLobbyInviteLink(false)).data ??
        location.origin + location.pathname + "?lobbyId=" + p.lobbyId;

      users.length = 0;
      users.push(...p.users);

      const s0 = p.hostId === playerId ? createInitialState() : undefined;

      state = createGameSync(Wavedash, p.lobbyId, playerId, s0);

      state.joinUrl = joinUrl;

      createKeyboardController(state.registerInput, getHunterScreenPos);
      loop();
    });

    Wavedash.on(Wavedash.Events.LOBBY_USERS_UPDATED, (p) => {
      const i = users.findIndex((u) => u.userId === p.userId);
      if (p.changeType === "LEFT" && i >= 0) users.splice(i, 1);
      if (p.changeType === "JOINED" && i === -1) users.push(p);
    });

    const lobbyId: any =
      Wavedash.getLaunchParams().lobby ?? location.search.match(/lobbyId=([^&]+)/)?.[1];

    if (lobbyId) Wavedash.joinLobby(lobbyId);
    else Wavedash.createLobby(Wavedash.LobbyVisibility.PUBLIC, 4);
  }
});

// scratch, reused every frame
const v = new Float32Array(3) as vec3;

let renderedGroundOrigin = -Infinity;

let renderedWorldSnapshot: WorldSnapshot;
let lastFrameDate = 0;

let camera = {
  position: [0, -2, 10],
  velocity: new Float32Array(3),
  fov: Math.PI * 0.25,
};

const loop = () => {
  if (!state) return;

  // TODO:
  // - lerp world with whatever is currently rendered
  const s0 = state.snapshots[0];

  if (s0) {
    //
    // sync players, only host should do that
    s0.hunters = [
      ...s0.hunters,
      ...users
        .filter((u) => !s0.hunters.some((p) => p.id === u.userId))
        .map((u) => ({
          id: u.userId,
          direction: new Float32Array([0, 1]),
          position: new Float32Array([
            Math.random() * 2 - 1,
            Math.max(0, ...s0.hunters.map((p) => p.position[1])),
          ]),
        })),
    ];

    //
    // init ground
    const player = s0.hunters.find((p) => p.id === playerId)!;
    if (Math.abs(player.position[1] - renderedGroundOrigin) > 16 && state.map) {
      renderedGroundOrigin = Math.round(player.position[1]);
      const range: [number, number] = [renderedGroundOrigin - 32, renderedGroundOrigin + 32];
      applyGround(state.map, range, groundGeometry);
      applyDecorum(state.map, range, renderer.instantiatedModelEntities[INSTANTIATED_MODEL_BUSH]);
    }
  }

  state.step();

  if (state.joinUrl) a.innerText = a.href = state.joinUrl;

  u.innerText =
    `latency: ${state.hostLatency}` +
    "\n" +
    `generation: ${state.snapshots[0]?.generation ?? 0}` +
    "\n" +
    users
      .map((u) => {
        const p = state?.snapshots[0]?.hunters.find((p) => p.id === u.userId);
        const status = [
          //
          p?.jumping ? "↑" : "  ",
          p?.riding ? "🦄" : "  ",
          p?.onTrail ? "🌈" : "  ",
          p?.staggered ? "🚧" : "  ",
        ].join(" - ");
        return `- ${u.userId === playerId ? "🤠" : "  "}  ${u.username.padEnd(12, " ")} ${status} ${p?.position}`;
      })
      .join("\n");

  if (s0) {
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

    // how fast the rendered world catches up with the interpolated target, in ms.
    // 25 is ~0.5 per frame at 60fps
    const CATCHUP_TAU = 25;

    renderedWorldSnapshot = lerpWorld(
      renderedWorldSnapshot,
      target,
      1 - Math.exp(-dt / CATCHUP_TAU),
    );

    //
    const player = renderedWorldSnapshot.hunters.find((p) => p.id === playerId)!;

    // camera
    {
      const fovxTarget = player.riding && player.onTrail ? Math.PI * 0.2 : Math.PI * 0.25;
      camera.fov = camera.fov * 0.9 + fovxTarget * 0.1;

      const aspect = c.width / c.height;

      const fovx = camera.fov;
      const fovy = 2 * Math.atan(Math.tan(fovx / 2) / aspect);
      mat4.perspective(renderer.projectionMatrix, fovy, aspect, 0.1, 2000);

      const CAMERA_ALTITUDE = 10;
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

    renderer.draw();
  }

  requestAnimationFrame(loop);
};

// // auto reload
// {
//   const content = await fetch("/").then((res) => res.text());
//   while (content === (await fetch("/").then((res) => res.text())))
//     await new Promise((r) => setTimeout(r, 2_000));
//   // window.location.reload();
// }
