import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameCore } from "../src/core/gameCore";
import { axialDistance } from "../src/core/hexMath";
import { createSeededRng } from "../src/core/rng";
import { FieldType } from "../src/core/map/fieldTypes";
import { AiSystem } from "../src/core/systems/aiSystem";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { MovementSystem } from "../src/core/systems/movementSystem";
import { Unit } from "../src/core/units/unit";
import { UnitType } from "../src/core/units/unitType";
import type { GameState, PlayerId } from "../src/core/types";
import { playGame, runAiTurn } from "../tools/simulation";

describe("seeded random numbers", () => {
  it("repeats the same sequence for the same seed", () => {
    const first = createSeededRng(42);
    const second = createSeededRng(42);
    for (let i = 0; i < 100; i++) {
      assert.equal(first(), second());
    }
  });

  it("differs between seeds and stays within [0, 1)", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    let differs = false;
    for (let i = 0; i < 100; i++) {
      const x = a();
      assert.ok(x >= 0 && x < 1);
      if (x !== b()) differs = true;
    }
    assert.ok(differs);
  });
});

describe("combat estimate", () => {
  const combat = new CombatSystem();

  it("gives a ranged attacker no counter damage outside the defender's range", () => {
    const artillery = new Unit(UnitType.Artillery, 0, 0, 1);
    const infantry = new Unit(UnitType.Infantry, 3, 0, 0);
    const outcome = combat.estimateOutcome(artillery, infantry, FieldType.Farmland, 3);
    assert.equal(outcome.damageAttacker, 0);
    assert.ok(outcome.damageDefender > 0);
  });

  it("gives counter damage in melee range", () => {
    const infantryA = new Unit(UnitType.Infantry, 0, 0, 1);
    const infantryB = new Unit(UnitType.Infantry, 1, 0, 0);
    const outcome = combat.estimateOutcome(infantryA, infantryB, FieldType.Farmland, 1);
    assert.ok(outcome.damageAttacker > 0);
  });

  it("reduces damage for a defender on a mountain", () => {
    const tank = new Unit(UnitType.Tank, 0, 0, 1);
    const infantry = new Unit(UnitType.Infantry, 2, 0, 0);
    const open = combat.estimateOutcome(tank, infantry, FieldType.Farmland, 2);
    const mountain = combat.estimateOutcome(tank, infantry, FieldType.Mountain, 2);
    assert.ok(mountain.damageDefender < open.damageDefender);
  });
});

describe("AI turn", () => {
  // Flat open field with both headquarters in the far corners and no money to buy units.
  function createScenario(units: (place: (col: number, row: number) => { q: number; r: number }) => Unit[]) {
    const rng = createSeededRng(7);
    const game = new GameCore(10, 10, rng);
    game.configureAi(null);
    const state = game.getState() as GameState;
    for (const tile of state.tiles) {
      tile.field = FieldType.Farmland;
      tile.hasRoad = false;
    }
    const place = (col: number, row: number) => {
      const tile = game.getTileByColRow(col, row)!;
      return { q: tile.q, r: tile.r };
    };
    const hq0 = place(9, 9);
    const hq1 = place(0, 9);
    state.units = [
      new Unit(UnitType.MilitaryBase, hq0.q, hq0.r, 0),
      new Unit(UnitType.MilitaryBase, hq1.q, hq1.r, 1),
      ...units(place),
    ];
    state.playerBalances = [0, 0];
    state.currentPlayer = 1;
    const ai = new AiSystem(new MovementSystem(), new CombatSystem(rng));
    ai.configure(1, 1);
    return { game, state, ai };
  }

  it("moves into range and attacks in the same turn", () => {
    let cavalry!: Unit;
    let infantry!: Unit;
    const { game, ai } = createScenario((place) => {
      const from = place(2, 4);
      const target = place(6, 4);
      cavalry = new Unit(UnitType.Cavalry, from.q, from.r, 1);
      infantry = new Unit(UnitType.Infantry, target.q, target.r, 0);
      return [cavalry, infantry];
    });
    const start = { q: cavalry.q, r: cavalry.r };
    assert.ok(axialDistance(start, infantry) > cavalry.attackRange);

    const previews = runAiTurn(game, ai);

    const attack = previews.find((entry) => entry.attacker.type === UnitType.Cavalry);
    assert.ok(attack, "cavalry should attack");
    assert.deepEqual(attack.preview.defenderPos, { q: infantry.q, r: infantry.r });
    assert.deepEqual(attack.preview.attackerPos, { q: cavalry.q, r: cavalry.r });
    assert.notDeepEqual({ q: cavalry.q, r: cavalry.r }, start);
    assert.equal(axialDistance(cavalry, infantry), 1);
    assert.equal(cavalry.acted, false, "the attack is applied later through the combat dialog");
  });

  it("keeps artillery out of the defender's counter range", () => {
    let artillery!: Unit;
    const { game, ai } = createScenario((place) => {
      const from = place(3, 4);
      const target = place(6, 4);
      artillery = new Unit(UnitType.Artillery, from.q, from.r, 1);
      const infantry = new Unit(UnitType.Infantry, target.q, target.r, 0);
      return [artillery, infantry];
    });

    const previews = runAiTurn(game, ai);

    const attack = previews.find((entry) => entry.attacker.type === UnitType.Artillery);
    assert.ok(attack, "artillery should attack");
    assert.equal(attack.preview.defenderCanCounter, false);
    assert.equal(attack.preview.damageAttacker, 0);
  });

  it("does not attack when no enemy can be reached", () => {
    const { game, ai } = createScenario((place) => {
      const from = place(0, 0);
      const far = place(9, 0);
      return [new Unit(UnitType.Infantry, from.q, from.r, 1), new Unit(UnitType.Infantry, far.q, far.r, 0)];
    });
    assert.deepEqual(runAiTurn(game, ai), []);
  });

  it("assigns focus fire without wasting attacks on a unit that is already destroyed", () => {
    const attackers: Unit[] = [];
    let victim!: Unit;
    const { game, ai } = createScenario((place) => {
      const target = place(5, 4);
      victim = new Unit(UnitType.Infantry, target.q, target.r, 0);
      victim.hp = 5;
      const spots = [place(5, 6), place(6, 6), place(4, 6)];
      for (const spot of spots) {
        attackers.push(new Unit(UnitType.Tank, spot.q, spot.r, 1));
      }
      return [victim, ...attackers];
    });

    const previews = runAiTurn(game, ai);
    const onVictim = previews.filter(
      (entry) => entry.preview.defenderPos.q === victim.q && entry.preview.defenderPos.r === victim.r
    );
    assert.equal(onVictim.length, 1, "one attack is enough for a nearly dead unit");
  });
});

describe("simulation", () => {
  const config = { seed: 3, width: 12, height: 10, maxTurns: 80, incomeMultiplier: [1, 1] as [number, number] };

  it("plays the same game twice for the same seed", () => {
    const first = playGame(config);
    const second = playGame(config);
    assert.equal(first.winner, second.winner);
    assert.equal(first.turns, second.turns);
  });

  it("finishes within the turn limit", () => {
    const result = playGame(config);
    assert.ok(result.turns <= config.maxTurns);
    assert.ok(result.winner === null || result.winner === (0 as PlayerId) || result.winner === (1 as PlayerId));
  });
});
