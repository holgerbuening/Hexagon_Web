import type { SavedGameState } from "./core/types";
import type { AiDifficulty } from "./core/systems/aiSystem";

// Shared launch seam for prepared scenarios. Author tools are never imported by the game.
export interface PreparedGame { state: SavedGameState; difficulty: AiDifficulty }
let prepared: PreparedGame | null = null;
export function prepareGameLaunch(value: PreparedGame): void { prepared = value; }
export function consumeGameLaunch(): PreparedGame | null {
  const value = prepared;
  prepared = null;
  return value;
}
