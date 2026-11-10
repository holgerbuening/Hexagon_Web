import assert from "node:assert/strict";
import { test } from "node:test";
import { createCampaign, createMission, parseMission, parseMissionState, parseCampaign, clone, missionIssues, campaignIssues, moveMission } from "../src/author/documents";
import { FieldType } from "../src/core/map/fieldTypes";
import { Unit } from "../src/core/units/unit";
import { UnitType } from "../src/core/units/unitType";
import { GameCore } from "../src/core/gameCore";
import { prepareGameLaunch, consumeGameLaunch } from "../src/gameLaunch";

function playable() {
  const m = createMission(12, 10);
  m.state.tiles.forEach(t => { t.field = FieldType.Farmland; });
  for (const [index, owner] of [[15, 0], [95, 1]] as const) {
    const t = m.state.tiles[index]!;
    m.state.units.push(Unit.serialize(new Unit(UnitType.MilitaryBase, t.q, t.r, owner)));
  }
  return m;
}

test("missions round trip story, image, difficulty, terrain and units without sharing references", () => {
  const m = playable();
  m.briefing = "Der erste Auftrag"; m.victoryText = "Geschafft"; m.defeatText = "Neuer Versuch";
  m.image = "data:image/png;base64,aGVsbG8="; m.difficulty = "hard";
  m.state.tiles[0]!.hasRoad = true;
  m.state.units[0]!.hp = 65; m.state.units[0]!.experience = 10;
  const loaded = parseMission(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(loaded, m);
  assert.deepEqual(missionIssues(loaded), []);
  loaded.state.units[0]!.hp = 50;
  assert.equal(m.state.units[0]!.hp, 65);
  loaded.state.tiles[0]!.field = FieldType.Woods;
  assert.equal(m.state.tiles[0]!.field, FieldType.Farmland);
});

test("save imports become fresh mission starts and preserve combat configuration", () => {
  const m = playable(); const saved = clone(m.state);
  saved.turn = 50; saved.currentPlayer = 1; saved.gameOver = true; saved.winner = 1;
  saved.units[0]!.acted = true; saved.units[0]!.remainingMovement = 0; saved.units[0]!.selected = true;
  saved.units[0]!.offense = 250;
  const state = parseMissionState(saved);
  assert.equal(state.turn, 1); assert.equal(state.currentPlayer, 0); assert.equal(state.gameOver, false);
  assert.equal(state.winner, null); assert.equal(state.units[0]!.acted, false);
  assert.equal(state.units[0]!.selected, false); assert.equal(state.units[0]!.offense, 250);
  const game = new GameCore(20, 20); game.loadState(state);
  assert.deepEqual(game.serializeState(), state);
});

test("mission validation distinguishes editable drafts from playable starts", () => {
  const m = createMission();
  assert.doesNotThrow(() => parseMission(m));
  assert.equal(missionIssues(m).length, 2);
  const ready = playable();
  const unit = ready.state.units[0]!;
  ready.state.tiles.find(t => t.q === unit.q && t.r === unit.r)!.field = FieldType.Ocean;
  assert.ok(missionIssues(ready).some(issue => issue.includes("water")));
  ready.title = " "; assert.ok(missionIssues(ready).some(issue => issue.includes("mission title")));
});

test("imports reject malformed missions without modifying the original", () => {
  const original = playable(); const snapshot = JSON.stringify(original);
  const invalid = [null, {}, { ...clone(original), version: 2 }, { ...clone(original), difficulty: "impossible" },
    { ...clone(original), image: "javascript:alert(1)" }, { ...clone(original), image: "data:image/svg+xml;base64,AAAA" },
    { ...clone(original), id: "bad/id" }];
  const duplicate = clone(original); duplicate.state.units.push(clone(duplicate.state.units[0]!)); invalid.push(duplicate);
  const offMap = clone(original); offMap.state.units[0]!.q = 999; invalid.push(offMap);
  const hp = clone(original); hp.state.units[0]!.hp = 101; invalid.push(hp);
  const balance = clone(original); balance.state.playerBalances = [-1, 5]; invalid.push(balance);
  const tiles = clone(original); tiles.state.tiles[0] = clone(tiles.state.tiles[1]!); invalid.push(tiles);
  const invalidType = clone(original); (invalidType.state.units[0] as unknown as { type: string }).type = "alien"; invalid.push(invalidType);
  for (const value of invalid) assert.throws(() => parseMission(value));
  assert.equal(JSON.stringify(original), snapshot);
});

test("campaigns are self-contained and retain mission order and story on export", () => {
  const c = createCampaign(); c.missions = [playable(), playable(), playable()];
  c.introduction = "Die Vorgeschichte"; c.completionText = "Ende";
  const ids = c.missions.map(m => m.id);
  moveMission(c, 0, 1);
  assert.deepEqual(c.missions.map(m => m.id), [ids[1], ids[0], ids[2]]);
  moveMission(c, 0, -1); moveMission(c, 2, 1); moveMission(c, -1, 1);
  const restored = parseCampaign(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(restored, c); assert.deepEqual(campaignIssues(restored), []);
  restored.missions[0]!.title = "Verändert";
  assert.notEqual(restored.missions[0]!.title, c.missions[0]!.title);
  const duplicate = clone(c); duplicate.missions[1]!.id = duplicate.missions[0]!.id;
  assert.throws(() => parseCampaign(duplicate));
  c.missions = []; assert.ok(campaignIssues(c).length > 0);
});

test("prepared test launches consume a detached mission and leave the source untouched", () => {
  const mission = playable();
  const original = clone(mission);
  const prepared = parseMission(mission);
  prepareGameLaunch({ state: prepared.state, difficulty: "hard" });
  const launch = consumeGameLaunch()!;
  assert.equal(launch.difficulty, "hard"); assert.equal(consumeGameLaunch(), null);
  const game = new GameCore(20, 20); game.loadState(launch.state); game.endTurn();
  assert.deepEqual(mission, original);
});
