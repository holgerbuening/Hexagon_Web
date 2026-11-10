// Messages exchanged with the relay server. The relay only forwards `relay` payloads
// between the two players of a room and does not look into them.

export type ClientMessage =
  | { type: "create" }
  | { type: "join"; room: string }
  | { type: "relay"; data: unknown };

export type RelayError = "room-not-found" | "room-full" | "too-many-rooms" | "bad-request";

export type ServerMessage =
  | { type: "created"; room: string }
  | { type: "joined" }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "room-closed" }
  | { type: "relay"; data: unknown }
  | { type: "error"; reason: RelayError };

// Payloads the players send to each other through the relay.
export type OnlineReplay = {
  movements: { index: number; start: import("../core/types").Axial; path: import("../core/types").Axial[] }[];
  combat?: { before: import("../core/types").SavedGameState; preview: import("../core/types").CombatPreview };
};

export type GameMessage = { kind: "state"; state: unknown; replay?: OnlineReplay };

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;
