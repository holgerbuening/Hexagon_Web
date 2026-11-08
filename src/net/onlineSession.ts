import type { ClientMessage, GameMessage, RelayError, ServerMessage } from "./protocol";

export type CloseReason = "room-closed" | "connection-lost" | "closed-by-user";

export interface SessionHandlers {
  onPeerJoined?: () => void;
  onPeerLeft?: () => void;
  onGameMessage?: (message: GameMessage) => void;
  onClosed?: (reason: CloseReason) => void;
}

export class RelayRequestError extends Error {
  readonly reason: RelayError | "unreachable";

  constructor(reason: RelayError | "unreachable") {
    super(reason);
    this.reason = reason;
  }
}

const CONNECT_TIMEOUT_MS = 8000;

function isGameMessage(value: unknown): value is GameMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { kind?: unknown; state?: unknown };
  return message.kind === "state" && typeof message.state === "object" && message.state !== null;
}

/** One player's connection to a game room on the relay server. */
export class OnlineSession {
  private closedByUser = false;
  private closedNotified = false;

  private constructor(
    private readonly socket: WebSocket,
    private handlers: SessionHandlers
  ) {}

  /** Creates a room and resolves with its id. The caller is the host. */
  public static async createRoom(url: string, handlers: SessionHandlers): Promise<{ session: OnlineSession; room: string }> {
    const { session, reply } = await OnlineSession.open(url, { type: "create" }, handlers);
    if (reply.type !== "created") throw new RelayRequestError("bad-request");
    return { session, room: reply.room };
  }

  /** Joins an existing room. The caller is the guest. */
  public static async joinRoom(url: string, room: string, handlers: SessionHandlers): Promise<OnlineSession> {
    const { session, reply } = await OnlineSession.open(url, { type: "join", room }, handlers);
    if (reply.type !== "joined") throw new RelayRequestError("bad-request");
    return session;
  }

  public setHandlers(handlers: SessionHandlers): void {
    this.handlers = handlers;
  }

  public send(message: GameMessage): void {
    this.sendRaw({ type: "relay", data: message });
  }

  public close(): void {
    this.closedByUser = true;
    this.socket.close();
  }

  private sendRaw(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private notifyClosed(reason: CloseReason): void {
    if (this.closedNotified) return;
    this.closedNotified = true;
    this.handlers.onClosed?.(reason);
  }

  private static open(
    url: string,
    firstMessage: ClientMessage,
    handlers: SessionHandlers
  ): Promise<{ session: OnlineSession; reply: ServerMessage }> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        reject(new RelayRequestError("unreachable"));
        return;
      }

      const session = new OnlineSession(socket, handlers);
      let settled = false;
      const timeout = setTimeout(() => {
        fail(new RelayRequestError("unreachable"));
        socket.close();
      }, CONNECT_TIMEOUT_MS);

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };

      socket.addEventListener("open", () => {
        session.sendRaw(firstMessage);
      });

      socket.addEventListener("message", (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }

        if (!settled) {
          if (message.type === "error") {
            fail(new RelayRequestError(message.reason));
            socket.close();
          } else if (message.type === "created" || message.type === "joined") {
            settled = true;
            clearTimeout(timeout);
            resolve({ session, reply: message });
          }
          return;
        }

        if (message.type === "peer-joined") session.handlers.onPeerJoined?.();
        else if (message.type === "peer-left") session.handlers.onPeerLeft?.();
        else if (message.type === "room-closed") session.notifyClosed("room-closed");
        else if (message.type === "relay" && isGameMessage(message.data)) session.handlers.onGameMessage?.(message.data);
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          fail(new RelayRequestError("unreachable"));
          return;
        }
        session.notifyClosed(session.closedByUser ? "closed-by-user" : "connection-lost");
      });

      socket.addEventListener("error", () => {
        fail(new RelayRequestError("unreachable"));
      });
    });
  }
}
