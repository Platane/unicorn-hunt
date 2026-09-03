import { PlayerInput, WorldSnapshot } from "./types";
import { STEP_DURATION, step as worldStep } from "./stepper";
import { vec2 } from "gl-matrix";
import type { WavedashSDK } from "@wvdsh/sdk-js";
import { createMap, Map } from "./map";

const inputMessage = new Uint8Array(5);

export const createGameSync = (
  net: NetworkMesh,
  lobbyId: string,
  playerId: string,
  s0?: WorldSnapshot,
) => {
  // newest first, every entry holds a computed snapshot
  const snapshots: WorldSnapshot[] = s0 ? [s0] : [];

  const inputs: (PlayerInput & { generation: number; order: number; playerId: string })[] = [];

  let lastSnapshotSyncResDate = 0;
  let lastSnapshotSyncReqDate = 0;

  let startDate = Date.now();

  const hostId = net.getLobbyHostId(lobbyId as any) as any;

  let inputOrder = 0;

  const step = () => {
    const now = Date.now();
    inputOrder = 0;

    if (hostId === playerId) out.hostLatency = 0;

    // answer to snapshot request
    while (true) {
      const message = net.readP2PMessageFromChannel(SNAPSHOT_REQ_CHANNEL);
      if (!message) break;

      // truncated to 16 bits, echoed back untouched
      const reqDate = (message.payload[0] << 8) + message.payload[1];

      const s = snapshots[0];
      if (s) {
        const payload = serializeSnapshot(s, now - startDate, reqDate);
        net.sendP2PMessage(message.fromUserId, SNAPSHOT_RES_CHANNEL, true, payload);
      }
    }

    // receive snapshot res
    while (true) {
      const message = net.readP2PMessageFromChannel(SNAPSHOT_RES_CHANNEL);
      if (!message) break;

      const { snapshot, duration, reqDate } = deserializeSnapshot(message.payload);

      snapshots.length = 0;
      snapshots.push(snapshot);

      // truncation magic
      out.hostLatency = ((now - reqDate) & 0xffff) / 2;
      startDate = now - duration - out.hostLatency;

      lastSnapshotSyncResDate = now;
    }

    // read broadcasted inputs
    // can read inputs from previous frames
    while (true) {
      const message = net.readP2PMessageFromChannel(INPUT_CHANNEL);
      if (!message) break;

      const input = {
        angle: message.payload[3],
        jump: !!(message.payload[4] & 1),
        order: message.payload[2],
        generation: (message.payload[0] << 8) + message.payload[1],
        playerId: message.fromUserId,
      };
      inputs.push(input);

      while (snapshots[1] && snapshots[0].generation >= input.generation) snapshots.shift();

      // force a snapshot refresh
      if (snapshots[0] && snapshots[0].generation >= input.generation) lastSnapshotSyncResDate = 0;
    }

    if (
      hostId !== playerId &&
      // ask snapshot if no valid one in the history, or every 2s
      lastSnapshotSyncResDate + 2000 < now &&
      now > lastSnapshotSyncReqDate + 500 // avoid spamming
    ) {
      lastSnapshotSyncReqDate = now;

      inputMessage[0] = lastSnapshotSyncReqDate >> 8;
      inputMessage[1] = lastSnapshotSyncReqDate;

      net.sendP2PMessage(hostId, SNAPSHOT_REQ_CHANNEL, true, inputMessage, 2);
    }

    //
    // step

    if (snapshots[0] && out.map?.seed !== snapshots[0].seed) out.map = createMap(snapshots[0].seed);

    // compute next

    out.currentGeneration = Math.max(
      out.currentGeneration,
      (now - startDate) / 1000 / STEP_DURATION,
    );
    while (snapshots[0] && snapshots[0].generation < Math.floor(out.currentGeneration)) {
      const frameInputs = inputs
        .filter((i) => i.generation === snapshots[0].generation)
        .sort((a, b) => a.order - b.order);

      const w = worldStep(out.map!, snapshots[0], frameInputs);

      snapshots.unshift(w);
    }

    while (snapshots.length > 32) snapshots.pop();

    while (inputs[0] && snapshots[0] && inputs[0].generation + 32 < snapshots[0].generation)
      inputs.shift();
  };

  const registerInput = (input: PlayerInput) => {
    const i = {
      ...input,
      generation: Math.floor(
        Math.max(out.currentGeneration, (Date.now() - startDate) / 1000 / STEP_DURATION),
      ),
      order: inputOrder++,
      playerId,
    };

    inputMessage[0] = i.generation >> 8;
    inputMessage[1] = i.generation;

    inputMessage[2] = i.order;

    inputMessage[3] = i.angle;
    inputMessage[4] = +!!i.jump;

    inputs.push(i);
    net.broadcastP2PMessage(
      INPUT_CHANNEL,
      false /* we might want to switch to reliable */,
      inputMessage,
    );
  };

  const out = {
    step,
    registerInput,
    snapshots,
    hostLatency: 100,
    currentGeneration: 0,
    map: undefined as undefined | Map,
  };

  return out;
};

export type NetworkMesh = Pick<
  WavedashSDK,
  "getLobbyHostId" | "readP2PMessageFromChannel" | "sendP2PMessage" | "broadcastP2PMessage"
>;

const INPUT_CHANNEL = 0;
const SNAPSHOT_REQ_CHANNEL = 1;
const SNAPSHOT_RES_CHANNEL = 2;

export const inputEquals = (a: PlayerInput | undefined, b: PlayerInput | undefined) =>
  a?.angle === b?.angle;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// TODO:
// - better compression for the world

const serializeSnapshot = (snapshot: WorldSnapshot, duration: number, reqDate: number) =>
  encoder.encode(
    JSON.stringify({ snapshot, duration, reqDate }, (_: string, v: unknown) =>
      v instanceof Float32Array ? [...v] : v,
    ),
  );

const deserializeSnapshot = (b: Uint8Array) => {
  const s = JSON.parse(decoder.decode(b)) as {
    snapshot: WorldSnapshot;
    duration: number;
    reqDate: number;
  };
  for (const p of s.snapshot.hunters) {
    p.position = vec2.clone(p.position);
    p.direction = vec2.clone(p.direction);
  }
  for (const p of s.snapshot.unicorns) {
    p.position = vec2.clone(p.position);
    p.direction = vec2.clone(p.direction);
  }
  return s;
};
