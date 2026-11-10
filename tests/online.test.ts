import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { WebSocket as NodeWebSocket } from "ws";
import { createRelayServer, type RelayServer } from "../server/relay";
import { OnlineSession, RelayRequestError, type CloseReason } from "../src/net/onlineSession";
import type { GameMessage } from "../src/net/protocol";
import { buildInviteLink, getRelayUrl, parseInviteRoom } from "../src/net/relayUrl";
import { isPlausibleGameState } from "../src/net/stateGuard";
import { GameCore } from "../src/core/gameCore";
import { createSeededRng } from "../src/core/rng";

const wait = (predicate: () => boolean, timeoutMs = 2000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timed out"));
      setTimeout(check, 5);
    };
    check();
  });

describe("relay server and online session", () => {
  let server: RelayServer;
  let url: string;
  const opened: OnlineSession[] = [];

  beforeEach(async () => {
    server = await createRelayServer({ port: 0, host: "127.0.0.1" });
    url = `ws://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    for (const session of opened.splice(0)) session.close();
    await server.close();
  });

  const track = <T extends OnlineSession>(session: T): T => {
    opened.push(session);
    return session;
  };

  const stateMessage = (marker: string): GameMessage => ({ kind: "state", state: { marker } });

  it("pairs a host and a guest and forwards states both ways", async () => {
    const hostEvents: string[] = [];
    const hostReceived: GameMessage[] = [];
    const guestReceived: GameMessage[] = [];

    const { session: host, room } = await OnlineSession.createRoom(url, {
      onPeerJoined: () => hostEvents.push("joined"),
      onGameMessage: (message) => hostReceived.push(message),
    });
    track(host);
    const guest = track(await OnlineSession.joinRoom(url, room, { onGameMessage: (m) => guestReceived.push(m) }));

    await wait(() => hostEvents.length === 1);
    host.send(stateMessage("from host"));
    guest.send(stateMessage("from guest"));

    await wait(() => hostReceived.length === 1 && guestReceived.length === 1);
    assert.deepEqual(guestReceived[0], stateMessage("from host"));
    assert.deepEqual(hostReceived[0], stateMessage("from guest"));
  });

  it("forwards individual animation steps and the final turn state in order", async () => {
    const received: GameMessage[] = [];
    const { session: host, room } = await OnlineSession.createRoom(url, {});
    track(host);
    track(await OnlineSession.joinRoom(url, room, { onGameMessage: message => received.push(message) }));
    const game = new GameCore(10, 10, createSeededRng(12));
    const movement: GameMessage = {
      kind: "state", state: game.serializeState(),
      replay: { movements: [{ index: 0, start: { q: 1, r: 1 }, path: [{ q: 2, r: 1 }, { q: 3, r: 1 }] }] },
    };
    const endTurn: GameMessage = { kind: "state", state: game.serializeState(), replay: { movements: [] } };
    host.send(movement);
    host.send(endTurn);
    await wait(() => received.length === 2);
    assert.deepEqual(received, [movement, endTurn]);
  });

  it("rejects an unknown room", async () => {
    await assert.rejects(OnlineSession.joinRoom(url, "doesnotexist", {}), (error: unknown) => {
      return error instanceof RelayRequestError && error.reason === "room-not-found";
    });
  });

  it("rejects a third player", async () => {
    const { session: host, room } = await OnlineSession.createRoom(url, {});
    track(host);
    track(await OnlineSession.joinRoom(url, room, {}));
    await assert.rejects(OnlineSession.joinRoom(url, room, {}), (error: unknown) => {
      return error instanceof RelayRequestError && error.reason === "room-full";
    });
  });

  it("tells the host when the guest leaves and lets the guest come back", async () => {
    const events: string[] = [];
    const { session: host, room } = await OnlineSession.createRoom(url, {
      onPeerJoined: () => events.push("joined"),
      onPeerLeft: () => events.push("left"),
    });
    track(host);

    const first = await OnlineSession.joinRoom(url, room, {});
    await wait(() => events.length === 1);
    first.close();
    await wait(() => events.length === 2);

    track(await OnlineSession.joinRoom(url, room, {}));
    await wait(() => events.length === 3);
    assert.deepEqual(events, ["joined", "left", "joined"]);
  });

  it("closes the room for the guest when the host leaves", async () => {
    const { session: host, room } = await OnlineSession.createRoom(url, {});
    const reasons: CloseReason[] = [];
    track(await OnlineSession.joinRoom(url, room, { onClosed: (reason) => reasons.push(reason) }));

    host.close();
    await wait(() => reasons.length === 1);
    assert.equal(reasons[0], "room-closed");
    await wait(() => server.roomCount() === 0);
  });

  it("does not deliver messages to a player that is not there", async () => {
    const { session: host } = await OnlineSession.createRoom(url, {});
    track(host);
    host.send(stateMessage("nobody listens"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(server.roomCount(), 1);
  });

  it("ignores malformed payloads and survives garbage", async () => {
    const received: GameMessage[] = [];
    const { session: host, room } = await OnlineSession.createRoom(url, {});
    track(host);
    track(await OnlineSession.joinRoom(url, room, { onGameMessage: (m) => received.push(m) }));

    const raw = new NodeWebSocket(url);
    await new Promise((resolve) => raw.once("open", resolve));
    raw.send("not json");
    raw.send(JSON.stringify({ type: "relay", data: { kind: "state", state: 5 } }));
    raw.send(JSON.stringify({ type: "join", room: "../../etc" }));
    raw.close();

    host.send(stateMessage("valid"));
    await wait(() => received.length === 1);
    assert.deepEqual(received[0], stateMessage("valid"));
  });

  it("closes connections that flood the server", async () => {
    const limited = await createRelayServer({ port: 0, host: "127.0.0.1", maxMessagesPerSecond: 5 });
    try {
      const raw = new NodeWebSocket(`ws://127.0.0.1:${limited.port}`);
      await new Promise((resolve) => raw.once("open", resolve));
      const closed = new Promise<number>((resolve) => raw.once("close", (code) => resolve(code)));
      for (let i = 0; i < 20; i++) raw.send(JSON.stringify({ type: "nonsense" }));
      assert.equal(await closed, 1008);
    } finally {
      await limited.close();
    }
  });

  it("refuses browsers from other origins when origins are restricted", async () => {
    const restricted = await createRelayServer({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: ["https://www.example.org"],
    });
    try {
      const blocked = new NodeWebSocket(`ws://127.0.0.1:${restricted.port}`, { origin: "https://evil.example" });
      await assert.rejects(new Promise((_, reject) => blocked.once("error", reject)));

      const allowed = new NodeWebSocket(`ws://127.0.0.1:${restricted.port}`, { origin: "https://www.example.org" });
      await new Promise((resolve) => allowed.once("open", resolve));
      allowed.close();
    } finally {
      await restricted.close();
    }
  });

  it("limits the number of rooms", async () => {
    const small = await createRelayServer({ port: 0, host: "127.0.0.1", maxRooms: 1 });
    try {
      const { session } = await OnlineSession.createRoom(`ws://127.0.0.1:${small.port}`, {});
      track(session);
      await assert.rejects(OnlineSession.createRoom(`ws://127.0.0.1:${small.port}`, {}), (error: unknown) => {
        return error instanceof RelayRequestError && error.reason === "too-many-rooms";
      });
    } finally {
      await small.close();
    }
  });
});

describe("invite links", () => {
  const location = {
    protocol: "https:",
    host: "www.buening.eu",
    hostname: "www.buening.eu",
    origin: "https://www.buening.eu",
    pathname: "/",
    search: "",
  };

  it("builds a link that parses back to the room", () => {
    const link = buildInviteLink(location, "AbC123_-xy");
    assert.equal(link, "https://www.buening.eu/?game=AbC123_-xy");
    assert.equal(parseInviteRoom(new URL(link).search), "AbC123_-xy");
  });

  it("ignores missing and malformed room ids", () => {
    assert.equal(parseInviteRoom(""), null);
    assert.equal(parseInviteRoom("?game="), null);
    assert.equal(parseInviteRoom("?game=<script>"), null);
  });

  it("uses the local relay in development and a proxied path in production", () => {
    assert.equal(getRelayUrl({ ...location, hostname: "localhost", host: "localhost:5173", protocol: "http:" }), "ws://localhost:8787");
    assert.equal(getRelayUrl(location), "wss://www.buening.eu/hexagon-ws");
    assert.equal(getRelayUrl({ ...location, protocol: "http:" }), "ws://www.buening.eu/hexagon-ws");
  });
});

describe("game state exchange", () => {
  const newGame = (seed: number) => {
    const game = new GameCore(12, 10, createSeededRng(seed));
    game.configureAi(null);
    return game;
  };

  it("accepts a real game state", () => {
    assert.ok(isPlausibleGameState(JSON.parse(JSON.stringify(newGame(1).serializeState()))));
  });

  it("rejects broken states", () => {
    const valid = () => JSON.parse(JSON.stringify(newGame(1).serializeState())) as Record<string, any>;
    const broken: Record<string, any>[] = [];

    broken.push({ ...valid(), version: 2 });
    broken.push({ ...valid(), currentPlayer: 2 });
    broken.push({ ...valid(), mapWidth: 5 });
    broken.push({ ...valid(), playerBalances: [1] });
    const unknownField = valid();
    unknownField.tiles[0].field = "Lava";
    broken.push(unknownField);
    const unknownUnit = valid();
    unknownUnit.units[0].type = "dragon";
    broken.push(unknownUnit);
    const noHp = valid();
    delete noHp.units[0].hp;
    broken.push(noHp);

    for (const state of broken) assert.equal(isPlausibleGameState(state), false);
    for (const value of [null, 42, "state", [], {}]) assert.equal(isPlausibleGameState(value), false);
  });

  it("hands the turn over to the other player through the state", () => {
    const host = newGame(5);
    const guest = newGame(99);

    host.endTurn();
    const sent = JSON.parse(JSON.stringify(host.serializeState()));
    assert.ok(isPlausibleGameState(sent));
    guest.loadState(sent);

    assert.equal(guest.getState().currentPlayer, 1);
    assert.equal(guest.getState().turn, host.getState().turn);
    assert.deepEqual(
      guest.getState().units.map((unit) => [unit.type, unit.q, unit.r, unit.owner]),
      host.getState().units.map((unit) => [unit.type, unit.q, unit.r, unit.owner])
    );

    // Nobody plays the second side for the guest: ending the turn only passes it on.
    const unitsBefore = guest.getState().units.length;
    guest.endTurn();
    assert.equal(guest.getState().currentPlayer, 0);
    assert.equal(guest.getState().units.length, unitsBefore);
  });
});
