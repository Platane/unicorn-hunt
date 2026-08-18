/**
 * closure ADVANCED renames every property it does not know about.
 * everything the platform owns has to be declared here or the calls break.
 */

// elements with an id are global
var c;
var u;

var Wavedash = {
  init: function () {},
  on: function () {},
  getUserId: function () {},
  getLaunchParams: function () {},
  createLobby: function () {},
  joinLobby: function () {},
  getLobbyHostId: function () {},
  getLobbyInviteLink: function () {},
  broadcastP2PMessage: function () {},
  sendP2PMessage: function () {},
  readP2PMessageFromChannel: function () {},
  Events: {
    LOBBY_JOINED: {},
    LOBBY_USERS_UPDATED: {},
    LOBBY_DATA_UPDATED: {},
    LOBBY_INVITE: {},
    LOBBY_KICKED: {},
    P2P_PACKET_DROPPED: {},
  },
  LobbyVisibility: {
    PUBLIC: {},
    PRIVATE: {},
    FRIENDS_ONLY: {},
  },
};

// payloads read back from the sdk
var _p = {
  lobbyId: {},
  hostId: {},
  users: {},
  userId: {},
  username: {},
  userAvatarUrl: {},
  changeType: {},
  fromUserId: {},
  payload: {},
  data: {},
  lobby: {},
};
