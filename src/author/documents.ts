import type { SavedGameState, SavedUnit } from "../core/types";
import { Unit } from "../core/units/unit";
import { UnitType, UNIT_TYPES } from "../core/units/unitType";
import { MapEditor } from "../core/map/mapEditor";
import { parseMapDocument } from "../core/map/mapSerializer";
import { FieldType } from "../core/map/fieldTypes";
import type { AiDifficulty } from "../core/systems/aiSystem";

export interface MissionDocument {
  format: "hexagon-mission";
  version: 1;
  id: string;
  title: string;
  briefing: string;
  image: string;
  victoryText: string;
  defeatText: string;
  difficulty: AiDifficulty;
  state: SavedGameState;
}

export interface CampaignDocument {
  format: "hexagon-campaign";
  version: 1;
  id: string;
  title: string;
  description: string;
  introduction: string;
  image: string;
  completionText: string;
  missions: MissionDocument[];
}

export function newId(): string { return crypto.randomUUID(); }
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function createMission(width = 16, height = 12): MissionDocument {
  const map = new MapEditor(width, height).document;
  return { format: "hexagon-mission", version: 1, id: newId(), title: "New mission", briefing: "",
    image: "", victoryText: "Mission accomplished!", defeatText: "Try again.", difficulty: "easy",
    state: { version: 1, turn: 1, currentPlayer: 0, gameOver: false, winner: null,
      mapWidth: width, mapHeight: height, tiles: map.tiles, units: [], playerBalances: [300, 300] } };
}

export function createCampaign(): CampaignDocument {
  return { format: "hexagon-campaign", version: 1, id: newId(), title: "New campaign", description: "",
    introduction: "", image: "", completionText: "You have successfully completed the campaign!", missions: [createMission()] };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, limit = 20000): string {
  if (typeof value !== "string" || value.length > limit) throw new Error(`${label}: invalid text or text exceeds the length limit.`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, "ID", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error("IDs may only contain letters, numbers, _ and -.");
  return result;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: expected an integer between ${min} and ${max}.`);
  return value;
}
function image(value: unknown): string {
  const result = text(value, "Image", 8_000_000);
  if (result && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(result) && !/^\/images\/[a-zA-Z0-9_./ -]+$/.test(result)) {
    throw new Error("Images must be PNG, JPEG, WebP or GIF, or use a path under /images/.");
  }
  if (result.includes("..")) throw new Error("Invalid image path.");
  return result;
}

/** Strict, independent of the permissive online-state guard. Returns a detached document. */
export function parseMissionState(value: unknown): SavedGameState {
  const state = object(value);
  if (state.version !== 1) throw new Error("Unsupported saved game version.");
  const width = integer(state.mapWidth, "Map width", 4, 100);
  const height = integer(state.mapHeight, "Map height", 4, 100);
  const map = parseMapDocument({ format: "hexagon-map", version: 1, name: "Mission", width, height, tiles: state.tiles });
  if (!Array.isArray(state.units) || state.units.length > 2000) throw new Error("Invalid unit list.");
  const tileKeys = new Set(map.tiles.map(t => `${t.q},${t.r}`));
  const occupied = new Set<string>();
  const units = state.units.map((raw): SavedUnit => {
    const u = object(raw);
    if (!Object.values(UnitType).includes(u.type as UnitType)) throw new Error("Unknown unit type.");
    const q = integer(u.q, "Unit position", -100, 100);
    const r = integer(u.r, "Unit position", 0, 99);
    const key = `${q},${r}`;
    if (!tileKeys.has(key) || occupied.has(key)) throw new Error("Units are outside the map or share the same tile.");
    occupied.add(key);
    const owner = integer(u.owner, "Owner", 0, 1) as 0 | 1;
    const unit = Unit.serialize(new Unit(u.type as UnitType, q, r, owner));
    unit.maxHP = integer(u.maxHP, "Maximum HP", 1, 10000);
    unit.hp = integer(u.hp, "HP", 1, unit.maxHP);
    unit.offense = integer(u.offense, "Offense", 0, 10000);
    unit.defense = integer(u.defense, "Defense", 0, 10000);
    unit.attackRange = integer(u.attackRange, "Attack range", 0, 100);
    unit.experience = integer(u.experience, "Experience", 0, 100000);
    // A mission is a fresh start, not an interrupted turn from an imported save.
    unit.acted = false;
    unit.selected = false;
    unit.remainingMovement = UNIT_TYPES[unit.type].maxMovement;
    return unit;
  });
  if (!Array.isArray(state.playerBalances) || state.playerBalances.length !== 2) throw new Error("Starting funds for both sides are required.");
  return { version: 1, turn: 1, currentPlayer: 0, gameOver: false, winner: null, mapWidth: width, mapHeight: height,
    tiles: map.tiles, units, playerBalances: state.playerBalances.map(n => integer(n, "Startgeld", 0, 10000000)) };
}

export function parseMission(value: unknown): MissionDocument {
  const m = object(value);
  if (m.format !== "hexagon-mission" || m.version !== 1) throw new Error("Not a supported mission file (version 1).");
  if (m.difficulty !== "easy" && m.difficulty !== "normal" && m.difficulty !== "hard") throw new Error("Unknown AI difficulty.");
  return { format: "hexagon-mission", version: 1, id: id(m.id), title: text(m.title, "Title", 200),
    briefing: text(m.briefing, "Briefing"), image: image(m.image), victoryText: text(m.victoryText, "Victory text"),
    defeatText: text(m.defeatText, "Defeat text"), difficulty: m.difficulty, state: parseMissionState(m.state) };
}

export function parseCampaign(value: unknown): CampaignDocument {
  const c = object(value);
  if (c.format !== "hexagon-campaign" || c.version !== 1) throw new Error("Not a supported campaign file (version 1).");
  if (!Array.isArray(c.missions) || c.missions.length > 100) throw new Error("A campaign may contain at most 100 missions.");
  const missions = c.missions.map(parseMission);
  if (new Set(missions.map(m => m.id)).size !== missions.length) throw new Error("Duplicate mission IDs in this campaign.");
  return { format: "hexagon-campaign", version: 1, id: id(c.id), title: text(c.title, "Title", 200), description: text(c.description, "Description"),
    introduction: text(c.introduction, "Introduction"), image: image(c.image), completionText: text(c.completionText, "Completion"), missions };
}

export function missionIssues(mission: MissionDocument): string[] {
  const issues: string[] = [];
  try { parseMission(mission); } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
  if (!mission.title.trim()) issues.push("A mission title is required.");
  for (const owner of [0, 1]) {
    if (!mission.state.units.some(u => u.owner === owner && u.type === UnitType.MilitaryBase)) {
      issues.push(`An HQ for ${owner === 0 ? "the player" : "the AI"} is missing.`);
    }
  }
  for (const unit of mission.state.units) {
    if (mission.state.tiles.find(t => t.q === unit.q && t.r === unit.r)?.field === FieldType.Ocean) {
      issues.push(`A unit is on water (${unit.q}, ${unit.r}).`);
    }
  }
  return issues;
}

export function campaignIssues(campaign: CampaignDocument): string[] {
  const issues: string[] = [];
  try { parseCampaign(campaign); } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
  if (!campaign.title.trim()) issues.push("A campaign title is required.");
  if (!campaign.missions.length) issues.push("The campaign does not contain any missions yet.");
  campaign.missions.forEach((m, i) => missionIssues(m).forEach(issue => issues.push(`Mission ${i + 1}: ${issue}`)));
  return issues;
}

export function moveMission(campaign: CampaignDocument, index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (index < 0 || index >= campaign.missions.length || target < 0 || target >= campaign.missions.length) return;
  [campaign.missions[index], campaign.missions[target]] = [campaign.missions[target]!, campaign.missions[index]!];
}
