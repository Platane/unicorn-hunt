import "./global.css";
import Wavedash from "@wvdsh/sdk-js";
import { createGameSync } from "./game/state/sync";
import { mat4, quat, vec3, vec4 } from "gl-matrix";
import { GenericId } from "convex/values";
import { PlayerInput } from "./game/state/types";
import { createRenderer } from "./renderer";
import { createKeyboardController } from "./game/state/controller-keyboard";
import { hashInt } from "./utils/hash";

// init game renderer
const renderer = createRenderer(c);
window.onresize = () =>
  renderer.resize(c.clientWidth, c.clientHeight, window.devicePixelRatio || 1);
(window as any).onresize();

Wavedash.init({ debug: true });

let users: { userAvatarUrl?: string; userId: GenericId<"users">; username: string }[] = [];
let state: ReturnType<typeof createGameSync> | undefined;
Wavedash.on(Wavedash.Events.LOBBY_JOINED, async (p) => {
  const joinUrl =
    (await Wavedash.getLobbyInviteLink(false)).data ??
    // dev fallback: getLobbyInviteLink needs the wavedash parent frame
    location.origin + location.pathname + "?lobbyId=" + p.lobbyId;

  console.log("invite:", joinUrl);

  users.length = 0;
  users.push(...p.users);

  const s0 =
    p.hostId === Wavedash.getUserId()
      ? {
          generation: 0,
          seed: 0 | (Math.random() * (1 << 16)),
          players: users.map((u, i) => ({
            ...u,
            id: u.userId,
            direction: new Float32Array([0, 1]),
            position: new Float32Array([i * 0.1, 0]),
          })),
          inputs: {} as Record<string, PlayerInput>,
        }
      : undefined;

  state = createGameSync(p.lobbyId, s0);
  createKeyboardController(state.registerInput);
  loop();
});

Wavedash.on(Wavedash.Events.LOBBY_USERS_UPDATED, (p) => {
  console.log(p);
  if (p.changeType === "LEFT") users = users.filter((u) => u.userId !== p.userId);
  if (p.changeType === "JOINED") users = [...users, p];
});

// scratch, reused every frame
const q = quat.identity(new Float32Array(4) as quat);
const v = new Float32Array(3) as vec3;

const loop = () => {
  if (!state) return;

  {
    const s0 = state.snapshots[0];
    if (s0) {
      s0.players = [
        ...s0.players,
        ...users
          .filter((u) => !s0.players.some((p) => p.id === u.userId))
          .map((u) => ({
            id: u.userId,
            direction: new Float32Array([0, 1]),
            position: new Float32Array([0, Math.max(...s0.players.map((p) => p.position[1]))]),
          })),
      ];
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
        return `- ${u.userId === Wavedash.getUserId() ? "🤠" : " "} ${u.userId} ${u.username.padEnd(20, " ")} ${p?.position}`;
      })
      .join("\n");

  {
    // TODO:
    // - lerp world with whatever is currently rendered
    const s0 = state.snapshots[0];
    if (s0) {
      const playerId = Wavedash.getUserId();
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
        renderer.ballsEntities.count++;
      }

      renderer.spritesEntities.count = s0.players.length;
      s0.players.forEach((p, i) => {
        vec4.set(renderer.spritesEntities.items[i].spriteBox, 0, 0, 1, 1);

        vec3.set(v, p.position[0], p.position[1], 0);
        mat4.fromRotationTranslation(renderer.spritesEntities.items[i].transform, q, v);
      });
      renderer.draw();
    }
  }

  requestAnimationFrame(loop);
};

const lobbyId: any =
  Wavedash.getLaunchParams().lobby ?? location.search.match(/lobbyId=([^&]+)/)?.[1];
if (lobbyId) Wavedash.joinLobby(lobbyId);
else Wavedash.createLobby(Wavedash.LobbyVisibility.PUBLIC, 4);

// // auto reload
// {
//   const content = await fetch("/").then((res) => res.text());
//   while (content === (await fetch("/").then((res) => res.text())))
//     await new Promise((r) => setTimeout(r, 2_000));
//   // window.location.reload();
// }
