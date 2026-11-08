import { ROOM_ID_PATTERN } from "./protocol";

const INVITE_PARAMETER = "game";
const RELAY_PATH = "/hexagon-ws";
const DEV_RELAY_PORT = 8787;

export interface LocationLike {
  protocol: string;
  host: string;
  hostname: string;
  origin: string;
  pathname: string;
  search: string;
}

/** Address of the relay server. In development it is the local relay, otherwise the same host over a proxy. */
export function getRelayUrl(location: LocationLike): string {
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (isLocal) return `ws://${location.hostname}:${DEV_RELAY_PORT}`;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${RELAY_PATH}`;
}

export function buildInviteLink(location: LocationLike, room: string): string {
  return `${location.origin}${location.pathname}?${INVITE_PARAMETER}=${encodeURIComponent(room)}`;
}

/** Room id of an invite link, or null if the address is not an invite link. */
export function parseInviteRoom(search: string): string | null {
  const room = new URLSearchParams(search).get(INVITE_PARAMETER);
  return room !== null && ROOM_ID_PATTERN.test(room) ? room : null;
}
