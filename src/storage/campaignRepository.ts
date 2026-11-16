import { clone, type CampaignDocument } from "../core/campaigns/documents";
import { CAMPAIGN_STORAGE_PREFIX, parseCampaignSave, playableCampaign, type CampaignProgress, type CampaignSave } from "../core/campaigns/runtime";
import { browserDatabase, type BrowserDatabase, type LegacyStorage } from "./browserDatabase";

type Checkpoint = { version: 2; campaignId: string; completedMissionIds: string[]; save: Omit<CampaignSave, "campaign"> | null };
export interface CampaignRepository {
  read(campaign: CampaignDocument): Promise<CampaignProgress>;
  list(): Promise<CampaignDocument[]>;
  save(save: CampaignSave): Promise<void>;
}

export function createCampaignRepository(db: BrowserDatabase, legacy: () => LegacyStorage): CampaignRepository {
  let ready: Promise<void> | undefined;
  let queue = Promise.resolve();
  let stored = new WeakSet<CampaignDocument>();
  async function initialize(): Promise<void> {
    if (!ready) ready = migrate().catch(error => { ready = undefined; throw error; });
    await ready;
  }
  async function migrate(): Promise<void> {
    let source: LegacyStorage;
    try { source = legacy(); } catch { return; } // IndexedDB can still work if Web Storage is disabled.
    const keys: string[] = [];
    for (let i = 0; i < source.length; i++) {
      const key = source.key(i); if (key?.startsWith(CAMPAIGN_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const raw = source.getItem(key);
      if (!raw) continue;
      let progress: CampaignProgress;
      let save: CampaignSave;
      try {
        progress = JSON.parse(raw) as CampaignProgress;
        if (progress.version !== 1 || !Array.isArray(progress.completedMissionIds) || !progress.completedMissionIds.every(id => typeof id === "string") || key !== CAMPAIGN_STORAGE_PREFIX + progress.campaignId || !progress.save) continue;
        save = parseCampaignSave(progress.save);
        if (save.campaign.id !== progress.campaignId) continue;
      } catch { continue; } // Keep unreadable legacy data for manual recovery.
      const id = save.campaign.id;
      const existing = await db.get<Checkpoint>("progress", id);
      const { campaign, ...snapshot } = save;
      const checkpoint: Checkpoint = { version: 2, campaignId: id, completedMissionIds: progress.completedMissionIds, save: snapshot };
      if (!existing) await db.write([
        { store: "campaigns", key: id, value: campaign },
        { store: "progress", key: id, value: checkpoint },
      ]);
      const restored = await db.get<Checkpoint>("progress", id);
      const restoredCampaign = await db.get<CampaignDocument>("campaigns", id);
      if (!existing && (JSON.stringify(restored) !== JSON.stringify(checkpoint) || JSON.stringify(restoredCampaign) !== JSON.stringify(campaign))) {
        throw new Error("Campaign migration could not be verified. The original save was retained.");
      }
      // If a newer checkpoint already exists, preserve a differing legacy source as a backup.
      if (JSON.stringify(restored) === JSON.stringify(checkpoint) && JSON.stringify(restoredCampaign) === JSON.stringify(campaign) && source.getItem(key) === raw) source.removeItem(key);
    }
    // This index is only a list of IDs; discover old saves by prefix, including orphaned saves.
    const index = source.getItem("hexagon-campaign-library-v1");
    if (index !== null && keys.every(key => source.getItem(key) === null)) source.removeItem("hexagon-campaign-library-v1");
  }
  return {
    async read(campaign) {
      await initialize(); await queue;
      const empty: CampaignProgress = { version: 1, campaignId: campaign.id, completedMissionIds: [], save: null };
      const progress = await db.get<Checkpoint>("progress", campaign.id);
      if (!progress || progress.version !== 2 || !Array.isArray(progress.completedMissionIds)) return empty;
      const completedMissionIds = campaign.missions.filter(m => progress.completedMissionIds.includes(m.id)).map(m => m.id);
      let save: CampaignSave | null = null;
      if (progress.save) {
        const savedCampaign = await db.get<CampaignDocument>("campaigns", campaign.id);
        try {
          save = parseCampaignSave({ ...progress.save, campaign: savedCampaign });
          stored.add(save.campaign);
        } catch { /* Retain valid unlocks. */ }
      }
      return { ...empty, completedMissionIds, save };
    },
    async list() {
      await initialize(); await queue;
      const campaigns: CampaignDocument[] = [];
      for (const value of await db.all<unknown>("campaigns")) {
        try { campaigns.push(playableCampaign(value)); } catch { /* Isolate corrupt records. */ }
      }
      return campaigns;
    },
    save(save) {
      // Capture mutable gameplay data now so queued writes cannot overwrite newer progress.
      const { campaign, ...snapshot } = save;
      const checkpoint: Checkpoint = { version: 2, campaignId: campaign.id, completedMissionIds: [...save.completedMissionIds], save: clone(snapshot) };
      const operation = queue.then(async () => {
        await initialize();
        const entries = [{ store: "progress" as const, key: campaign.id, value: checkpoint }];
        if (!stored.has(campaign)) {
          const existing = await db.get<CampaignDocument>("campaigns", campaign.id);
          const unchanged = existing !== undefined && JSON.stringify(existing) === JSON.stringify(campaign);
          await db.write(unchanged ? entries : [...entries, { store: "campaigns", key: campaign.id, value: campaign }]);
          // A different version with the same ID invalidates cached campaign identities.
          if (!unchanged) stored = new WeakSet<CampaignDocument>();
          stored.add(campaign);
        } else await db.write(entries);
      });
      queue = operation.catch(() => {}); // One failed write must not block later retries.
      return operation;
    },
  };
}
export const campaignRepository = createCampaignRepository(browserDatabase, () => localStorage);
