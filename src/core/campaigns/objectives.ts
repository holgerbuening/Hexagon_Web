import type { GameState, HexTile, MissionObjective, MissionRuntime, PlayerId } from "../types";
import { FieldType } from "../map/fieldTypes";
import { isHeadquarter } from "../units/unitType";

export const DEFAULT_OBJECTIVE: MissionObjective = { type: "destroy-headquarters" };

export function parseMissionObjective(value: unknown): MissionObjective {
  if (!value || typeof value !== "object") throw new Error("Invalid mission objective.");
  const goal = value as Record<string, unknown>;
  switch (goal.type) {
    case "destroy-headquarters": case "eliminate-all": case "capture-all": return { type: goal.type };
    case "survive":
      if (typeof goal.rounds !== "number" || !Number.isInteger(goal.rounds) || goal.rounds < 1 || goal.rounds > 10000) {
        throw new Error("Survival requires between 1 and 10000 full rounds.");
      }
      return { type: "survive", rounds: goal.rounds };
    case "capture-position": {
      const pos = goal.position as { q?: unknown; r?: unknown } | null;
      if (!pos || typeof pos.q !== "number" || typeof pos.r !== "number" || !Number.isInteger(pos.q) || !Number.isInteger(pos.r) ||
          Math.abs(pos.q) > 200 || Math.abs(pos.r) > 200) throw new Error("Capture objective requires a valid target position.");
      return { type: "capture-position", position: { q: pos.q, r: pos.r } };
    }
    default: throw new Error("Unknown mission objective.");
  }
}

export function createMissionRuntime(objective: MissionObjective = DEFAULT_OBJECTIVE): MissionRuntime {
  return { objective: parseMissionObjective(objective), completedRounds: 0, pendingCombats: 0, roundPending: false };
}

export function parseMissionRuntime(value: unknown): MissionRuntime {
  if (!value || typeof value !== "object") throw new Error("Invalid mission progress.");
  const runtime = value as MissionRuntime;
  if (!Number.isInteger(runtime.completedRounds) || runtime.completedRounds < 0 ||
      !Number.isInteger(runtime.pendingCombats) || runtime.pendingCombats < 0 || runtime.pendingCombats > 2000 ||
      typeof runtime.roundPending !== "boolean" || (runtime.roundPending && runtime.pendingCombats === 0)) {
    throw new Error("Invalid mission round or combat counters.");
  }
  return { objective: parseMissionObjective(runtime.objective), completedRounds: runtime.completedRounds,
    pendingCombats: runtime.pendingCombats, roundPending: runtime.roundPending };
}

export function describeMissionObjective(objective: MissionObjective, tiles: readonly HexTile[] = []): string {
  switch (objective.type) {
    case "destroy-headquarters": return "Destroy all enemy headquarters.";
    case "eliminate-all": return "Destroy all enemy units, including headquarters.";
    case "survive": return `Survive ${objective.rounds} full rounds.`;
    case "capture-all": return "Occupy all cities and industries simultaneously.";
    case "capture-position": {
      const target = tiles.find(t => t.q === objective.position.q && t.r === objective.position.r);
      return target ? `Occupy tile ${target.col}, ${target.row}.` : `Occupy position ${objective.position.q}, ${objective.position.r}.`;
    }
  }
}

export function getMissionProgress(state: Pick<GameState, "mission" | "tiles" | "units">): { label: string; detail: string; achieved: boolean } | null {
  const runtime = state.mission;
  if (!runtime) return null;
  const goal = runtime.objective;
  const label = describeMissionObjective(goal, state.tiles);
  const enemies = state.units.filter(u => u.owner === 1 && u.hp > 0);
  const occupies = (tile: { q: number; r: number }) => state.units.some(u => u.owner === 0 && u.hp > 0 && u.q === tile.q && u.r === tile.r);
  switch (goal.type) {
    case "destroy-headquarters": {
      const remaining = enemies.filter(u => isHeadquarter(u.type)).length;
      return { label, detail: `Enemy headquarters remaining: ${remaining}`, achieved: remaining === 0 };
    }
    case "eliminate-all": return { label, detail: `Enemy units remaining: ${enemies.length}`, achieved: enemies.length === 0 };
    case "survive": return { label, detail: `Rounds survived: ${Math.min(runtime.completedRounds, goal.rounds)}/${goal.rounds} (${Math.max(0, goal.rounds - runtime.completedRounds)} remaining)`,
      achieved: runtime.completedRounds >= goal.rounds };
    case "capture-all": {
      const holdings = state.tiles.filter(t => t.field === FieldType.City || t.field === FieldType.Industry);
      const occupied = holdings.filter(occupies).length;
      return { label, detail: `Cities and industries: ${occupied}/${holdings.length}`, achieved: holdings.length > 0 && occupied === holdings.length };
    }
    case "capture-position": {
      const achieved = occupies(goal.position);
      return { label, detail: achieved ? "Target occupied" : "Target not occupied", achieved };
    }
  }
}

export function missionWinner(state: GameState): PlayerId | null {
  // Mission objectives never override losing the player's last HQ, even in the final survival round.
  if (!state.units.some(u => u.owner === 0 && u.hp > 0 && isHeadquarter(u.type))) return 1;
  if (!state.mission || state.mission.pendingCombats > 0) return null;
  return getMissionProgress(state)?.achieved ? 0 : null;
}
