import type { WavedashSDK } from "@wvdsh/sdk-js";
import { createGameSync, type NetworkMesh } from "../game/state/sync";
import { createInitialState } from "../game/state/stepper";

export const MAX_PLAYERS = 4;

// lobby metadata keys. the listing carries no name and no users of its own, so
// whatever the browse screen shows has to be put here by the host
const NAME = "name";
const STARTED = "started";

export type Player = {
  playerId: string;
  username: string;
  avatarUrl?: string;
};

export type LobbyListing = {
  lobbyId: string;
  name?: string;
};

export type GameState = ReturnType<typeof createGameSync>;

export type Room = {
  lobbyId: string;
  hostId: string;
  users: Player[];
  bots: Player[];

  joinUrl?: string;
};

export type Variant =
  | { type: "browse"; lobbies: LobbyListing[] }
  | ({ type: "lobby" } & Room)
  | ({ type: "playing"; game: GameState } & Room);

export type State = { me: Player } & Variant;

export type Lobby = State & {
  /** one listener, assigned like onclick */
  onChange?: () => void;

  create: () => void;
  start: () => void;
  addBot: () => void;

  /** both absent outside the container. the presence of `join` is the test */
  join?: (lobbyId: string) => void;
};

export const isHost = (l: State) => l.type !== "browse" && l.hostId === l.me.playerId;

export const createLobby = (): Lobby => {
  const w = window.Wavedash as WavedashSDK | undefined;

  const me: Player = w
    ? { playerId: w.getUserId(), username: w.getUsername() }
    : { playerId: "me", username: "me" };

  // no sdk: we are the only peer and therefore always the host. returning null
  // here would leave hostLatency pinned at its initial value forever
  const soloMesh: NetworkMesh = {
    getLobbyHostId: () => me.playerId as any,
    readP2PMessageFromChannel: () => null,
    sendP2PMessage: () => true,
    broadcastP2PMessage: () => true,
  };

  // only the host seeds a world. everyone else pulls it off them
  const startGame = () => {
    if (lobby.type !== "lobby") return;

    Object.assign(lobby, {
      type: "playing",
      game: createGameSync(
        w ?? soloMesh,
        lobby.lobbyId,
        me.playerId,
        lobby.hostId === me.playerId ? createInitialState() : undefined,
      ),
    });

    lobby.onChange?.();
  };

  const enterRoom = (
    lobbyId: string,
    hostId: string,
    users: Player[],
    metadata: Record<string, unknown> = {},
  ) => {
    Object.assign(lobby, {
      type: "lobby",
      lobbyId,
      hostId,
      users,
      bots: [],
      joinUrl: undefined,
      game: undefined,
    });

    // a room we join mid-game is already playing, and the metadata says so
    // before the first frame
    if (metadata[STARTED]) startGame();
    else lobby.onChange?.();

    if (w && hostId === me.playerId) w.setLobbyData(lobbyId as any, NAME, me.username);

    if (w)
      w.getLobbyInviteLink(false).then((r) => {
        if (lobby.type === "browse" || lobby.lobbyId !== lobbyId) return;
        lobby.joinUrl = r.data ?? location.origin + location.pathname + "?lobbyId=" + lobbyId;
        lobby.onChange?.();
      });
  };

  //
  // listeners go up before any join logic runs, per the sdk docs
  //
  if (w) {
    w.init({ debug: true });

    w.on(w.Events.LOBBY_JOINED, (p) =>
      enterRoom(
        p.lobbyId,
        p.hostId,
        p.users.map((u) => ({
          playerId: u.userId,
          username: u.username,
          avatarUrl: u.userAvatarUrl,
        })),
        p.metadata,
      ),
    );

    // the host flipping STARTED is what begins the game, for everyone
    w.on(w.Events.LOBBY_DATA_UPDATED, (d) => {
      if (d[STARTED]) startGame();
    });

    w.on(w.Events.LOBBY_USERS_UPDATED, (p) => {
      if (lobby.type === "browse") return;

      const i = lobby.users.findIndex((u) => u.playerId === p.userId);

      if (p.changeType === "LEFT" && i >= 0) lobby.users.splice(i, 1);
      if (p.changeType === "JOINED" && i < 0)
        lobby.users.push({
          playerId: p.userId,
          username: p.username,
          avatarUrl: p.userAvatarUrl,
        });

      // the host leaving hands the room to someone else, possibly us
      lobby.hostId = (w.getLobbyHostId(lobby.lobbyId as any) as string) ?? lobby.hostId;

      lobby.onChange?.();
    });
  }

  //
  // browse polling, only while it is on screen
  //
  let pollTimerTimeout: undefined | number | NodeJS.Timeout;
  const pollLobbies = async () => {
    clearTimeout(pollTimerTimeout);
    if (!w || lobby.type !== "browse") return;

    const r = await w.listAvailableLobbies(true);
    if (lobby.type !== "browse") return;

    lobby.lobbies = (r.data ?? []).map((l) => ({
      lobbyId: l.lobbyId,
      name: l.metadata[NAME] as string,
    }));
    lobby.onChange?.();

    pollTimerTimeout = setTimeout(pollLobbies);
  };

  const lobby: Lobby = {
    me,
    type: "browse",
    lobbies: [],

    create: () => {
      clearTimeout(pollTimerTimeout);
      if (w) w.createLobby(w.LobbyVisibility.PUBLIC, MAX_PLAYERS);
      // nothing to announce without an sdk, so we are in the room immediately
      else enterRoom("", me.playerId, [me]);
    },

    start: () => {
      if (lobby.type !== "lobby" || lobby.hostId !== me.playerId) return;

      // peers follow via LOBBY_DATA_UPDATED, and a late joiner reads it on join
      if (w) w.setLobbyData(lobby.lobbyId as any, STARTED, 1);

      startGame();
    },

    addBot: () => {
      if (lobby.type === "browse" || lobby.hostId !== me.playerId) return;
      if (lobby.users.length + lobby.bots.length >= MAX_PLAYERS) return;

      const n = lobby.bots.length;
      lobby.bots.push({ playerId: "bot:" + n, username: "bot:" + n });
      lobby.onChange?.();
    },
  };

  if (w) {
    lobby.join = (lobbyId) => {
      clearTimeout(pollTimerTimeout);
      w.joinLobby(lobbyId as any);
    };

    const launch = w.getLaunchParams().lobby;
    if (launch) lobby.join(launch);
    else pollLobbies();
  } else {
    lobby.create();
  }

  return lobby;
};
