import { PlayerInput, WorldSnapshot } from "./types";
import { STEP_DURATION, step as worldStep } from "./stepper";
import { vec2 } from "gl-matrix";
import type { WavedashSDK } from "@wvdsh/sdk-js";

const inputMessage = new Uint8Array(4);

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

  let currentGeneration = 0;

  const hostId = net.getLobbyHostId(lobbyId as any) as any;

  let order = 0;

  const step = () => {
    const now = Date.now();

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

    // compute next

    currentGeneration = Math.max(currentGeneration, (now - startDate) / 1000 / STEP_DURATION);
    while (snapshots[0] && snapshots[0].generation < Math.floor(currentGeneration)) {
      const frameInputs = inputs
        .filter((i) => i.generation === snapshots[0].generation)
        .sort((a, b) => a.order - b.order);

      const w = worldStep(snapshots[0], frameInputs);

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
        Math.max(currentGeneration, (Date.now() - startDate) / 1000 / STEP_DURATION),
      ),
      order: order++,
      playerId,
    };

    inputMessage[0] = i.generation >> 8;
    inputMessage[1] = i.generation;

    inputMessage[2] = i.order;

    inputMessage[3] = i.angle;

    inputs.push(i);
    net.broadcastP2PMessage(
      INPUT_CHANNEL,
      false /* we might want to switch to reliable */,
      inputMessage,
    );
  };

  const out = { step, registerInput, snapshots, hostLatency: 100 };

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
  for (const p of s.snapshot.players) {
    p.position = vec2.clone(p.position);
    p.direction = vec2.clone(p.direction);
  }
  return s;
};
