import "./global.css";
import { createLobby } from "./lobby/state";
import { createLobbyUi } from "./lobby/ui";
import { createWorldRenderer } from "./worldRenderer/createWorldRenderer";
import { createKeyboardController } from "./game/state/controller-keyboard";
import { createBot } from "./game/state/bot";
import { hashString } from "./utils/hash";

const lobby = createLobby();
const worldRenderer = createWorldRenderer(c as HTMLCanvasElement);
const ui = createLobbyUi(lobby);
const bots = new Map<string, ReturnType<typeof createBot>>();

createKeyboardController(
  (input) => {
    if (lobby.type === "playing") lobby.game.registerInput(input, lobby.me.playerId);
  },
  () =>
    lobby.type === "playing"
      ? worldRenderer.getHunterScreenPos(lobby.game.snapshots[0], lobby.me.playerId)
      : undefined,
);

lobby.create();
lobby.start();

lobby.onChange = ui.update;
ui.update();

const loop = () => {
  requestAnimationFrame(loop);

  if (lobby.type !== "playing") return;

  const game = lobby.game;
  const s0 = game.snapshots[0];

  game.step();

  // host actions
  if (s0 && lobby.hostId === lobby.me.playerId) {
    // spawn new players
    for (const p of [...lobby.users, ...lobby.bots])
      if (!s0.hunters.some((h) => h.id === p.playerId))
        s0.hunters.push({
          id: p.playerId,
          direction: new Float32Array([0, 1]),
          position: new Float32Array([
            (hashString(p.playerId) % 400) / 100 - 2,
            Math.max(0, ...s0.hunters.map((h) => h.position[1])),
          ]),
        });

    // spawn new logic
    for (const p of lobby.bots)
      if (!bots.has(p.playerId))
        bots.set(
          p.playerId,
          createBot(p.playerId, (i) => lobby.game.registerInput(i, p.playerId)),
        );

    if (game.map) for (const stepBot of bots.values()) stepBot(game.map, s0);
  }

  u.innerText =
    `latency: ${game.hostLatency}` +
    "\n" +
    `generation: ${game.snapshots[0]?.generation ?? 0}` +
    "\n" +
    [...lobby.users, ...lobby.bots]
      .map((user) => {
        const p = game.snapshots[0]?.hunters.find((h) => h.id === user.playerId);
        const status = [
          p?.jumping ? "↑" : "  ",
          p?.riding ? "🦄" : "  ",
          p?.onTrail ? "🌈" : "  ",
          p?.staggered ? "🚧" : "  ",
        ].join(" - ");
        return `- ${user.playerId === lobby.me.playerId ? "🤠" : "  "}  ${user.username.padEnd(12, " ")} ${status} ${p?.position}`;
      })
      .join("\n");

  worldRenderer.step(game, lobby.me.playerId);
};

loop();
