import assert from "node:assert/strict";
import { test } from "node:test";
import { GameCore } from "../src/core/gameCore";
import { Unit } from "../src/core/units/unit";
import { UnitType } from "../src/core/units/unitType";
import type { GameState } from "../src/core/types";
import { FieldType, getTileDefense } from "../src/core/map/fieldTypes";
import { createSeededRng } from "../src/core/rng";
import { MovementSystem } from "../src/core/systems/movementSystem";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { parseMapDocument } from "../src/core/map/mapSerializer";
import { isPlausibleGameState } from "../src/net/stateGuard";
import { createMission, parseMission } from "../src/core/campaigns/documents";

function scenario(balance = 100) {
  const game = new GameCore(10, 10, createSeededRng(8)); game.configureAi(null);
  const state = game.getState() as GameState;
  state.tiles.forEach(t => { t.field = FieldType.Farmland; t.hasRoad = false; });
  const home = game.getTileByColRow(4, 4)!;
  const target = game.getTileByColRow(5, 4)!;
  const engineer = new Unit(UnitType.Engineer, home.q, home.r, 0);
  state.units = [engineer]; state.currentPlayer = 0; state.playerBalances = [balance, 0];
  game.selectHex(engineer);
  return { game, state, engineer, target };
}

for (const type of ["road", "trench"] as const) {
  test(`${type} is built only after confirmation, at the original cost and action consumption`, () => {
    const { game, engineer, target } = scenario();
    const request = game.selectHex(target);
    assert.equal(request.kind, "engineer-build");
    if (request.kind !== "engineer-build") return;
    assert.deepEqual(request.options, ["road", "trench"]);
    assert.equal(game.getBalance(0), 100); assert.equal(engineer.acted, false);
    assert.equal(target.hasRoad, false); assert.equal(!!target.hasTrench, false);
    assert.equal(game.buildEngineerStructure(engineer, target, type), true);
    assert.equal(game.getBalance(0), 80); assert.equal(engineer.acted, true);
    assert.equal(target.hasRoad, type === "road"); assert.equal(!!target.hasTrench, type === "trench");
    assert.equal(game.buildEngineerStructure(engineer, target, type), false);
    assert.equal(game.getBalance(0), 80);
  });
}

test("dismissing the build request leaves the engineer and funds available", () => {
  const { game, state, engineer, target } = scenario();
  assert.equal(game.selectHex(target).kind, "engineer-build");
  assert.equal(state.selectedUnit, engineer);
  assert.equal(game.getBalance(0), 100); assert.equal(engineer.acted, false);
  assert.equal(game.selectHex(target).kind, "engineer-build");
  assert.equal(game.buildEngineerStructure(engineer, target, "trench"), true);
});

for (const existing of ["road", "trench"] as const) {
  test(`an existing ${existing} blocks both build options and can be demolished for free`, () => {
    const { game, state, engineer, target } = scenario(0);
    if (existing === "road") target.hasRoad = true;
    else target.hasTrench = true;
    const demolition = existing === "road" ? "demolish-road" : "demolish-trench";
    assert.deepEqual(game.getEngineerBuildOptions(engineer, target), []);
    const request = game.selectHex(target);
    assert.equal(request.kind, "engineer-build");
    if (request.kind === "engineer-build") assert.deepEqual(request.options, [demolition]);
    assert.equal(game.buildEngineerStructure(engineer, target, "road"), false);
    assert.equal(game.buildEngineerStructure(engineer, target, "trench"), false);
    const combat = new CombatSystem(); const key = MovementSystem.key(target.q, target.r);
    assert.equal(combat.computeEngineerRoadOverlay(state, engineer)[key], undefined);
    assert.equal(combat.computeEngineerBuildOverlay(state, engineer)[key], undefined);
    assert.equal(combat.computeEngineerActionOverlay(state, engineer)[key], true);
    assert.equal(game.performEngineerAction(engineer, target, demolition), true);
    assert.equal(!!target.hasRoad, false); assert.equal(!!target.hasTrench, false);
    assert.equal(game.getBalance(0), 0); assert.equal(engineer.acted, true);
    assert.equal(game.performEngineerAction(engineer, target, demolition), false);
    // Demolition consumes this turn's action; the other type can be built next turn.
    engineer.resetForNewTurn(); game.selectHex(engineer); game.addBalance(0, 20);
    assert.equal(game.buildEngineerStructure(engineer, target, existing === "road" ? "trench" : "road"), true);
    assert.equal(target.hasRoad, existing !== "road");
    assert.equal(!!target.hasTrench, existing === "road");
    assert.equal(game.getBalance(0), 0);
  });
}

test("the engineer can demolish a structure underneath itself", () => {
  const { game, engineer } = scenario(0);
  const tile = game.getTile(engineer)!; tile.hasTrench = true;
  const request = game.selectHex(engineer);
  assert.equal(request.kind, "engineer-build");
  if (request.kind === "engineer-build") assert.deepEqual(request.options, ["demolish-trench"]);
  assert.equal(game.performEngineerAction(engineer, tile, "demolish-trench"), true);
  assert.equal(tile.hasTrench, false); assert.equal(game.getBalance(0), 0);
});

test("demolition rejects occupied, distant or empty targets and revalidates changed structures", () => {
  const { game, state, engineer, target } = scenario();
  assert.equal(game.performEngineerAction(engineer, target, "demolish-road"), false);
  target.hasRoad = true;
  const other = new Unit(UnitType.Infantry, target.q, target.r, 1); state.units.push(other);
  assert.equal(game.performEngineerAction(engineer, target, "demolish-road"), false);
  state.units.pop();
  const distant = game.getTileByColRow(8, 4)!; distant.hasTrench = true;
  assert.equal(game.performEngineerAction(engineer, distant, "demolish-trench"), false);
  game.selectHex(target); target.hasRoad = false;
  assert.equal(game.performEngineerAction(engineer, target, "demolish-road"), false);
  assert.equal(engineer.acted, false); assert.equal(game.getBalance(0), 100);
});

test("legacy tiles containing both structures can be cleared one structure per action", () => {
  const { game, engineer, target } = scenario(0);
  target.hasRoad = true; target.hasTrench = true;
  assert.deepEqual(game.getEngineerActions(engineer, target), ["demolish-road", "demolish-trench"]);
  assert.equal(game.performEngineerAction(engineer, target, "demolish-road"), true);
  assert.equal(target.hasRoad, false); assert.equal(target.hasTrench, true);
  engineer.resetForNewTurn(); game.selectHex(engineer);
  assert.deepEqual(game.getEngineerActions(engineer, target), ["demolish-trench"]);
  assert.equal(game.performEngineerAction(engineer, target, "demolish-trench"), true);
  assert.equal(game.getBalance(0), 0);
  const saved = game.serializeState(); const restored = new GameCore(10, 10); restored.loadState(saved);
  assert.equal(restored.getTile(target)!.hasRoad, false); assert.equal(restored.getTile(target)!.hasTrench, false);
});

test("construction rejects water, occupied tiles, distant tiles and insufficient funds", () => {
  const { game, state, engineer, target } = scenario(19);
  assert.equal(game.buildEngineerStructure(engineer, target, "trench"), false);
  game.addBalance(0, 100);
  target.field = FieldType.Ocean;
  assert.deepEqual(game.getEngineerBuildOptions(engineer, target), []);
  target.field = FieldType.Farmland;
  const occupant = new Unit(UnitType.Infantry, target.q, target.r, 0); state.units.push(occupant);
  assert.equal(game.buildEngineerStructure(engineer, target, "trench"), false);
  state.units.pop();
  assert.equal(game.buildEngineerStructure(engineer, game.getTileByColRow(8, 4)!, "trench"), false);
  assert.equal(engineer.acted, false); assert.equal(game.getBalance(0), 119);
});

test("confirmation revalidates the selected engineer and the target before charging", () => {
  const { game, state, engineer, target } = scenario();
  game.selectHex(target);
  const other = new Unit(UnitType.Engineer, engineer.q, engineer.r, 0);
  assert.equal(game.buildEngineerStructure(other, target, "trench"), false);
  state.currentPlayer = 1;
  assert.equal(game.buildEngineerStructure(engineer, target, "trench"), false);
  state.currentPlayer = 0; engineer.acted = true;
  assert.equal(game.buildEngineerStructure(engineer, target, "trench"), false);
  assert.equal(game.getBalance(0), 100); assert.equal(!!target.hasTrench, false);
});

test("trenches survive saved games, campaign files and map export; older maps remain valid", () => {
  const { game, target, engineer } = scenario();
  game.buildEngineerStructure(engineer, target, "trench");
  const saved = game.serializeState(); const restored = new GameCore(10, 10);
  restored.loadState(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.getTile(target)!.hasTrench, true);
  const mission = createMission(10, 10); mission.state = saved;
  assert.equal(parseMission(mission).state.tiles.find(t => t.q === target.q && t.r === target.r)!.hasTrench, true);
  const map = { format: "hexagon-map", version: 1, name: "Trenches", width: 10, height: 10, tiles: saved.tiles };
  assert.equal(parseMapDocument(map).tiles.find(t => t.q === target.q && t.r === target.r)!.hasTrench, true);
  const old = JSON.parse(JSON.stringify(map)); old.tiles.forEach((t: { hasTrench?: boolean }) => { delete t.hasTrench; });
  assert.doesNotThrow(() => parseMapDocument(old));
  assert.equal(isPlausibleGameState(saved), true);
  const invalid = JSON.parse(JSON.stringify(saved)); invalid.tiles[0].hasTrench = "yes";
  assert.equal(isPlausibleGameState(invalid), false);
  assert.throws(() => parseMapDocument({ ...map, tiles: invalid.tiles }));
});

test("trenches cost exactly three movement points and replace terrain defense with 100", () => {
  const { game, target } = scenario();
  const movement = new MovementSystem();
  for (const field of Object.values(FieldType)) {
    target.field = field; target.hasTrench = true;
    assert.equal(movement.getMovementCost(target), 3);
    assert.equal(getTileDefense(target), 100);
  }
  // Old mixed road/trench saves must not accidentally halve trench costs.
  target.hasRoad = true;
  assert.equal(movement.getMovementCost(game.getTile(target)!), 3);
});

test("combat preview and AI damage estimates use trench defense instead of the underlying terrain bonus", () => {
  const { game, state, target } = scenario();
  const attacker = new Unit(UnitType.Tank, target.q - 1, target.r, 1);
  const defender = new Unit(UnitType.Infantry, target.q, target.r, 0);
  const combat = new CombatSystem(() => 0.5);
  const plainPreview = combat.computePreview(state, attacker, defender, pos => game.getTile(pos));
  const plainEstimate = combat.estimateOutcome(attacker, defender, target, 1);
  target.hasTrench = true;
  for (const field of [FieldType.Farmland, FieldType.Mountain, FieldType.City]) {
    target.field = field;
    const preview = combat.computePreview(state, attacker, defender, pos => game.getTile(pos));
    assert.equal(preview.defenseBase, defender.defense + 100);
    assert.ok(preview.damageDefender < plainPreview.damageDefender);
    assert.ok(combat.estimateOutcome(attacker, defender, target, 1).damageDefender < plainEstimate.damageDefender);
  }
});

test("reachability charges three points, chooses cheaper detours, and demolition restores normal cost", () => {
  const { game, state, engineer, target } = scenario();
  const movement = new MovementSystem();
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const neighbors = (q: number, r: number) => directions.map(([dq, dr]) => game.getTile({ q: q + dq!, r: r + dr! })).filter((t): t is NonNullable<typeof t> => !!t);
  target.hasTrench = true;
  engineer.remainingMovement = 2;
  assert.equal(movement.computeReachableTiles(state, engineer, neighbors)[MovementSystem.key(target.q, target.r)], undefined);
  engineer.remainingMovement = 3;
  assert.equal(movement.computeReachableTiles(state, engineer, neighbors)[MovementSystem.key(target.q, target.r)], 3);
  const beyond = game.getTile({ q: target.q + 1, r: target.r })!;
  const path = movement.computePathToTarget(state, engineer, beyond, neighbors, { maxCost: 3 });
  assert.ok(path); assert.equal(path.some(p => p.q === target.q && p.r === target.r), false);
  assert.equal(game.performEngineerAction(engineer, target, "demolish-trench"), true);
  assert.equal(movement.getMovementCost(target), 1);
});
