import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { ROOM_ID_PATTERN, type ClientMessage, type ServerMessage } from "../src/net/protocol";

export interface RelayOptions {
  port: number;
  host?: string;
  /** Allowed browser origins. Empty or missing allows every origin. */
  allowedOrigins?: string[];
  maxRooms?: number;
  /** Largest accepted message in bytes. A full game state is well below 200 KB. */
  maxMessageBytes?: number;
  /** Messages per second a single connection may send. */
  maxMessagesPerSecond?: number;
  heartbeatMs?: number;
}

export interface RelayServer {
  port: number;
  roomCount(): number;
  close(): Promise<void>;
}

interface Room {
  host: WebSocket;
  guest: WebSocket | null;
}

interface Connection {
  room: string | null;
  role: "host" | "guest" | null;
  alive: boolean;
  windowStart: number;
  windowCount: number;
}

/**
 * Pairs two players per room and forwards their messages.
 * The first player creates a room, the second one joins it with the room id from the invite link.
 */
export function createRelayServer(options: RelayOptions): Promise<RelayServer> {
  const maxRooms = options.maxRooms ?? 1000;
  const maxMessagesPerSecond = options.maxMessagesPerSecond ?? 30;
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const allowedOrigins = options.allowedOrigins ?? [];

  const rooms = new Map<string, Room>();
  const connections = new Map<WebSocket, Connection>();

  const wss = new WebSocketServer({
    port: options.port,
    ...(options.host !== undefined ? { host: options.host } : {}),
    maxPayload: options.maxMessageBytes ?? 1_000_000,
    verifyClient: (info: { origin?: string }) =>
      allowedOrigins.length === 0 || (info.origin !== undefined && allowedOrigins.includes(info.origin)),
  });

  const send = (socket: WebSocket | null, message: ServerMessage): void => {
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const leave = (socket: WebSocket): void => {
    const connection = connections.get(socket);
    connections.delete(socket);
    if (!connection?.room) return;
    const room = rooms.get(connection.room);
    if (!room) return;

    if (connection.role === "host") {
      rooms.delete(connection.room);
      if (room.guest) {
        send(room.guest, { type: "room-closed" });
        room.guest.close();
      }
    } else if (room.guest === socket) {
      room.guest = null;
      send(room.host, { type: "peer-left" });
    }
  };

  const newRoomId = (): string => {
    for (;;) {
      const id = randomBytes(6).toString("base64url");
      if (!rooms.has(id)) return id;
    }
  };

  const handle = (socket: WebSocket, connection: Connection, message: ClientMessage): void => {
    if (message.type === "create") {
      if (connection.room) return send(socket, { type: "error", reason: "bad-request" });
      if (rooms.size >= maxRooms) return send(socket, { type: "error", reason: "too-many-rooms" });
      const id = newRoomId();
      rooms.set(id, { host: socket, guest: null });
      connection.room = id;
      connection.role = "host";
      return send(socket, { type: "created", room: id });
    }

    if (message.type === "join") {
      if (connection.room) return send(socket, { type: "error", reason: "bad-request" });
      if (typeof message.room !== "string" || !ROOM_ID_PATTERN.test(message.room)) {
        return send(socket, { type: "error", reason: "room-not-found" });
      }
      const room = rooms.get(message.room);
      if (!room) return send(socket, { type: "error", reason: "room-not-found" });
      if (room.guest) return send(socket, { type: "error", reason: "room-full" });
      room.guest = socket;
      connection.room = message.room;
      connection.role = "guest";
      send(socket, { type: "joined" });
      return send(room.host, { type: "peer-joined" });
    }

    if (message.type === "relay") {
      const room = connection.room ? rooms.get(connection.room) : undefined;
      if (!room) return;
      const target = connection.role === "host" ? room.guest : room.host;
      send(target, { type: "relay", data: message.data });
      return;
    }

    send(socket, { type: "error", reason: "bad-request" });
  };

  wss.on("connection", (socket) => {
    const connection: Connection = { room: null, role: null, alive: true, windowStart: Date.now(), windowCount: 0 };
    connections.set(socket, connection);

    socket.on("pong", () => {
      connection.alive = true;
    });

    socket.on("message", (raw) => {
      const now = Date.now();
      if (now - connection.windowStart >= 1000) {
        connection.windowStart = now;
        connection.windowCount = 0;
      }
      connection.windowCount += 1;
      if (connection.windowCount > maxMessagesPerSecond) {
        socket.close(1008, "rate limit");
        return;
      }

      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(socket, { type: "error", reason: "bad-request" });
      }
      if (typeof message !== "object" || message === null || typeof (message as { type?: unknown }).type !== "string") {
        return send(socket, { type: "error", reason: "bad-request" });
      }
      handle(socket, connection, message as ClientMessage);
    });

    socket.on("close", () => leave(socket));
    socket.on("error", () => socket.terminate());
  });

  // Drops connections that vanished without closing, such as a closed laptop lid.
  const heartbeat = setInterval(() => {
    for (const [socket, connection] of connections) {
      if (!connection.alive) {
        socket.terminate();
        continue;
      }
      connection.alive = false;
      socket.ping();
    }
  }, heartbeatMs);

  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      const address = wss.address();
      resolve({
        port: typeof address === "object" && address !== null ? address.port : options.port,
        roomCount: () => rooms.size,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            for (const socket of wss.clients) socket.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
