import "./styles.css";

export type State =
  | {
      type: "in-lobby";
      lobbyUrl: string;
      lobbyId: unknown;
      users: {
        isHost: boolean;
        avatarUrl?: string;
        username: string;
        id: unknown;
      }[];
      user: {
        isHost: boolean;
        avatarUrl?: string;
        username: string;
      };
    }
  | {
      type: "in-lobby-selection";
      user: {
        avatarUrl?: string;
        username: string;
        id: unknown;
      };
    };

type User = { isHost?: boolean; avatarUrl?: string; username: string };

export const createLobbyUi = (onCreateLobby: () => void, onStart: () => void) => {
  document.body.onclick = (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (a == "c") onCreateLobby();
    else if (a == "s") onStart();
  };

  const user = (p: User) =>
    `<li><img src="${p.avatarUrl}" width=64>${p.username}${(p.isHost && " 👑") || ""}`;

  const update = (s: State) => {
    document.body.className = "l";

    if (s.type == "in-lobby-selection") {
      u.innerHTML = `<ul>${user(s.user)}</ul><button data-a=c>new game`;
    }

    if (s.type == "in-lobby") {
      u.innerHTML = `<h1><a href=${s.lobbyUrl} target=_blank>${s.lobbyUrl}</a><ul>${s.users.map(user).join("")}</ul>${
        (s.user.isHost && `<button data-a=s>start`) || "waiting for host"
      }`;
    }
  };

  return { update };
};
