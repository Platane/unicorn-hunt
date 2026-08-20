import "./global.css";
import { createGameSync } from "./game/state/sync";
import { mat4, quat, vec3, vec4 } from "gl-matrix";
import { createRenderer } from "./renderer";
import { createKeyboardController } from "./game/state/controller-keyboard";
import { hashInt } from "./utils/hash";
import { createInitialState } from "./game/state/stepper";
import type { WavedashSDK } from "@wvdsh/sdk-js";

let playerId = "me";
let state: ReturnType<typeof createGameSync> | undefined;
const users = [{ userId: playerId, username: playerId } as any];

const Wavedash = window.Wavedash as WavedashSDK | undefined;

let renderer: Awaited<ReturnType<typeof createRenderer>>;

// init game renderer
createRenderer(c).then((r) => {
  renderer = r;

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
    // sync players
    s0.players = [
      ...s0.players,
      ...users
        .filter((u) => !s0.players.some((p) => p.id === u.userId))
        .map((u) => ({
          id: u.userId,
          direction: new Float32Array([0, 1]),
          position: new Float32Array([0, Math.max(0, ...s0.players.map((p) => p.position[1]))]),
        })),
    ];

    //
    // init ground
    const player = s0.players.find((p) => p.id === playerId)!;

    if (Math.abs(player.position[1] - groundOrigin) > 8) {
      groundOrigin = Math.round(player.position[1]);
      renderer.updateGround(s0.seed, [groundOrigin - 16, groundOrigin + 16]);
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
        const p = state?.snapshots[0]?.players.find((p) => p.id === u.userId);
        return `- ${u.userId === playerId ? "🤠" : " "} ${u.userId} ${u.username.padEnd(20, " ")} ${p?.position}`;
      })
      .join("\n");

  if (s0) {
    const player = s0.players.find((p) => p.id === playerId)!;

    mat4.lookAt(
      renderer.viewMatrix,
      [0, 0, 10],
      [player.position[0] * 0.1, player.position[1], 0],
      [0, 1, 0],
    );

    renderer.ballsEntities.count = 0;
    while (renderer.ballsEntities.count < 100) {
      const x = (hashInt(renderer.ballsEntities.count + 1212) % 40) - 20;
      const y = hashInt(renderer.ballsEntities.count) % 30;
      vec3.set(v, x, y, 0);
      mat4.fromRotationTranslation(
        renderer.ballsEntities.items[renderer.ballsEntities.count].transform,
        q,
        v,
      );
      renderer.ballsEntities.items[renderer.ballsEntities.count].colorPalette[0] = y % 3;
      renderer.ballsEntities.count++;
    }

    renderer.spritesEntities.count = s0.players.length;
    s0.players.forEach((p, i) => {
      vec4.set(renderer.spritesEntities.items[i].spriteBox, 0, 0, 0.25, 1);

      vec3.set(v, p.position[0], p.position[1], 0.01);
      mat4.fromRotationTranslation(renderer.spritesEntities.items[i].transform, q, v);
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
