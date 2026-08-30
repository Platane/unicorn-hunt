import "./global.css";
import { createGameSync } from "./game/state/sync";
import { mat4, quat, vec2, vec3, vec4 } from "gl-matrix";
import { createRenderer } from "./renderer";
import { createKeyboardController } from "./game/state/controller-keyboard";
import { createInitialState } from "./game/state/stepper";
import type { WavedashSDK } from "@wvdsh/sdk-js";
import { getModelsGeometry } from "./renderer/geometries/models";

let playerId = "me";
let state: ReturnType<typeof createGameSync> | undefined;
const users = [
  { userId: playerId, username: playerId } as any,
  { userId: "1", username: "nemesis" } as any,
  { userId: "2", username: "ares" } as any,
];

const Wavedash = window.Wavedash as WavedashSDK | undefined;

let renderer: Awaited<ReturnType<typeof createRenderer>>;

// init game renderer
getModelsGeometry().then((geometries) => {
  renderer = createRenderer(c, geometries);

  // debug
  {
    for (let k = 16; k--;) {
      const q = new Float32Array(renderer.modelEntities.items[0].data.buffer, k * 32, 4);
      const v = new Float32Array(renderer.modelEntities.items[0].data.buffer, k * 32 + 16, 3);
      vec3.zero(v);
      quat.identity(q);
    }
    renderer.modelEntities.count = 1;
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

    createKeyboardController(state.registerInput);
    loop();
  } else {
    Wavedash.init({ debug: true });

    playerId = Wavedash.getUserId();

    Wavedash.on(Wavedash.Events.LOBBY_JOINED, async (p) => {
      const joinUrl =
        (await Wavedash.getLobbyInviteLink(false)).data ??
        location.origin + location.pathname + "?lobbyId=" + p.lobbyId;

      console.log("invite:", joinUrl);

      users.length = 0;
      users.push(...p.users);

      const s0 = p.hostId === playerId ? createInitialState() : undefined;

      state = createGameSync(Wavedash, p.lobbyId, playerId, s0);
      createKeyboardController(state.registerInput);
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
const q = quat.identity(new Float32Array(4) as quat);
const v = new Float32Array(3) as vec3;

let groundOrigin = -10;

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

    if (Math.abs(player.position[1] - groundOrigin) > 8 && state.map) {
      groundOrigin = Math.round(player.position[1]);
      renderer.updateGround(state.map, [groundOrigin - 16, groundOrigin + 16]);
    }
  }

  state.step();

  u.innerText =
    `latency: ${state.hostLatency}` +
    "\n" +
    `generation: ${state.snapshots[0]?.generation ?? 0}` +
    "\n" +
    users
      .map((u) => {
        const p = state?.snapshots[0]?.hunters.find((p) => p.id === u.userId);
        return `- ${u.userId === playerId ? "🤠" : " "} ${u.userId} ${u.username.padEnd(20, " ")} ${p?.position}`;
      })
      .join("\n");

  if (s0) {
    const player = s0.hunters.find((p) => p.id === playerId)!;

    mat4.lookAt(
      renderer.viewMatrix,
      [0, 0, 10],
      [player.position[0] * 0.1, player.position[1], 0],
      [0, 1, 0],
    );

    // renderer.ballsEntities.count = 0;
    // while (renderer.ballsEntities.count < 100) {
    //   const x = (hashInt(renderer.ballsEntities.count + 1212) % 40) - 20;
    //   const y = hashInt(renderer.ballsEntities.count) % 30;
    //   vec3.set(v, x, y, 0);
    //   mat4.fromRotationTranslation(
    //     renderer.ballsEntities.items[renderer.ballsEntities.count].transform,
    //     q,
    //     v,
    //   );
    //   renderer.ballsEntities.items[renderer.ballsEntities.count].colorPalette[0] = y % 3;
    //   renderer.ballsEntities.count++;
    // }

    renderer.spritesEntities.count = 0;
    s0.rainbowTrails.forEach((trail) => {
      trail.forEach((p) => {
        const i = renderer.spritesEntities.items[renderer.spritesEntities.count];
        renderer.spritesEntities.count++;

        vec4.set(i.spriteBox, 0.75, 0, 1, 1);
        vec3.set(v, p[0], p[1], 0.002);
        mat4.fromRotationTranslation(i.transform, q, v);
      });
    });

    s0.hunters.forEach((p) => {
      const i = renderer.spritesEntities.items[renderer.spritesEntities.count];
      renderer.spritesEntities.count++;

      if (p.id === playerId) vec4.set(i.spriteBox, 0, 0, 0.25, 1);
      else vec4.set(i.spriteBox, 0.25, 0, 0.5, 1);

      vec3.set(v, p.position[0], p.position[1], 0.01);
      mat4.fromRotationTranslation(i.transform, q, v);

      if (p.riding) {
        const i = renderer.spritesEntities.items[renderer.spritesEntities.count];
        renderer.spritesEntities.count++;

        vec4.set(i.spriteBox, 0.5, 0, 0.75, 1);

        vec3.set(v, p.position[0], p.position[1] - 0.2, 0.005);
        mat4.fromRotationTranslation(i.transform, q, v);
      }
    });

    s0.unicorns.forEach((p) => {
      const i = renderer.spritesEntities.items[renderer.spritesEntities.count];
      renderer.spritesEntities.count++;

      vec4.set(i.spriteBox, 0.5, 0, 0.75, 1);

      vec3.set(v, p.position[0], p.position[1], 0.01);
      mat4.fromRotationTranslation(i.transform, q, v);
    });

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
