import "./global.css";
import Wavedash from "@wvdsh/sdk-js";
import { createLobbyUi, State as LobbyState } from "./lobby/ui";

// init game renderer
// const canvas = document.createElement("canvas");
// const renderer = createRenderer(canvas);
// window.onresize = () =>
//   renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
// (window as any).onresize();

Wavedash.init({ debug: true });

const lobbyUi = createLobbyUi(
  () => {
    // create
    Wavedash.createLobby(Wavedash.LobbyVisibility.PUBLIC, 4);
  },
  () => {
    // start
    Wavedash.broadcastP2PMessage(appChannel, reliable, payload)
  },
);

let state: LobbyState = {
  type: "in-lobby-selection",
  user: Wavedash.getUser(),
};
Wavedash.on(Wavedash.Events.LOBBY_JOINED, async (p) => {
  state = {
    ...state,
    type: "in-lobby",
    lobbyId: p.lobbyId,
    lobbyUrl:
      (await Wavedash.getLobbyInviteLink(false)).data ??
      new URL(
        window.location.origin + window.location.pathname + "?lobbyId=" + p.lobbyId,
      ).toString(),
    users: p.users.map((u) => ({ ...u, avatarUrl: u.userAvatarUrl, id: u.userId })),
    user: {} as any,
  };
  state.user = state.users.find((u) => u.id === Wavedash.getUserId())!;
  lobbyUi.update(state);
});

Wavedash.on(Wavedash.Events.LOBBY_USERS_UPDATED, (p) => {
  if (!(state.type === "in-lobby" && state.lobbyId === p.lobbyId)) return;
  if (p.changeType === "LEFT") state.users = state.users.filter((u) => u.id !== p.userId);
  if (p.changeType === "JOINED") state.users = [...state.users, { ...p, id: p.userId }];
  state.users = state.users.map((u) => ({
    ...u,
    isHost: Wavedash.getLobbyHostId(p.lobbyId) === u.id,
  }));
  state.user = state.users.find((u) => u.id === Wavedash.getUserId())!;
  lobbyUi.update(state);
});

const m = location.search.match(/lobbyId=(.*)/);
if (m) Wavedash.joinLobby(m?.[1] as any);

lobbyUi.update(state);

const startGame = () => {
  document.body.className = "g";
  u.innerHTML = "";
};
