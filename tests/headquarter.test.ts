import assert from "node:assert/strict";
import { test } from "node:test";
import { GameCore } from "../src/core/gameCore";
import type { GameState } from "../src/core/types";
import { Unit } from "../src/core/units/unit";
import { UnitType, UNIT_TYPES, isHeadquarter } from "../src/core/units/unitType";
import { createSeededRng } from "../src/core/rng";
import { createMission, missionIssues } from "../src/core/campaigns/documents";
import { isPlausibleGameState } from "../src/net/stateGuard";
import { AiSystem } from "../src/core/systems/aiSystem";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { MovementSystem } from "../src/core/systems/movementSystem";
import { runAiTurn } from "../tools/simulation";

function scenario(balance = 500) {
  const game = new GameCore(10, 10, createSeededRng(8));
  game.configureAi(null);
  const state = game.getState() as GameState;
  state.playerBalances = [balance, balance];
  const hq = state.units.find(u => u.owner === 0 && u.type === UnitType.MilitaryBase)!;
  return { game, state, hq };
}

test("fortified HQ replaces the basic HQ in place for 400, preserving health and experience", () => {
  const { game, state, hq } = scenario();
  hq.hp = 65; hq.maxHP = 120; hq.experience = 3;
  const count = state.units.length;
  assert.equal(game.beginPurchase(hq, UnitType.MilitaryBaseFortified), true);
  const fortified = game.getUnitAt(hq)!;
  assert.equal(fortified.type, UnitType.MilitaryBaseFortified);
  assert.equal(fortified.defense, 200); assert.equal(fortified.hp, 65); assert.equal(fortified.maxHP, 120);
  assert.equal(fortified.experience, 3); assert.equal(fortified.owner, 0);
  assert.equal(fortified.data.spriteKey, "militarybaseFortified");
  assert.equal(fortified.data.price, 400); assert.equal(fortified.remainingMovement, 0);
  assert.equal(state.units.length, count); assert.equal(state.units.includes(hq), false);
  assert.equal(game.getBalance(0), 100); assert.deepEqual(state.reachableTiles, {});
  assert.equal(game.selectHex(fortified).kind, "headquarter");
});

test("upgrade cannot be bought twice, with insufficient money, from another player's HQ or a stale unit", () => {
  const { game, state, hq } = scenario(399);
  assert.equal(game.beginPurchase(hq, UnitType.MilitaryBaseFortified), false);
  assert.equal(game.getUnitAt(hq), hq); assert.equal(game.getBalance(0), 399);
  game.addBalance(0, 601);
  const enemy = state.units.find(u => u.owner === 1 && isHeadquarter(u.type))!;
  assert.equal(game.beginPurchase(enemy, UnitType.MilitaryBaseFortified), false);
  assert.equal(game.beginPurchase(hq, UnitType.MilitaryBaseFortified), true);
  const fortified = game.getUnitAt(hq)!;
  assert.equal(game.beginPurchase(fortified, UnitType.MilitaryBaseFortified), false);
  assert.equal(game.beginPurchase(hq, UnitType.MilitaryBaseFortified), false);
  assert.equal(game.getBalance(0), 600);
});

test("fortified HQ can still purchase and place ordinary troops", () => {
  const { game, state, hq } = scenario(1000);
  game.beginPurchase(hq, UnitType.MilitaryBaseFortified);
  const fortified = game.getUnitAt(hq)!;
  assert.equal(game.beginPurchase(fortified, UnitType.MilitaryBase), false);
  assert.equal(game.beginPurchase(fortified, UnitType.Infantry), true);
  const key = Object.keys(state.reachableTiles)[0]!;
  assert.ok(key);
  const [q, r] = key.split(",").map(Number);
  game.selectHex({ q: q!, r: r! });
  assert.equal(game.getUnitAt({ q: q!, r: r! })?.type, UnitType.Infantry);
  assert.equal(game.getBalance(0), 1000 - 400 - UNIT_TYPES[UnitType.Infantry].price);
});

test("fortified HQ is supported by save games, online validation and campaign mission validation", () => {
  const { game, hq } = scenario(); game.beginPurchase(hq, UnitType.MilitaryBaseFortified);
  const saved = game.serializeState(); assert.equal(isPlausibleGameState(saved), true);
  const restored = new GameCore(10, 10); restored.loadState(saved);
  assert.equal(restored.getUnitAt(hq)?.type, UnitType.MilitaryBaseFortified);
  assert.equal(restored.getUnitAt(hq)?.defense, 200);
  const mission = createMission(10, 10); mission.state = saved;
  assert.deepEqual(missionIssues(mission), []);
});

test("another surviving fortified HQ prevents premature defeat, and destroying the last HQ ends the game", () => {
  const { game, state, hq } = scenario(); game.beginPurchase(hq, UnitType.MilitaryBaseFortified);
  const second = state.tiles.find(t => !state.units.some(u => u.q === t.q && u.r === t.r))!;
  const basic = new Unit(UnitType.MilitaryBase, second.q, second.r, 0); state.units.push(basic);
  const attacker = state.units.find(u => u.owner === 1 && !isHeadquarter(u.type))!;
  const combat = new CombatSystem(() => 0.5);
  const destroy = (target: Unit) => {
    attacker.resetForNewTurn();
    const preview = combat.computePreview(state, attacker, target, pos => game.getTile(pos));
    preview.damageDefender = 10000; preview.damageAttacker = 0;
    game.applyCombat(preview);
  };
  destroy(basic); assert.equal(state.gameOver, false);
  destroy(game.getUnitAt(hq)!); assert.equal(state.gameOver, true); assert.equal(state.winner, 1);
});

test("AI recognizes a fortified headquarters and can buy troops there", () => {
  const { game, state } = scenario(1000);
  const basic = state.units.find(u => u.owner === 1 && isHeadquarter(u.type))!;
  state.units[state.units.indexOf(basic)] = new Unit(UnitType.MilitaryBaseFortified, basic.q, basic.r, 1);
  state.currentPlayer = 1;
  const before = state.units.length;
  const ai = new AiSystem(new MovementSystem(), new CombatSystem(() => 0.5), () => 0.5);
  ai.configure(1);
  runAiTurn(game, ai);
  assert.ok(state.units.length > before);
  assert.ok(state.playerBalances[1]! < 1000);
  assert.equal(game.getUnitAt(basic)?.type, UnitType.MilitaryBaseFortified);
});
