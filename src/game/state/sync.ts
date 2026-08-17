import Wavedash from "@wvdsh/sdk-js";
import { PlayerInput, WorldSnapshot } from ".";
import { step as worldStep } from "./stepper";
import { vec2 } from "gl-matrix";

type Id = string;

const inputMessage = new Uint8Array(3);

export const STEP_DURATION = 1000 / 20;

export const createGameSync = (lobbyId: string, s0?: WorldSnapshot) => {
  Wavedash.getUserId();

  // newest first, every entry holds a computed snapshot
  const snapshots: WorldSnapshot[] = s0 ? [s0] : [];

  const inputs: (PlayerInput & { generation: number; playerId: Id })[] = [];

  let lastSnapshotSyncResDate = 0;
  let lastSnapshotSyncReqDate = 0;

  let startDate = Date.now();

  let currentGeneration = 0;

  const playerId = Wavedash.getUserId();
  const hostId = Wavedash.getLobbyHostId(lobbyId as any) as any;

  const step = () => {
    const now = Date.now();

    if (hostId === playerId) out.hostLatency = 0;

    // broadcast player input for this frame
    // only if different from previous frame
    if (
      snapshots[0]?.inputs[playerId] &&
      !inputEquals(snapshots[0].inputs[playerId], snapshots[1]?.inputs[playerId])
    ) {
      const input = {
        ...snapshots[0].inputs[playerId],
        generation: snapshots[0].generation,
        playerId: playerId,
      };

      inputMessage[0] = input.generation >> 8;
      inputMessage[1] = input.generation;

      inputMessage[2] = input.angle;

      inputs.push(input);
      Wavedash.broadcastP2PMessage(
        INPUT_CHANNEL,
        false /* we might want to switch to reliable */,
        inputMessage,
      );
    }

    // answer to snapshot request
    while (true) {
      const message = Wavedash.readP2PMessageFromChannel(SNAPSHOT_REQ_CHANNEL);
      if (!message) break;

      // truncated to 16 bits, echoed back untouched
      const reqDate = (message.payload[0] << 8) + message.payload[1];

      const s = snapshots[0];
      if (s) {
        const payload = serializeSnapshot(s, now - startDate, reqDate);
        Wavedash.sendP2PMessage(message.fromUserId, SNAPSHOT_RES_CHANNEL, true, payload);
      }
    }

    // receive snapshot res
    while (true) {
      const message = Wavedash.readP2PMessageFromChannel(SNAPSHOT_RES_CHANNEL);
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
      const message = Wavedash.readP2PMessageFromChannel(INPUT_CHANNEL);
      if (!message) break;

      const input = {
        angle: message.payload[2],
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

      Wavedash.sendP2PMessage(hostId, SNAPSHOT_REQ_CHANNEL, true, inputMessage, 2);
    }

    //
    // step

    // compute next

    currentGeneration = Math.max(currentGeneration, (now - startDate) / STEP_DURATION);
    while (snapshots[0] && snapshots[0].generation < Math.floor(currentGeneration)) {
      // compute snapshot i-1 from snapshot i

      // apply inputs
      for (const ii of inputs)
        if (ii.generation === snapshots[0].generation) snapshots[0].inputs[ii.playerId] = ii;

      const w = structuredClone(snapshots[0]);
      worldStep(w);

      snapshots.unshift(w);
    }

    while (snapshots.length > 32) snapshots.pop();

    while (inputs[0] && snapshots[0] && inputs[0].generation + 32 < snapshots[0].generation)
      inputs.shift();
  };

  const out = { step, snapshots, hostLatency: 100 };

  return out;
};

const INPUT_CHANNEL = 0;
const SNAPSHOT_REQ_CHANNEL = 1;
const SNAPSHOT_RES_CHANNEL = 2;

const inputEquals = (a: PlayerInput | undefined, b: PlayerInput | undefined) =>
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
