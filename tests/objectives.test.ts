import assert from "node:assert/strict";
import { test } from "node:test";
import { GameCore } from "../src/core/gameCore";
import { Unit } from "../src/core/units/unit";
import { UnitType } from "../src/core/units/unitType";
import type { GameState } from "../src/core/types";
import { FieldType } from "../src/core/map/fieldTypes";
import { createSeededRng } from "../src/core/rng";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { createCampaign, createMission, parseMission, missionIssues, clone } from "../src/core/campaigns/documents";
import { createCampaignSave, parseCampaignSave } from "../src/core/campaigns/runtime";
import { getMissionProgress, parseMissionObjective } from "../src/core/campaigns/objectives";
import { isPlausibleGameState } from "../src/net/stateGuard";

function scenario() {
  const game = new GameCore(10, 10, createSeededRng(31)); game.configureAi(null);
  const state = game.getState() as GameState;
  state.tiles.forEach(t => { t.field = FieldType.Farmland; t.hasRoad = false; });
  const place = (type: UnitType, col: number, row: number, owner: 0 | 1) => {
    const t = game.getTileByColRow(col, row)!; return new Unit(type, t.q, t.r, owner);
  };
  const ownHQ = place(UnitType.MilitaryBase, 0, 0, 0);
  const enemyHQ = place(UnitType.MilitaryBase, 9, 9, 1);
  const attacker = place(UnitType.Tank, 3, 4, 0);
  const enemy = place(UnitType.Infantry, 7, 4, 1);
  state.units = [ownHQ, enemyHQ, attacker, enemy]; state.playerBalances = [1000, 0];
  const destroy = (target: Unit, by = attacker) => {
    by.resetForNewTurn();
    const preview = new CombatSystem(() => 0.5).computePreview(state, by, target, pos => game.getTile(pos));
    preview.damageDefender = 10000; preview.damageAttacker = 0;
    game.applyCombat(preview);
  };
  return { game, state, place, ownHQ, enemyHQ, attacker, enemy, destroy };
}

test("eliminate-all requires every enemy, not just the enemy HQ", () => {
  const { game, state, enemyHQ, enemy, destroy } = scenario();
  game.configureMissionObjective({ type: "eliminate-all" });
  destroy(enemyHQ);
  assert.equal(state.gameOver, false); assert.equal(getMissionProgress(state)!.detail, "Enemy units remaining: 1");
  destroy(enemy); assert.equal(state.gameOver, true); assert.equal(state.winner, 0);
});

test("ordinary games and the legacy mission objective still end after enemy HQ destruction", () => {
  for (const mission of [false, true]) {
    const { game, state, enemyHQ, destroy } = scenario();
    if (mission) game.configureMissionObjective({ type: "destroy-headquarters" });
    destroy(enemyHQ); assert.equal(state.gameOver, true); assert.equal(state.winner, 0);
  }
});

test("loss of the last own HQ defeats the mission independently of its victory objective", () => {
  const { game, state, ownHQ, enemy, destroy } = scenario();
  game.configureMissionObjective({ type: "survive", rounds: 10 });
  destroy(ownHQ, enemy); assert.equal(state.gameOver, true); assert.equal(state.winner, 1);
});

test("survival counts full rounds, survives save/load and does not win after just the player turn", () => {
  const { game, state } = scenario();
  game.configureMissionObjective({ type: "survive", rounds: 2 });
  game.endTurn(); assert.equal(state.mission!.completedRounds, 0); assert.equal(state.gameOver, false);
  game.endTurn(); assert.equal(state.mission!.completedRounds, 1); assert.equal(state.gameOver, false);
  const restored = new GameCore(10, 10); restored.configureAi(null); restored.loadState(game.serializeState());
  restored.endTurn(); assert.equal(restored.getState().gameOver, false);
  restored.endTurn(); assert.equal(restored.getState().mission!.completedRounds, 2);
  assert.equal(restored.getState().winner, 0); assert.equal(restored.getState().gameOver, true);
});

for (const lethal of [false, true]) {
  test(`the final survival round waits for pending AI combat (${lethal ? "defeat" : "victory"})`, () => {
    const { game, state, ownHQ, enemyHQ, place } = scenario();
    ownHQ.q = game.getTileByColRow(1, 4)!.q; ownHQ.r = 4; ownHQ.pos = { q: ownHQ.q, r: ownHQ.r };
    ownHQ.maxHP = lethal ? 1 : 1000; ownHQ.hp = ownHQ.maxHP; ownHQ.defense = 0;
    const enemy = place(UnitType.Tank, 3, 4, 1); enemy.offense = lethal ? 1000 : 100;
    state.units = [ownHQ, enemyHQ, enemy];
    game.configureAi(1); game.configureMissionObjective({ type: "survive", rounds: 1 });
    const previews = game.endTurn();
    assert.ok(previews.length > 0); assert.equal(state.gameOver, false);
    assert.equal(state.mission!.completedRounds, 0); assert.equal(state.mission!.roundPending, true);
    for (const entry of previews) game.applyCombat(entry.preview);
    assert.equal(state.mission!.completedRounds, 1); assert.equal(state.mission!.pendingCombats, 0);
    assert.equal(state.gameOver, true); assert.equal(state.winner, lethal ? 1 : 0);
  });
}

test("all cities and industries must be held simultaneously; moving triggers the victory", () => {
  const { game, state, attacker, place } = scenario();
  const second = place(UnitType.Infantry, 6, 4, 0); state.units.push(second);
  const city = game.getTileByColRow(4, 4)!; city.field = FieldType.City;
  const industry = game.getTileByColRow(5, 4)!; industry.field = FieldType.Industry;
  game.configureMissionObjective({ type: "capture-all" });
  game.selectHex(attacker); game.selectHex(city);
  assert.equal(state.gameOver, false); assert.equal(getMissionProgress(state)!.detail, "Cities and industries: 1/2");
  game.selectHex(attacker); game.selectHex(game.getTileByColRow(3, 4)!);
  game.selectHex(second); game.selectHex(industry);
  assert.equal(state.gameOver, false); assert.equal(getMissionProgress(state)!.detail, "Cities and industries: 1/2");
  attacker.remainingMovement = 3; game.selectHex(attacker); game.selectHex(city);
  assert.equal(state.gameOver, true); assert.equal(state.winner, 0);
});

test("capture-position is won by moving onto the target without destroying the enemy HQ", () => {
  const { game, state, attacker } = scenario();
  const target = game.getTileByColRow(4, 4)!;
  game.configureMissionObjective({ type: "capture-position", position: { q: target.q, r: target.r } });
  game.selectHex(attacker); game.selectHex(target);
  assert.equal(state.winner, 0); assert.equal(state.gameOver, true);
  assert.ok(attacker.animationPath.length > 0);
});

test("placing a purchased unit on the capture target also completes the objective", () => {
  const { game, state, ownHQ } = scenario();
  const target = game.getTileByColRow(1, 0)!;
  game.configureMissionObjective({ type: "capture-position", position: { q: target.q, r: target.r } });
  game.beginPurchase(ownHQ, UnitType.Infantry); game.selectHex(target);
  assert.equal(state.gameOver, true); assert.equal(state.winner, 0);
});

test("mission files validate objective parameters and permit non-HQ missions without an enemy HQ", () => {
  const { game } = scenario(); const m = createMission(10, 10); m.state = game.serializeState();
  assert.equal(parseMission(m).objective, undefined);
  m.objective = { type: "survive", rounds: 5 };
  m.state.units = m.state.units.filter(u => !(u.owner === 1 && u.type === UnitType.MilitaryBase));
  assert.deepEqual(missionIssues(m), []); assert.deepEqual(parseMission(m).objective, m.objective);
  for (const rounds of [0, -1, 1.5, Infinity]) assert.throws(() => parseMissionObjective({ type: "survive", rounds }));
  assert.throws(() => parseMissionObjective({ type: "unknown" }));
  m.objective = { type: "capture-all" }; assert.ok(missionIssues(m).some(issue => issue.includes("city or industry")));
  m.objective = { type: "capture-position", position: { q: 199, r: 199 } };
  assert.ok(missionIssues(m).some(issue => issue.includes("land tile")));
  const water = m.state.tiles[0]!; water.field = FieldType.Ocean;
  m.objective = { type: "capture-position", position: { q: water.q, r: water.r } };
  assert.ok(missionIssues(m).some(issue => issue.includes("land tile")));
});

test("a campaign resumed during the final AI combats waits for those combats before survival victory", () => {
  const { game, state, ownHQ, enemyHQ, place } = scenario();
  ownHQ.q = game.getTileByColRow(1, 4)!.q; ownHQ.r = 4; ownHQ.pos = { q: ownHQ.q, r: ownHQ.r };
  ownHQ.maxHP = 1000; ownHQ.hp = 1000; ownHQ.defense = 0;
  const enemy = place(UnitType.Tank, 3, 4, 1); enemy.offense = 100;
  state.units = [ownHQ, enemyHQ, enemy];
  const campaign = createCampaign(); const m = campaign.missions[0]!;
  m.state = game.serializeState(); m.objective = { type: "survive", rounds: 1 };
  const save = createCampaignSave(campaign, 0);
  game.loadState(save.state); game.configureAi(1);
  save.pendingCombats = game.endTurn(); save.state = game.serializeState();
  assert.ok(save.pendingCombats.length);
  const parsed = parseCampaignSave(JSON.parse(JSON.stringify(save)));
  const resumed = new GameCore(10, 10); resumed.loadState(parsed.state);
  assert.equal(resumed.getState().gameOver, false);
  assert.equal(resumed.getState().mission!.completedRounds, 0);
  for (const entry of parsed.pendingCombats!) resumed.applyCombat(entry.preview);
  assert.equal(resumed.getState().gameOver, true); assert.equal(resumed.getState().winner, 0);
});

test("campaign saves retain objectives and counters and reject mismatched or malformed progress", () => {
  const { game } = scenario(); const c = createCampaign(); const m = c.missions[0]!;
  m.state = game.serializeState(); m.objective = { type: "survive", rounds: 5 };
  const save = createCampaignSave(c, 0); save.state.turn = 5; save.state.mission!.completedRounds = 2;
  const restored = parseCampaignSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.state.mission, save.state.mission);
  assert.equal(isPlausibleGameState(restored.state), true);
  const bad = clone(save); bad.state.mission!.completedRounds = -1;
  assert.equal(isPlausibleGameState(bad.state), false); assert.throws(() => parseCampaignSave(bad));
  const mismatch = clone(save); mismatch.state.mission!.objective = { type: "eliminate-all" };
  assert.throws(() => parseCampaignSave(mismatch));
  const legacy = clone(save); delete legacy.state.mission;
  assert.equal(parseCampaignSave(legacy).state.mission!.completedRounds, 2);
});
