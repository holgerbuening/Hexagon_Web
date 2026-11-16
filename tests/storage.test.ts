import assert from "node:assert/strict";
import { test } from "node:test";
import { createCampaignRepository } from "../src/storage/campaignRepository";
import { migrateLegacyValue, type BrowserDatabase, type DatabaseWrite, type LegacyStorage, type StoreName } from "../src/storage/browserDatabase";
import { createCampaign, clone } from "../src/core/campaigns/documents";
import { CAMPAIGN_STORAGE_PREFIX, createCampaignSave, writeCampaignProgress } from "../src/core/campaigns/runtime";
import { FieldType } from "../src/core/map/fieldTypes";
import { Unit } from "../src/core/units/unit";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { GameCore } from "../src/core/gameCore";
import { UnitType } from "../src/core/units/unitType";

class MemoryDatabase implements BrowserDatabase {
  data = new Map<string, unknown>();
  writes: DatabaseWrite[][] = [];
  fail = false;
  async get<T>(store: StoreName, key: string): Promise<T | undefined> { return structuredClone(this.data.get(`${store}:${key}`)) as T | undefined; }
  async all<T>(store: StoreName): Promise<T[]> { return [...this.data].filter(([key]) => key.startsWith(`${store}:`)).map(([,value]) => structuredClone(value) as T); }
  async write(entries: DatabaseWrite[]) {
    if (this.fail) throw new Error("quota");
    this.writes.push(structuredClone(entries));
    for (const entry of entries) this.data.set(`${entry.store}:${entry.key}`, structuredClone(entry.value));
  }
}
function legacy() {
  const data = new Map<string, string>();
  return { data, get length() { return data.size; }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } } satisfies LegacyStorage & { data: Map<string,string>; setItem(key: string, value: string): void };
}
function fixture() {
  const campaign = createCampaign();
  const m = campaign.missions[0]!;
  m.state.tiles.forEach(t => { t.field = FieldType.Farmland; });
  m.state.units = [Unit.serialize(new Unit(UnitType.MilitaryBase, 0, 0, 0)), Unit.serialize(new Unit(UnitType.MilitaryBase, 1, 0, 1))];
  campaign.image = "data:image/png;base64," + "A".repeat(6_000_000);
  return createCampaignSave(campaign, 0);
}

test("large campaigns are stored once, snapshots contain no campaign images and portable saves remain complete", async () => {
  const db = new MemoryDatabase(), old = legacy(), repo = createCampaignRepository(db, () => old), save = fixture();
  await repo.save(save);
  save.state.turn = 3; save.state.playerBalances[0] = 777;
  await repo.save(save);
  assert.equal(db.writes.flat().filter(e => e.store === "campaigns").length, 1);
  const progress = await db.get<Record<string,unknown>>("progress", save.campaign.id);
  assert.equal(JSON.stringify(progress).includes("data:image"), false);
  assert.ok(JSON.stringify(progress).length < 100_000);
  const restored = (await repo.read(save.campaign)).save!;
  assert.equal(restored.state.turn, 3); assert.equal(restored.state.playerBalances[0], 777);
  assert.equal(restored.campaign.image, save.campaign.image);
  assert.equal((await repo.list()).length, 1);
  assert.equal(old.length, 0);
  const reopened = createCampaignRepository(db, () => old);
  await reopened.save((await reopened.read(save.campaign)).save!);
  await createCampaignRepository(db, () => old).save(clone(save));
  assert.equal(db.writes.flat().filter(e => e.store === "campaigns").length, 1);
});

test("queued checkpoints capture call-time state and recover after failed writes", async () => {
  const db = new MemoryDatabase(), repo = createCampaignRepository(db, legacy), save = fixture();
  const first = repo.save(save); save.state.turn = 5; const second = repo.save(save);
  await Promise.all([first, second]);
  const states = db.writes.flat().filter(e => e.store === "progress").map(e => (e.value as { save: {state:{turn:number}} }).save.state.turn);
  assert.deepEqual(states, [1,5]);
  db.fail = true; save.state.turn = 7; await assert.rejects(repo.save(save));
  db.fail = false; save.state.turn = 9; await repo.save(save);
  assert.equal((await repo.read(save.campaign)).save!.state.turn, 9);
});

test("legacy campaign migration discovers orphaned saves, verifies both records and removes only migrated keys", async () => {
  const db = new MemoryDatabase(), old = legacy(), save = fixture();
  writeCampaignProgress(save, old); old.removeItem("hexagon-campaign-library-v1");
  old.setItem("unrelated", "keep"); old.setItem(CAMPAIGN_STORAGE_PREFIX + "broken", "invalid");
  const repo = createCampaignRepository(db, () => old);
  assert.equal((await repo.read(save.campaign)).save!.campaign.image, save.campaign.image);
  assert.equal(old.getItem(CAMPAIGN_STORAGE_PREFIX + save.campaign.id), null);
  assert.equal(old.getItem("unrelated"), "keep"); assert.equal(old.getItem(CAMPAIGN_STORAGE_PREFIX + "broken"), "invalid");
});

test("failed campaign migrations keep the legacy save and retry successfully", async () => {
  const db = new MemoryDatabase(), old = legacy(), save = fixture(); writeCampaignProgress(save, old);
  const repo = createCampaignRepository(db, () => old); db.fail = true;
  await assert.rejects(repo.list()); assert.notEqual(old.getItem(CAMPAIGN_STORAGE_PREFIX + save.campaign.id), null);
  db.fail = false; assert.equal((await repo.list()).length, 1);
  assert.equal(old.getItem(CAMPAIGN_STORAGE_PREFIX + save.campaign.id), null);
  assert.equal(old.getItem("hexagon-campaign-library-v1"), null);
});

test("workspace migration retains the source after write/readback failures and preserves newer database drafts", async () => {
  const db = new MemoryDatabase(), old = legacy(); old.setItem("draft", '{"title":"old"}'); db.fail = true;
  await assert.rejects(migrateLegacyValue(db, old, "draft", "author", "workspace", value => value));
  assert.notEqual(old.getItem("draft"), null);
  db.fail = false;
  assert.deepEqual(await migrateLegacyValue(db, old, "draft", "author", "workspace", value => value), {title:"old"});
  assert.equal(old.getItem("draft"), null);
  old.setItem("draft", '{"title":"older"}');
  assert.deepEqual(await migrateLegacyValue(db, old, "draft", "author", "workspace", value => value), {title:"old"});
  assert.notEqual(old.getItem("draft"), null);
  const brokenReadback: BrowserDatabase = { ...db, get: async () => undefined, all: async () => [], write: async () => {} };
  await assert.rejects(migrateLegacyValue(brokenReadback, old, "draft", "author", "workspace", value => value));
  assert.notEqual(old.getItem("draft"), null);
});

test("a newer checkpoint is never replaced by an older legacy backup", async () => {
  const db = new MemoryDatabase(), old = legacy(), save = fixture();
  await createCampaignRepository(db, () => old).save(save);
  const oldSave = clone(save); oldSave.state.turn = 1; writeCampaignProgress(oldSave, old);
  save.state.turn = 9; await createCampaignRepository(db, legacy).save(save);
  const repo = createCampaignRepository(db, () => old);
  assert.equal((await repo.read(save.campaign)).save!.state.turn, 9);
  assert.notEqual(old.getItem(CAMPAIGN_STORAGE_PREFIX + save.campaign.id), null);
});


test("separate checkpoints preserve pending AI combat rolls and survival counters", async () => {
  const db = new MemoryDatabase(), repo = createCampaignRepository(db, legacy), save = fixture();
  const mission = save.campaign.missions[0]!;
  mission.objective = { type: "survive", rounds: 10 };
  save.state.mission!.objective = mission.objective;
  save.state.mission!.completedRounds = 3;
  save.state.mission!.pendingCombats = 1;
  save.state.mission!.roundPending = true;
  save.state.turn = 9;
  const attacker = new Unit(UnitType.Infantry, 1, 1, 1), defender = new Unit(UnitType.Infantry, 2, 1, 0);
  const preview = new CombatSystem(() => 0.5).computePreview(new GameCore(8, 8).getState(), attacker, defender, () => undefined);
  save.pendingCombats = [{ preview, attacker: Unit.serialize(attacker), defender: Unit.serialize(defender) }];
  await repo.save(save);
  const restored = (await createCampaignRepository(db, legacy).read(save.campaign)).save!;
  assert.deepEqual(restored.pendingCombats, save.pendingCombats);
  assert.deepEqual(restored.state.mission, save.state.mission);
});
