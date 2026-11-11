import type { SavedGameState, CombatPreviewEntry } from "../types";
import { isPlausibleGameState } from "../../net/stateGuard";
import { clone, parseCampaign, campaignIssues, type CampaignDocument } from "./documents";

export interface CampaignSave {
  format: "hexagon-campaign-save";
  version: 1;
  campaign: CampaignDocument;
  missionId: string;
  completedMissionIds: string[];
  state: SavedGameState;
  pendingCombats?: CombatPreviewEntry[];
}
export interface CampaignProgress {
  version: 1;
  campaignId: string;
  completedMissionIds: string[];
  save: CampaignSave | null;
}
export interface CampaignStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const CAMPAIGN_STORAGE_PREFIX = "hexagon-campaign-progress-v1:";

export function playableCampaign(value: unknown): CampaignDocument {
  const campaign = parseCampaign(value);
  const issues = campaignIssues(campaign);
  if (issues.length) throw new Error(issues.join("\n"));
  return campaign;
}

export function parseCampaignSave(value: unknown): CampaignSave {
  if (!value || typeof value !== "object") throw new Error("Invalid campaign save.");
  const save = value as CampaignSave;
  if (save.format !== "hexagon-campaign-save" || save.version !== 1) throw new Error("Unsupported campaign save version.");
  const campaign = playableCampaign(save.campaign);
  const mission = campaign.missions.find(m => m.id === save.missionId);
  if (!mission) throw new Error("The saved mission is missing from this campaign.");
  if (!Array.isArray(save.completedMissionIds) || !save.completedMissionIds.every(id => typeof id === "string" && campaign.missions.some(m => m.id === id))) {
    throw new Error("Invalid campaign progress.");
  }
  if (!isPlausibleGameState(save.state) || save.state.mapWidth !== mission.state.mapWidth || save.state.mapHeight !== mission.state.mapHeight ||
      !Number.isInteger(save.state.turn) || save.state.turn < 1 || save.state.currentPlayer !== 0 ||
      typeof save.state.gameOver !== "boolean" || (save.state.winner !== null && save.state.winner !== 0 && save.state.winner !== 1)) {
    throw new Error("Invalid saved mission state.");
  }
  const pendingCombats = save.pendingCombats ?? [];
  if (!Array.isArray(pendingCombats) || pendingCombats.length > 2000 || !pendingCombats.every(entry => {
    if (!entry || !entry.preview || !entry.attacker || !entry.defender) return false;
    const p = entry.preview;
    return [p.attackerPos, p.defenderPos].every(pos => pos && Number.isInteger(pos.q) && Number.isInteger(pos.r)) &&
      [p.attackBase, p.defenseBase, p.minAttacker, p.maxAttacker, p.randomAttacker, p.attackPower, p.minDefender, p.maxDefender,
        p.randomDefender, p.defensePower, p.distance, p.result, p.randomDamage, p.damageDefender, p.damageAttacker].every(Number.isFinite) &&
      typeof p.defenderCanCounter === "boolean" && isPlausibleGameState({ ...save.state, units: [entry.attacker, entry.defender] });
  })) throw new Error("Invalid pending campaign combats.");
  return clone({ format: "hexagon-campaign-save", version: 1, campaign, missionId: mission.id,
    completedMissionIds: [...new Set(save.completedMissionIds)], state: save.state, pendingCombats });
}

export function unlockedMissionIndex(campaign: CampaignDocument, completed: readonly string[]): number {
  const firstIncomplete = campaign.missions.findIndex(m => !completed.includes(m.id));
  return firstIncomplete < 0 ? campaign.missions.length - 1 : firstIncomplete;
}

export function readCampaignProgress(campaign: CampaignDocument, storage: CampaignStorage): CampaignProgress {
  const empty: CampaignProgress = { version: 1, campaignId: campaign.id, completedMissionIds: [], save: null };
  try {
    const raw = storage.getItem(CAMPAIGN_STORAGE_PREFIX + campaign.id);
    if (!raw) return empty;
    const progress = JSON.parse(raw) as CampaignProgress;
    if (progress.version !== 1 || progress.campaignId !== campaign.id || !Array.isArray(progress.completedMissionIds)) return empty;
    const completedMissionIds = campaign.missions.filter(m => progress.completedMissionIds.includes(m.id)).map(m => m.id);
    let save: CampaignSave | null = null;
    try { if (progress.save) save = parseCampaignSave(progress.save); } catch { /* Keep valid unlocks when an old checkpoint is incompatible. */ }
    if (save?.campaign.id !== campaign.id) save = null;
    return { version: 1, campaignId: campaign.id, completedMissionIds, save };
  } catch { return empty; }
}

export function writeCampaignProgress(save: CampaignSave, storage: CampaignStorage): boolean {
  try {
    storage.setItem(CAMPAIGN_STORAGE_PREFIX + save.campaign.id, JSON.stringify({ version: 1, campaignId: save.campaign.id,
      completedMissionIds: save.completedMissionIds, save } satisfies CampaignProgress));
    const catalogueKey = "hexagon-campaign-library-v1";
    let ids: string[] = [];
    try { const stored = JSON.parse(storage.getItem(catalogueKey) ?? "[]"); if (Array.isArray(stored)) ids = stored.filter(id => typeof id === "string"); } catch { /* Rebuild a broken local index. */ }
    if (!ids.includes(save.campaign.id)) storage.setItem(catalogueKey, JSON.stringify([...ids, save.campaign.id]));
    return true;
  } catch { return false; }
}

export function createCampaignSave(campaign: CampaignDocument, index: number, completed: string[] = []): CampaignSave {
  const mission = campaign.missions[index];
  if (!mission) throw new Error("Mission not found.");
  return { format: "hexagon-campaign-save", version: 1, campaign: clone(campaign), missionId: mission.id,
    completedMissionIds: [...completed], state: clone(mission.state) };
}

export function finishCampaignMission(save: CampaignSave, winner: 0 | 1): number | null {
  if (winner !== 0) return null;
  if (!save.completedMissionIds.includes(save.missionId)) save.completedMissionIds.push(save.missionId);
  const next = save.campaign.missions.findIndex(m => m.id === save.missionId) + 1;
  return next < save.campaign.missions.length ? next : null;
}

export function parseCampaignIndex(value: unknown): string[] {
  const index = value as { version?: unknown; campaigns?: unknown } | null;
  if (!index || index.version !== 1 || !Array.isArray(index.campaigns) || index.campaigns.length > 100 ||
      !index.campaigns.every(path => typeof path === "string" && /^[a-zA-Z0-9_/-][a-zA-Z0-9_./-]*\.json$/.test(path) && !path.startsWith("/") && !path.includes(".."))) {
    throw new Error("Invalid campaign catalogue at /campaigns/index.json.");
  }
  return [...new Set(index.campaigns as string[])];
}

export function readSavedCampaigns(storage: CampaignStorage): CampaignDocument[] {
  try {
    const ids: unknown = JSON.parse(storage.getItem("hexagon-campaign-library-v1") ?? "[]");
    if (!Array.isArray(ids)) return [];
    const campaigns: CampaignDocument[] = [];
    for (const id of ids.slice(0, 100)) {
      if (typeof id !== "string") continue;
      try {
        const progress = JSON.parse(storage.getItem(CAMPAIGN_STORAGE_PREFIX + id) ?? "null") as CampaignProgress | null;
        if (progress?.save) campaigns.push(parseCampaignSave(progress.save).campaign);
      } catch { /* One broken checkpoint must not hide other campaigns. */ }
    }
    return campaigns;
  } catch { return []; }
}
