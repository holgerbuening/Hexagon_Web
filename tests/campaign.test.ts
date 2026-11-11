import assert from "node:assert/strict";
import { test } from "node:test";
import { createCampaign, createMission, clone } from "../src/core/campaigns/documents";
import { createCampaignSave, parseCampaignSave, playableCampaign, finishCampaignMission, unlockedMissionIndex, writeCampaignProgress, readCampaignProgress, readSavedCampaigns, parseCampaignIndex, CAMPAIGN_STORAGE_PREFIX } from "../src/core/campaigns/runtime";
import { Unit } from "../src/core/units/unit";
import { UnitType } from "../src/core/units/unitType";
import { FieldType } from "../src/core/map/fieldTypes";
import { GameCore } from "../src/core/gameCore";
import { CombatSystem } from "../src/core/systems/combatSystem";

function campaign() {
  const c = createCampaign();
  c.missions = ["easy", "normal", "hard"].map((difficulty, index) => {
    const m = createMission(8, 8); m.difficulty = difficulty as "easy" | "normal" | "hard"; m.title = `Mission ${index + 1}`;
    m.state.tiles.forEach(t => { t.field = FieldType.Farmland; });
    for (const [position, owner] of [[5, 0], [50, 1]] as const) {
      const tile = m.state.tiles[position]!;
      m.state.units.push(Unit.serialize(new Unit(UnitType.MilitaryBase, tile.q, tile.r, owner)));
    }
    return m;
  });
  return c;
}
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

test("victories unlock the next mission, defeat does not, final victory completes the campaign", () => {
  const c = campaign(); const completed: string[] = [];
  assert.equal(unlockedMissionIndex(c, completed), 0);
  const first = createCampaignSave(c, 0, completed);
  assert.equal(finishCampaignMission(first, 1), null);
  assert.deepEqual(first.completedMissionIds, []);
  assert.equal(finishCampaignMission(first, 0), 1);
  assert.equal(finishCampaignMission(first, 0), 1);
  assert.equal(first.completedMissionIds.length, 1);
  assert.equal(unlockedMissionIndex(c, first.completedMissionIds), 1);
  const second = createCampaignSave(c, 1, first.completedMissionIds);
  assert.equal(finishCampaignMission(second, 0), 2);
  const third = createCampaignSave(c, 2, second.completedMissionIds);
  assert.equal(finishCampaignMission(third, 0), null);
  assert.equal(third.completedMissionIds.length, 3);
  assert.equal(unlockedMissionIndex(c, third.completedMissionIds), 2);
  assert.equal(c.missions[0]!.state.gameOver, false);
});

test("portable campaign saves and local checkpoints preserve turn, damage, money and mission association", () => {
  const c = campaign(); const save = createCampaignSave(c, 1, [c.missions[0]!.id]);
  save.state.turn = 17; save.state.units[0]!.hp = 35; save.state.playerBalances[0] = 750;
  const restored = parseCampaignSave(JSON.parse(JSON.stringify(save)));
  assert.equal(restored.state.turn, 17); assert.equal(restored.state.units[0]!.hp, 35);
  assert.equal(restored.missionId, c.missions[1]!.id); assert.equal(restored.campaign.missions[1]!.difficulty, "normal");
  const local = storage(); assert.equal(writeCampaignProgress(restored, local), true);
  const progress = readCampaignProgress(c, local);
  assert.equal(progress.save!.state.playerBalances[0], 750);
  assert.deepEqual(progress.completedMissionIds, [c.missions[0]!.id]);
  assert.equal(readSavedCampaigns(local)[0]!.id, c.id);
  restored.state.units[0]!.hp = 5;
  assert.equal(c.missions[1]!.state.units[0]!.hp, 100);
});

test("invalid progress, broken saves and unavailable browser storage are handled", () => {
  const c = campaign(); const save = createCampaignSave(c, 0);
  const badMission = clone(save); badMission.missionId = "missing"; assert.throws(() => parseCampaignSave(badMission));
  const badState = clone(save); badState.state.currentPlayer = 1; assert.throws(() => parseCampaignSave(badState));
  const badProgress = clone(save); badProgress.completedMissionIds = ["missing"]; assert.throws(() => parseCampaignSave(badProgress));
  const badCampaign = clone(c); badCampaign.missions[0]!.state.units = []; assert.throws(() => playableCampaign(badCampaign));
  const local = storage(); local.setItem(CAMPAIGN_STORAGE_PREFIX + c.id, "not-json");
  assert.deepEqual(readCampaignProgress(c, local).completedMissionIds, []);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
  assert.equal(writeCampaignProgress(save, blocked), false);
  assert.equal(readCampaignProgress(c, blocked).save, null);
});

test("catalogue accepts relative campaign JSON paths and rejects paths outside its directory", () => {
  assert.deepEqual(parseCampaignIndex({ version: 1, campaigns: ["first/campaign.json", "second.json", "second.json"] }), ["first/campaign.json", "second.json"]);
  for (const path of ["../campaign.json", "/campaign.json", "https://example.org/a.json", "file.txt"]) {
    assert.throws(() => parseCampaignIndex({ version: 1, campaigns: [path] }));
  }
  assert.throws(() => parseCampaignIndex(null));
});

test("pending AI fights retain their original rolled result when a campaign is saved and resumed", () => {
  const c = campaign(); const save = createCampaignSave(c, 0);
  const attacker = new Unit(UnitType.Infantry, 1, 1, 1);
  const defender = new Unit(UnitType.Infantry, 2, 1, 0);
  const combat = new CombatSystem(() => 0.5);
  // Use the actual preview produced by the combat system.
  const preview = combat.computePreview(new GameCore(8, 8).getState(), attacker, defender, () => undefined);
  save.pendingCombats = [{ preview, attacker: Unit.serialize(attacker), defender: Unit.serialize(defender) }];
  const restored = parseCampaignSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.pendingCombats, save.pendingCombats);
});
