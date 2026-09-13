import "./styles.css";
import type { Lobby, Player } from "./state";
import { MAX_PLAYERS } from "./state";
import { getHunterColor } from "../renderer/geometries/colorPatette";

export const createLobbyUi = (lobby: Lobby) => {
  let roomId = "";

  document.body.onclick = (e) => {
    const t = e.target as HTMLElement;
    const a = t.dataset.a;

    if (a == "c") lobby.create();
    else if (a == "s") lobby.start();
    else if (a == "b") lobby.addBot();
    else if (a == "j") lobby.join?.(roomId);
    else if (a == "jj") lobby.join?.(t.dataset.id!);
  };

  document.body.oninput = (e) => {
    roomId = (e.target as HTMLInputElement).value;
  };

  // i is the player index, users then bots, same order as the hunters in game
  const seat = (p: Player, i: number, host = false) =>
    `<li>${
      p.avatarUrl
        ? `<img src="${p.avatarUrl}" width=48 style="border:3px solid ${getHunterColor(i)}">`
        : `<i style="width:48px;height:48px;background:#fff;border:3px solid ${getHunterColor(i)}"></i>`
    }${p.username}${host ? " 👑" : ""}`;

  const update = () => {
    // the game draws its own overlay, so get out of the way
    if (lobby.type == "playing") {
      document.body.className = "g";
      u.innerHTML = "";
      return;
    }

    document.body.className = "l";

    if (lobby.type == "browse") {
      u.innerHTML =
        `<h1>🦄 unicorn hunt` +
        `<button data-a=c>new game</button>` +
        (lobby.join
          ? `<ul>${lobby.lobbies
              .map(
                (l) =>
                  `<li>${l.name ?? l.lobbyId}<button data-a=jj data-id=${l.lobbyId}>join</button>`,
              )
              .join("")}</ul>` + `<input placeholder=room id><button data-a=j>join</button>`
          : "");
      return;
    }

    const host = lobby.hostId == lobby.me.playerId;

    u.innerHTML =
      (lobby.joinUrl ? `<a href=${lobby.joinUrl} target=_blank>${lobby.joinUrl}</a>` : "") +
      `<ul>${lobby.users.map((p, i) => seat(p, i, p.playerId == lobby.hostId)).join("")}${lobby.bots.map((p, i) => seat(p, lobby.users.length + i)).join("")}</ul>` +
      (host
        ? (lobby.bots.length + lobby.users.length < MAX_PLAYERS
            ? `<button data-a=b>add bot</button>`
            : "") + `<button data-a=s>start</button>`
        : "waiting for host");
  };

  return { update };
};
