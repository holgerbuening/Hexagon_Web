import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameCore } from "../src/core/gameCore";
import { axialDistance } from "../src/core/hexMath";
import { createSeededRng } from "../src/core/rng";
import { FieldType } from "../src/core/map/fieldTypes";
import { AiSystem, aiProfiles, type AiProfile } from "../src/core/systems/aiSystem";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { MovementSystem } from "../src/core/systems/movementSystem";
import { Unit } from "../src/core/units/unit";
import { UnitType } from "../src/core/units/unitType";
import type { GameState, PlayerId } from "../src/core/types";
import { playGame, runAiTurn, runBatch } from "../tools/simulation";

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
  function createScenario(
    units: (place: (col: number, row: number) => { q: number; r: number }) => Unit[],
    balance = 0,
    profile: AiProfile = aiProfiles.normal
  ) {
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
    state.playerBalances = [0, balance];
    state.currentPlayer = 1;
    const ai = new AiSystem(new MovementSystem(), new CombatSystem(rng), rng);
    ai.configure(1, profile);
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

  describe("capturing cities and industry", () => {
    for (const field of [FieldType.City, FieldType.Industry]) {
      it(`captures reachable ${field} before pursuing an attack`, () => {
        let infantry!: Unit;
        const { game, ai } = createScenario(place => {
          const from = place(2, 4); const enemy = place(6, 4);
          infantry = new Unit(UnitType.Infantry, from.q, from.r, 1);
          return [infantry, new Unit(UnitType.Tank, enemy.q, enemy.r, 0)];
        });
        const target = game.getTileByColRow(3, 4)!; target.field = field;
        runAiTurn(game, ai);
        assert.deepEqual({ q: infantry.q, r: infantry.r }, { q: target.q, r: target.r });
        assert.ok(infantry.animationPath.length > 0);
      });
    }

    it("does not let idle chance or a distant cavalry prevent a capture", () => {
      let infantry!: Unit;
      const { game, ai } = createScenario(place => {
        const from = place(2, 1); const far = place(9, 8);
        infantry = new Unit(UnitType.Infantry, from.q, from.r, 1);
        return [infantry, new Unit(UnitType.Cavalry, far.q, far.r, 1)];
      }, 0, { ...aiProfiles.easy, idleChance: 1 });
      const target = game.getTileByColRow(3, 1)!; target.field = FieldType.Industry;
      runAiTurn(game, ai);
      assert.deepEqual({ q: infantry.q, r: infantry.r }, { q: target.q, r: target.r });
    });

    it("captures a reachable industry rather than pursuing an unreachable nearby city", () => {
      let infantry!: Unit;
      const { game, ai } = createScenario(place => {
        const from = place(3, 4); infantry = new Unit(UnitType.Infantry, from.q, from.r, 1); return [infantry];
      });
      const city = game.getTileByColRow(3, 2)!; city.field = FieldType.City;
      for (const tile of game.getState().tiles) {
        if (axialDistance(tile, city) === 1) tile.field = FieldType.Ocean;
      }
      const industry = game.getTileByColRow(6, 4)!; industry.field = FieldType.Industry;
      runAiTurn(game, ai);
      assert.deepEqual({ q: infantry.q, r: infantry.r }, { q: industry.q, r: industry.r });
    });

    for (const type of [UnitType.Infantry, UnitType.Medic, UnitType.Engineer]) {
      it(`lets ${type} take reachable income instead of its usual movement or retreat`, () => {
        let unit!: Unit;
        const { game, ai } = createScenario(place => {
          const from = place(2, 4); unit = new Unit(type, from.q, from.r, 1); unit.hp = 5;
          const medic = place(0, 4);
          return [unit, new Unit(UnitType.Medic, medic.q, medic.r, 1)];
        });
        const target = game.getTileByColRow(3, 4)!; target.field = FieldType.Industry;
        runAiTurn(game, ai);
        assert.deepEqual({ q: unit.q, r: unit.r }, { q: target.q, r: target.r });
      });
    }

    for (const type of [UnitType.Infantry, UnitType.Medic, UnitType.Engineer]) {
      it(`keeps ${type} on an income tile instead of leaving to retreat or perform support tasks`, () => {
        let garrison!: Unit;
        const { game, ai } = createScenario(place => {
          const home = place(2, 4); const injured = place(7, 4); const medic = place(0, 4);
          garrison = new Unit(type, home.q, home.r, 1); garrison.hp = 5;
          const ally = new Unit(UnitType.Infantry, injured.q, injured.r, 1); ally.hp = 5;
          return [garrison, ally, new Unit(UnitType.Medic, medic.q, medic.r, 1)];
        });
        const home = game.getTile(garrison)!; home.field = FieldType.Industry;
        runAiTurn(game, ai);
        assert.deepEqual({ q: garrison.q, r: garrison.r }, { q: home.q, r: home.r });
      });
    }

    it("keeps existing garrisons and sends other units to distinct free holdings", () => {
      let garrison!: Unit; const troops: Unit[] = [];
      const { game, ai } = createScenario(place => {
        const home = place(2, 4); garrison = new Unit(UnitType.Infantry, home.q, home.r, 1);
        for (const col of [3, 4]) { const pos = place(col, 5); troops.push(new Unit(UnitType.Infantry, pos.q, pos.r, 1)); }
        return [garrison, ...troops];
      });
      const home = game.getTile(garrison)!; home.field = FieldType.City;
      const targets = [game.getTileByColRow(3, 4)!, game.getTileByColRow(4, 4)!];
      targets.forEach(t => { t.field = FieldType.Industry; });
      runAiTurn(game, ai);
      assert.deepEqual({ q: garrison.q, r: garrison.r }, { q: home.q, r: home.r });
      for (const target of targets) assert.ok(troops.some(u => u.q === target.q && u.r === target.r));
    });
  });

  describe("difficulty profiles", () => {
    const advance = (profile: AiProfile) => {
      let walker!: Unit;
      const { game, ai } = createScenario((place) => {
        const from = place(0, 0);
        const far = place(9, 0);
        walker = new Unit(UnitType.Infantry, from.q, from.r, 1);
        return [walker, new Unit(UnitType.Infantry, far.q, far.r, 0)];
      }, 0, profile);
      const start = { q: walker.q, r: walker.r };
      runAiTurn(game, ai);
      return axialDistance(start, walker);
    };

    it("advances with the normal profile", () => {
      assert.ok(advance(aiProfiles.normal) > 0);
    });

    it("stays put when the profile always idles", () => {
      assert.equal(advance({ ...aiProfiles.easy, idleChance: 1 }), 0);
    });

    it("makes weaker play out of easy than normal", () => {
      assert.ok(aiProfiles.easy.mistakeChance > aiProfiles.normal.mistakeChance);
      assert.ok(aiProfiles.easy.idleChance > aiProfiles.normal.idleChance);
      assert.ok(aiProfiles.hard.incomeMultiplier > aiProfiles.normal.incomeMultiplier);
    });
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

  const ownUnits = (state: GameState, ...types: UnitType[]) =>
    state.units.filter((unit) => unit.owner === 1 && types.includes(unit.type));

  it("buys several units in one turn but no engineer with a small army", () => {
    const { game, state, ai } = createScenario((place) => {
      const far = place(9, 0);
      return [new Unit(UnitType.Infantry, far.q, far.r, 0)];
    }, 1000);

    runAiTurn(game, ai);

    const bought = ownUnits(state, UnitType.Infantry, UnitType.MachnineGun, UnitType.Artillery, UnitType.Cavalry, UnitType.Tank);
    assert.ok(bought.length >= 2, "should spend the money on more than one unit");
    assert.equal(ownUnits(state, UnitType.Engineer).length, 0);
  });

  describe("headquarter upgrades", () => {
    const build = (balance = 600, armySize = 3, nearby = true, overrides: Partial<AiProfile> = {}) => {
      const scenario = createScenario(place => {
        const enemy = nearby ? place(2, 8) : place(9, 0);
        const units = [new Unit(UnitType.Infantry, enemy.q, enemy.r, 0)];
        for (let i = 0; i < armySize; i++) {
          const pos = place(3 + i, 6);
          units.push(new Unit(UnitType.Infantry, pos.q, pos.r, 1));
        }
        return units;
      }, balance, { ...aiProfiles.normal, hqUpgradeMinArmy: 3, hqUpgradeReserve: 150,
        hqUpgradeThreatDistance: 8, hqUpgradeSavingTurns: 1, ...overrides });
      const hq = scenario.state.units.find(u => u.owner === 1 && u.type === UnitType.MilitaryBase)!;
      return { ...scenario, hq };
    };

    it("the default policy invests only after funding six troops and a 400 reserve", () => {
      const parameters = {
        hqUpgradeMinArmy: aiProfiles.normal.hqUpgradeMinArmy,
        hqUpgradeReserve: aiProfiles.normal.hqUpgradeReserve,
        hqUpgradeThreatDistance: aiProfiles.normal.hqUpgradeThreatDistance,
        hqUpgradeSavingTurns: aiProfiles.normal.hqUpgradeSavingTurns,
      };
      assert.deepEqual(parameters, { hqUpgradeMinArmy: 6, hqUpgradeReserve: 400, hqUpgradeThreatDistance: 100, hqUpgradeSavingTurns: 0 });
      const ready = build(650, 6, false, parameters);
      runAiTurn(ready.game, ready.ai);
      assert.equal(ready.game.getUnitAt(ready.hq)!.type, UnitType.MilitaryBaseFortified);
      const early = build(650, 3, true, parameters);
      runAiTurn(early.game, early.ai);
      assert.equal(early.game.getUnitAt(early.hq)!.type, UnitType.MilitaryBase);
      const short = build(649, 6, false, parameters);
      runAiTurn(short.game, short.ai);
      assert.equal(short.game.getUnitAt(short.hq)!.type, UnitType.MilitaryBase);
      assert.ok(short.game.getBalance(1) < 649);
    });

    it("supports an early upgrade for exactly 250 without an army or cash reserve", () => {
      const { game, ai, hq } = build(250, 0, true, { hqUpgradeMinArmy: 0, hqUpgradeReserve: 0,
        hqUpgradeThreatDistance: 100, hqUpgradeSavingTurns: 2 });
      runAiTurn(game, ai);
      assert.equal(game.getUnitAt(hq)!.type, UnitType.MilitaryBaseFortified);
      assert.equal(game.getBalance(1), 0);
    });

    it("limits early-upgrade saving to two income turns instead of blocking troop purchases indefinitely", () => {
      const early = { hqUpgradeMinArmy: 0, hqUpgradeReserve: 0, hqUpgradeThreatDistance: 100, hqUpgradeSavingTurns: 2 };
      const saving = build(230, 0, true, early);
      runAiTurn(saving.game, saving.ai);
      assert.equal(saving.game.getBalance(1), 230);
      saving.game.addBalance(1, 15); runAiTurn(saving.game, saving.ai);
      assert.equal(saving.game.getBalance(1), 245);
      saving.game.addBalance(1, 15); runAiTurn(saving.game, saving.ai);
      assert.equal(saving.game.getUnitAt(saving.hq)!.type, UnitType.MilitaryBaseFortified);
      const poor = build(150, 0, true, early);
      runAiTurn(poor.game, poor.ai);
      assert.equal(poor.game.getUnitAt(poor.hq)!.type, UnitType.MilitaryBase);
      assert.ok(poor.game.getBalance(1) < 150);
    });

    it("fortifies a threatened HQ once the army and reserve are funded, without repairing damage", () => {
      const { game, state, ai, hq } = build(); hq.hp = 65; hq.experience = 2;
      const existing = new Set(state.units);
      runAiTurn(game, ai);
      const fortified = game.getUnitAt(hq)!;
      assert.equal(fortified.type, UnitType.MilitaryBaseFortified);
      assert.equal(fortified.defense, 200); assert.equal(fortified.hp, 65); assert.equal(fortified.experience, 2);
      assert.equal(ai.upgradedHeadquarters.length, 1);
      assert.deepEqual(ai.purchaseHeadquarters[0], { q: hq.q, r: hq.r });
      const troopsSpent = state.units.filter(u => u.owner === 1 && !existing.has(u) && u !== fortified).reduce((sum, u) => sum + u.data.price, 0);
      assert.equal(game.getBalance(1), 600 - 250 - troopsSpent);
      game.addBalance(1, 1000); runAiTurn(game, ai);
      assert.equal(ai.upgradedHeadquarters.length, 0);
    });

    for (const [label, balance, army, nearby, overrides] of [
      ["too little money", 249, 3, true, {}],
      ["too few combat troops", 600, 1, true, {}],
      ["no nearby threat", 600, 3, false, {}],
      ["upgrades disabled", 600, 3, true, { hqUpgradeEnabled: false }],
    ] as const) {
      it(`keeps buying troops instead of upgrading with ${label}`, () => {
        const { game, ai, hq } = build(balance, army, nearby, overrides);
        runAiTurn(game, ai);
        assert.equal(game.getUnitAt(hq)!.type, UnitType.MilitaryBase);
        assert.equal(ai.upgradedHeadquarters.length, 0);
        assert.ok(game.getBalance(1) < balance);
      });
    }

    it("does not downgrade a custom HQ whose defense is already stronger", () => {
      const { game, ai, hq } = build(); hq.defense = 250;
      runAiTurn(game, ai);
      assert.equal(game.getUnitAt(hq)!.type, UnitType.MilitaryBase);
      assert.equal(hq.defense, 250);
    });

    it("saves at most the configured income horizon and then upgrades", () => {
      const { game, state, ai, hq } = build(390);
      const count = state.units.length;
      runAiTurn(game, ai);
      assert.equal(game.getBalance(1), 390); assert.equal(state.units.length, count);
      game.addBalance(1, 15);
      runAiTurn(game, ai);
      assert.equal(game.getUnitAt(hq)!.type, UnitType.MilitaryBaseFortified);
    });

    it("still fortifies against ranged fire across water", () => {
      const { game, state, ai, hq } = build();
      const infantry = state.units.find(u => u.owner === 0 && u.type === UnitType.Infantry)!;
      state.units[state.units.indexOf(infantry)] = new Unit(UnitType.Artillery, infantry.q, infantry.r, 0);
      for (const tile of state.tiles) if (axialDistance(tile, hq) === 1) tile.field = FieldType.Ocean;
      runAiTurn(game, ai);
      assert.equal(game.getUnitAt(hq)!.type, UnitType.MilitaryBaseFortified);
    });

    it("ignores a melee threat isolated behind water", () => {
      const { game, state, ai, hq } = build();
      for (const tile of state.tiles) if (axialDistance(tile, hq) === 1) tile.field = FieldType.Ocean;
      runAiTurn(game, ai);
      assert.equal(game.getUnitAt(hq)!.type, UnitType.MilitaryBase);
    });
  });

  describe("saving up", () => {
    const build = (enemyCol: number, enemyRow: number) => {
      let city!: { q: number; r: number };
      const scenario = createScenario((place) => {
        city = place(1, 8);
        const enemy = place(enemyCol, enemyRow);
        return [
          new Unit(UnitType.Infantry, city.q, city.r, 1),
          new Unit(UnitType.Tank, enemy.q, enemy.r, 0),
        ];
      }, 300);
      // The infantry holds a city, which adds income for the next turns.
      scenario.game.getTile(city)!.field = FieldType.City;
      return scenario;
    };

    it("waits for a clearly better unit that is only a few turns away", () => {
      const { game, state, ai } = build(9, 0);
      runAiTurn(game, ai);
      assert.equal(ownUnits(state, UnitType.Infantry, UnitType.MachnineGun, UnitType.Artillery,
        UnitType.Cavalry, UnitType.Tank).length, 1);
      assert.equal(state.playerBalances[1], 300);
    });

    it("buys what it can afford when the headquarter is threatened", () => {
      const { game, state, ai } = build(3, 8);
      runAiTurn(game, ai);
      assert.ok(state.playerBalances[1]! < 300);
    });
  });
});

describe("income", () => {
  it("applies the income multiplier set for a player", () => {
    const base = new GameCore(10, 10, createSeededRng(11));
    base.configureAi(null);
    const boosted = new GameCore(10, 10, createSeededRng(11));
    boosted.configureAi(null);
    boosted.setIncomeMultiplier(0, 2);

    base.endTurn();
    boosted.endTurn();

    const gain = base.getBalance(0) - 50;
    assert.ok(gain > 0);
    assert.equal(boosted.getBalance(0) - 50, gain * 2);
  });
});

describe("simulation", () => {
  const config = {
    seed: 3,
    width: 12,
    height: 10,
    maxTurns: 80,
    profiles: [aiProfiles.hard, aiProfiles.easy] as [typeof aiProfiles.hard, typeof aiProfiles.easy],
  };

  it("plays the same game twice for the same seed", () => {
    const first = playGame(config);
    const second = playGame(config);
    assert.equal(first.winner, second.winner);
    assert.equal(first.turns, second.turns);
    assert.deepEqual(first.hqUpgrades, second.hqUpgrades);
    assert.deepEqual(first.firstHqUpgradeTurn, second.firstHqUpgradeTurn);
  });

  it("paired batches reuse each map seed with both starting sides and report upgrade telemetry", () => {
    const observed: [number, boolean][] = [];
    const result = runBatch({ games: 4, seed: 12, width: 10, height: 10, maxTurns: 30,
      profileA: aiProfiles.normal, profileB: { ...aiProfiles.normal, hqUpgradeEnabled: false }, paired: true },
      (_, game, side) => { observed.push([game.seed, side]); });
    assert.deepEqual(observed, [[12, true], [12, false], [13, true], [13, false]]);
    assert.equal(result.upgradesB, 0);
    assert.equal(result.averageFirstUpgradeTurnB, null);
    assert.equal(result.winsA + result.winsB + result.draws, 4);
  });

  it("finishes within the turn limit", () => {
    const result = playGame(config);
    assert.ok(result.turns <= config.maxTurns);
    assert.ok(result.winner === null || result.winner === (0 as PlayerId) || result.winner === (1 as PlayerId));
  });
});
