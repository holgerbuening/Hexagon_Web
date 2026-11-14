import { FIELD_TYPES } from "../core/map/fieldTypes";
import { UNIT_TYPES } from "../core/units/unitType";

const MAX_MAP_SIDE = 100;
const MAX_UNITS = 2000;

const isKnownKey = (record: object, key: unknown): boolean =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(record, key);

/**
 * Cheap plausibility check for a game state received from the other player.
 * It does not prevent cheating, it only keeps a broken message from corrupting the running game.
 */
export function isPlausibleGameState(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;

  const isSide = (side: unknown): side is number =>
    typeof side === "number" && Number.isInteger(side) && side >= 1 && side <= MAX_MAP_SIDE;

  if (state.version !== 1) return false;
  if (typeof state.turn !== "number" || !Number.isFinite(state.turn)) return false;
  if (state.currentPlayer !== 0 && state.currentPlayer !== 1) return false;
  if (!isSide(state.mapWidth) || !isSide(state.mapHeight)) return false;
  if (!Array.isArray(state.tiles) || state.tiles.length !== state.mapWidth * state.mapHeight) return false;
  if (!Array.isArray(state.units) || state.units.length > MAX_UNITS) return false;
  if (
    !Array.isArray(state.playerBalances) ||
    state.playerBalances.length !== 2 ||
    !state.playerBalances.every((balance) => typeof balance === "number" && Number.isFinite(balance))
  ) {
    return false;
  }

  const tilesOk = state.tiles.every((tile) => {
    if (typeof tile !== "object" || tile === null) return false;
    const t = tile as Record<string, unknown>;
    return (t.hasTrench === undefined || typeof t.hasTrench === "boolean") && [t.q, t.r, t.col, t.row].every((n) => typeof n === "number" && Number.isFinite(n)) && isKnownKey(FIELD_TYPES, t.field);
  });
  if (!tilesOk) return false;

  return state.units.every((unit) => {
    if (typeof unit !== "object" || unit === null) return false;
    const u = unit as Record<string, unknown>;
    return (
      isKnownKey(UNIT_TYPES, u.type) &&
      (u.owner === 0 || u.owner === 1) &&
      [u.q, u.r, u.hp, u.maxHP, u.offense, u.defense, u.attackRange, u.experience, u.remainingMovement].every(
        (n) => typeof n === "number" && Number.isFinite(n)
      )
    );
  });
}
