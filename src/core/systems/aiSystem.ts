import type { Axial, CombatPreviewEntry, GameState, HexTile, PlayerId } from "../types";
import { axialDistance } from "../hexMath";
import { FieldType, getFieldDef } from "../map/fieldTypes";
import { MovementSystem } from "./movementSystem";
import { CombatSystem } from "./combatSystem";
import { Unit } from "../units/unit";
import { UnitType, UNIT_TYPES } from "../units/unitType";
import type { Rng } from "../rng";

interface GetTile {
  (pos: Axial): HexTile | undefined;
}

interface GetNeighbors {
  (q: number, r: number): HexTile[];
}

interface GetUnitAt {
  (pos: Axial): Unit | undefined;
}

interface CanAfford {
  (player: PlayerId, cost: number): boolean;
}

interface Spend {
  (player: PlayerId, cost: number): boolean;
}

export type AiDifficulty = "easy" | "normal" | "hard";

/** How the AI plays. Difficulty levels differ in behavior, not only in income. */
export interface AiProfile {
  incomeMultiplier: number;
  /** Chance that an attack is picked at random from the acceptable ones instead of the best one. */
  mistakeChance: number;
  /** Chance that a unit does not advance this turn. */
  idleChance: number;
  /** Scales how much the AI avoids tiles where enemies can hit hard; 0 ignores the danger. */
  threatWeight: number;
  /** Plan attacks so that damage is not wasted on units that are already as good as destroyed. */
  focusFire: boolean;
  /** Counter the enemy army and save up instead of buying from a fixed list. */
  smartPurchase: boolean;
  /** Units below this share of their maximum HP leave the fight. */
  retreatHpRatio: number;
  /** Nearby units hunt enemies that come close to the own headquarter. */
  defendHeadquarter: boolean;
}

export const aiProfiles: Record<AiDifficulty, AiProfile> = {
  easy: {
    incomeMultiplier: 1,
    mistakeChance: 0.5,
    idleChance: 0.3,
    threatWeight: 0,
    focusFire: false,
    smartPurchase: false,
    retreatHpRatio: 0.15,
    defendHeadquarter: false,
  },
  normal: {
    incomeMultiplier: 1.5,
    mistakeChance: 0,
    idleChance: 0,
    threatWeight: 1,
    focusFire: true,
    smartPurchase: true,
    retreatHpRatio: 0.3,
    defendHeadquarter: false,
  },
  hard: {
    incomeMultiplier: 2.5,
    mistakeChance: 0,
    idleChance: 0,
    threatWeight: 1,
    focusFire: true,
    smartPurchase: true,
    retreatHpRatio: 0.3,
    defendHeadquarter: true,
  },
};

export class AiSystem {
  private static readonly ENGINEER_ROAD_COST = 20;
  private static readonly COMBAT_UNIT_TYPES: UnitType[] = [
    UnitType.Infantry,
    UnitType.MachnineGun,
    UnitType.Artillery,
    UnitType.Cavalry,
    UnitType.Tank,
  ];
  private static readonly COMBAT_UNITS_PER_MEDIC = 6;
  // Each unit of a type already owned lowers its appeal, so armies stay mixed.
  private static readonly OWN_TYPE_PENALTY = 0.15;
  // Enemies this close to a headquarter stop the AI from saving money and call for defenders.
  private static readonly HQ_DANGER_DISTANCE = 6;
  // Only units this close to their headquarter take part in its defense.
  private static readonly HQ_DEFENDER_DISTANCE = 10;
  private static readonly SAVING_HORIZON_TURNS = 3;
  private static readonly SAVING_SCORE_MARGIN = 0.1;
  // Roads are a luxury: an engineer is only bought with a decent army and money left over.
  private static readonly ENGINEER_MIN_ARMY = 6;
  private static readonly ENGINEER_RESERVE = 300;
  private movementSystem: MovementSystem;
  private combatSystem: CombatSystem;
  private readonly rng: Rng;
  private aiPlayer: PlayerId | null = 1;
  private profile: AiProfile = aiProfiles.normal;
  // Expected damage already assigned to enemy units in the current AI turn (focus fire, no overkill).
  private plannedDamage = new Map<Unit, number>();
  // Path cost to a target tile, cached per target because costs do not depend on the unit.
  private costFieldCache = new Map<string, Map<string, number>>();
  private tileIndex = new Map<string, HexTile>();
  private tileIndexSource: HexTile[] | null = null;

  constructor(movementSystem: MovementSystem, combatSystem: CombatSystem, rng: Rng = Math.random) {
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;
    this.rng = rng;
  }

  public configure(player: PlayerId | null, profile: AiProfile = aiProfiles.normal): void {
    this.aiPlayer = player;
    this.profile = profile;
  }

  public shouldRun(state: GameState): boolean {
    return this.aiPlayer !== null && state.currentPlayer === this.aiPlayer;
  }

  public getIncomeMultiplier(player: PlayerId): number {
    if (this.aiPlayer === null) return 1;
    if (this.aiPlayer !== player) return 1;
    return Math.max(1, this.profile.incomeMultiplier);
  }

  public runTurn(
    state: GameState,
    getTile: GetTile,
    getNeighbors: GetNeighbors,
    getUnitAt: GetUnitAt,
    canAfford: CanAfford,
    spend: Spend
    ): CombatPreviewEntry[] {
    if (!this.shouldRun(state)) return [];
    const combatPreviews: CombatPreviewEntry[] = [];
    const attackingUnits = new Set<Unit>();
    this.plannedDamage.clear();
    this.costFieldCache.clear();

    this.purchaseUnits(state, getNeighbors, getUnitAt, canAfford, spend);

    const hasUnoccupiedCitiesOrIndustries = this.hasUnoccupiedCityOrIndustry(state);
    const hasUnactedCavalry = this.hasUnactedCavalry(state, state.currentPlayer);
    const aiUnits = state.units.filter(function (unit) {
      return unit.owner === state.currentPlayer && unit.type !== UnitType.MilitaryBase;
    });

    if (hasUnoccupiedCitiesOrIndustries) {
      aiUnits.sort(function (left, right) {
        let leftPriority = 1;
        if (left.type === UnitType.Cavalry) {
          leftPriority = 0;
        }
        let rightPriority = 1;
        if (right.type === UnitType.Cavalry) {
          rightPriority = 0;
        }
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return left.q - right.q || left.r - right.r;
      });
    }

    for (const unit of aiUnits) {
      // Older saves may contain engineers without a road plan.
      if (unit.type === UnitType.Engineer && unit.roadBuildPath.length === 0) {
        unit.roadBuildPath = this.planEngineerRoadPath(state, unit, getNeighbors);
      }
      if (unit.acted) continue;

      if (unit.type === UnitType.Medic) {
        if (this.tryHeal(state, unit)) continue;
        this.tryMoveToInjured(state, unit, getNeighbors);
        continue;
      }
      
      if (unit.type === UnitType.Engineer) {
        const target = this.findEngineerTarget(state, unit);
        if (!target || !canAfford(unit.owner, AiSystem.ENGINEER_ROAD_COST)) continue;
        if (this.tryBuildEngineerRoad(state, unit, target, spend)) continue;
        if (this.tryMoveEngineer(state, unit, target, getNeighbors)) {
          this.tryBuildEngineerRoad(state, unit, target, spend);
          unit.acted = true;
        }
        continue;
      }

      if (unit.hp < unit.maxHP * this.profile.retreatHpRatio && this.tryRetreat(state, unit, getNeighbors)) continue;

      const preview = this.tryAttack(state, unit, getTile, getNeighbors);
      if (preview) {
        combatPreviews.push(preview);
        attackingUnits.add(unit);
        continue;
      }

      this.tryMove(state, unit, getNeighbors, hasUnoccupiedCitiesOrIndustries, hasUnactedCavalry, attackingUnits);
    }
    return combatPreviews;
  }

  private purchaseUnits(
    state: GameState,
    getNeighbors: GetNeighbors,
    getUnitAt: GetUnitAt,
    canAfford: CanAfford,
    spend: Spend
  ): void {
    if (this.aiPlayer === null || state.currentPlayer !== this.aiPlayer) return;
    if (this.profile.smartPurchase) {
      this.purchaseUnitsSmart(state, getNeighbors, getUnitAt, canAfford, spend);
    } else {
      this.purchaseUnitsBasic(state, getNeighbors, getUnitAt, canAfford, spend);
    }
  }

  private purchaseUnitsSmart(
    state: GameState,
    getNeighbors: GetNeighbors,
    getUnitAt: GetUnitAt,
    canAfford: CanAfford,
    spend: Spend
  ): void {
    const owner = state.currentPlayer;
    const headquarters = state.units.filter((unit) => unit.owner === owner && unit.type === UnitType.MilitaryBase);
    const income = this.estimateIncome(state, owner);
    const threatened = headquarters.some((hq) => state.units.some((enemy) =>
      enemy.owner !== owner && enemy.type !== UnitType.MilitaryBase &&
      axialDistance(enemy, hq) <= AiSystem.HQ_DANGER_DISTANCE));

    for (const hq of headquarters) {
      // Every iteration either buys a unit or leaves the loop, so this ends.
      while (true) {
        const unitType = this.chooseUnitToBuy(state, owner, canAfford, income, threatened);
        // Saving up or nothing affordable: no HQ buys anything else this turn.
        if (!unitType) return;

        const spawnTile = this.findSpawnTileNear(hq.q, hq.r, getNeighbors, getUnitAt, unitType === UnitType.Engineer);
        if (!spawnTile) break;
        if (!spend(owner, UNIT_TYPES[unitType].price)) return;

        const unit = new Unit(unitType, spawnTile.q, spawnTile.r, owner);
        if (unit.type === UnitType.Engineer) {
          unit.roadBuildPath = this.planEngineerRoadPath(state, unit, getNeighbors);
        }
        state.units.push(unit);
      }
    }
  }

  /** Returns the unit to buy next, or null to stop buying (saving up or nothing affordable). */
  private chooseUnitToBuy(
    state: GameState,
    owner: PlayerId,
    canAfford: CanAfford,
    income: number,
    threatened: boolean
  ): UnitType | null {
    const own = state.units.filter((unit) => unit.owner === owner);
    const countOf = (type: UnitType): number => own.filter((unit) => unit.type === type).length;
    const combatCount = own.filter((unit) => AiSystem.COMBAT_UNIT_TYPES.includes(unit.type)).length;

    if (combatCount >= AiSystem.ENGINEER_MIN_ARMY && countOf(UnitType.Engineer) === 0 &&
        canAfford(owner, UNIT_TYPES[UnitType.Engineer].price + AiSystem.ENGINEER_RESERVE)) {
      return UnitType.Engineer;
    }
    const wantedMedics = Math.floor(combatCount / AiSystem.COMBAT_UNITS_PER_MEDIC);
    if (countOf(UnitType.Medic) < wantedMedics && canAfford(owner, UNIT_TYPES[UnitType.Medic].price)) {
      return UnitType.Medic;
    }

    const enemies = state.units.filter((unit) => unit.owner !== owner && unit.type !== UnitType.MilitaryBase);
    const freeHoldings = state.tiles.filter((tile) =>
      this.isCityOrIndustry(tile) && !this.getUnitAt(state, tile)).length;

    const ranked = AiSystem.COMBAT_UNIT_TYPES.map((type) => {
      let score = this.matchupEfficiency(type, enemies, owner) / (1 + AiSystem.OWN_TYPE_PENALTY * countOf(type));
      // Fast units capture free cities and industry first.
      if (type === UnitType.Cavalry && countOf(UnitType.Cavalry) < freeHoldings) score += 0.5;
      return { type, score, price: UNIT_TYPES[type].price };
    }).sort((left, right) => right.score - left.score);

    const best = ranked[0]!;
    if (canAfford(owner, best.price)) return best.type;

    const bestAffordable = ranked.find((option) => canAfford(owner, option.price));
    if (!bestAffordable) return null;

    // Save for a clearly better unit that is only a few turns away, unless the headquarter is in danger.
    const worthWaiting = best.score - bestAffordable.score > AiSystem.SAVING_SCORE_MARGIN;
    if (!threatened && worthWaiting &&
        canAfford(owner, best.price - income * AiSystem.SAVING_HORIZON_TURNS)) {
      return null;
    }
    return bestAffordable.type;
  }

  /** Average value gained per money spent when a unit type fights the given enemies. */
  private matchupEfficiency(type: UnitType, enemies: Unit[], owner: PlayerId): number {
    const prototype = new Unit(type, 0, 0, owner);
    const price = prototype.data.price;
    const targets = enemies.length > 0 ? enemies : [new Unit(UnitType.Infantry, 0, 0, owner === 0 ? 1 : 0)];

    let total = 0;
    for (const enemy of targets) {
      const attack = this.combatSystem.estimateOutcome(prototype, enemy, FieldType.Farmland, prototype.attackRange);
      const defense = this.combatSystem.estimateOutcome(enemy, prototype, FieldType.Farmland, enemy.attackRange);
      const gain = (Math.min(attack.damageDefender, enemy.hp) / 100) * this.unitValue(enemy);
      // Being attacked is less certain than attacking, hence the factor.
      const loss = ((attack.damageAttacker + defense.damageDefender * 0.5) / 100) * price;
      total += gain - loss;
    }
    return total / targets.length / price;
  }

  private estimateIncome(state: GameState, owner: PlayerId): number {
    let income = 10;
    for (const unit of state.units) {
      if (unit.owner !== owner) continue;
      const tile = this.getTile(state, unit);
      if (tile?.field === FieldType.City) income += 50;
      else if (tile?.field === FieldType.Industry) income += 40;
    }
    return income * this.getIncomeMultiplier(owner);
  }

  private purchaseUnitsBasic(
    state: GameState,
    getNeighbors: GetNeighbors,
    getUnitAt: GetUnitAt,
    canAfford: CanAfford,
    spend: Spend
  ): void {
    const aiPlayer = state.currentPlayer;
    if (this.aiPlayer === null || aiPlayer !== this.aiPlayer) return;
    const hasUnoccupiedCitiesOrIndustries = this.hasUnoccupiedCityOrIndustry(state);

    const hasMedic = state.units.some(function (unit) {
      return unit.owner === aiPlayer && unit.type === UnitType.Medic;
    });
    const hasEngineer = state.units.some(function (unit) {
      return unit.owner === aiPlayer && unit.type === UnitType.Engineer;
    });

     let purchasePriority: UnitType[] = [
      UnitType.Tank,
      UnitType.Artillery,
      UnitType.Cavalry,
      UnitType.MachnineGun,
      UnitType.Infantry,
    ];
    if (hasUnoccupiedCitiesOrIndustries) {
      purchasePriority = [
        UnitType.Cavalry,
        UnitType.Tank,
        UnitType.Artillery,
        UnitType.MachnineGun,
        UnitType.Infantry,
      ];
    }


    if (!hasMedic) {
      purchasePriority.unshift(UnitType.Medic);
    }
    if (!hasEngineer) {
      purchasePriority.unshift(UnitType.Engineer);
    }

    const headquarters = state.units.filter(function (unit) {
      return unit.owner === aiPlayer && unit.type === UnitType.MilitaryBase;
    });

    for (const hq of headquarters) {
        for (const unitType of purchasePriority) {
        const spawnTile = this.findSpawnTileNear(
          hq.q,
          hq.r,
          getNeighbors,
          getUnitAt,
          unitType === UnitType.Engineer
        );
        if (!spawnTile) continue;  
        const cost = UNIT_TYPES[unitType].price;
        if (!canAfford(aiPlayer, cost)) continue;
        if (!spend(aiPlayer, cost)) continue;

        const unit = new Unit(unitType, spawnTile.q, spawnTile.r, aiPlayer);
        if (unit.type === UnitType.Engineer) {
          unit.roadBuildPath = this.planEngineerRoadPath(state, unit, getNeighbors);
        }
        state.units.push(unit);
        break;
      }
    }
  }

  private findSpawnTileNear(
    q: number,
    r: number,
    getNeighbors: GetNeighbors,
    getUnitAt: GetUnitAt,
    avoidCityIndustry: boolean
  ): Axial | null {
    const neighbors = getNeighbors(q, r);
    for (const tile of neighbors) {
      if (tile.field === FieldType.Ocean) continue;
      if (avoidCityIndustry && this.isCityOrIndustry(tile)) continue;
      if (getUnitAt({ q: tile.q, r: tile.r })) continue;
      return { q: tile.q, r: tile.r };
    }
    return null;
  }

  private tryHeal(state: GameState, healer: Unit): boolean {
    if (healer.type !== UnitType.Medic) return false;

    let bestTarget: Unit | null = null;
    let lowestHpRatio = 1;

    for (const unit of state.units) {
      if (unit.owner !== healer.owner) continue;
      if (unit === healer) continue;
      if (unit.hp >= unit.maxHP) continue;

      const distance = axialDistance({ q: healer.q, r: healer.r }, { q: unit.q, r: unit.r });
      if (distance > healer.attackRange) continue;

      const ratio = unit.hp / unit.maxHP;
      if (ratio < lowestHpRatio) {
        lowestHpRatio = ratio;
        bestTarget = unit;
      }
    }

    if (!bestTarget) return false;

    bestTarget.hp = Math.min(bestTarget.maxHP, bestTarget.hp + 50);
    healer.experience = Math.min(10, healer.experience + 1);
    healer.acted = true;
    return true;
  }

  private findInjuredAlly(state: GameState, medic: Unit): Axial | null {
    let bestTarget: Axial | null = null;
    let lowestHpRatio = 1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const unit of state.units) {
      if (unit.owner !== medic.owner) continue;
      if (unit === medic) continue;
      if (unit.hp >= unit.maxHP) continue;

      const ratio = unit.hp / unit.maxHP;
      const distance = axialDistance({ q: medic.q, r: medic.r }, { q: unit.q, r: unit.r });

      if (ratio < lowestHpRatio || (ratio === lowestHpRatio && distance < bestDistance)) {
        lowestHpRatio = ratio;
        bestDistance = distance;
        bestTarget = { q: unit.q, r: unit.r };
      }
    }

    return bestTarget;
  }

  private tryAttack(
    state: GameState,
    attacker: Unit,
    getTile: GetTile,
    getNeighbors: GetNeighbors
    ): CombatPreviewEntry | null {
    if (attacker.type === UnitType.Engineer) return null;
    if (attacker.acted) return null;

    const plan = this.findBestAttack(state, attacker, getNeighbors);
    if (!plan) return null;

    // Move first; the attack itself stays pending until the combat dialog confirms it.
    if (plan.reachable) {
      const path = this.movementSystem.computePathToTarget(state, attacker, plan.from, getNeighbors);
      if (!path) return null;
      if (!this.movementSystem.tryMoveUsingReachable(state, attacker, plan.from, plan.reachable)) return null;
      attacker.animationPath = path;
    }

    const bestTarget = plan.target;
    if (this.profile.focusFire) {
      this.plannedDamage.set(bestTarget, (this.plannedDamage.get(bestTarget) ?? 0) + plan.damage);
    }

    attacker.pos = { q: attacker.q, r: attacker.r };
    bestTarget.pos = { q: bestTarget.q, r: bestTarget.r };

    const preview = this.combatSystem.computePreview(state, attacker, bestTarget, getTile);
    const attackerSnapshot = Unit.serialize(attacker);
    const defenderSnapshot = Unit.serialize(bestTarget);
    return { preview, attacker: attackerSnapshot, defender: defenderSnapshot };
  }

  private unitValue(unit: Unit): number {
    if (unit.type === UnitType.MilitaryBase) return 800;
    return unit.data.price;
  }

  private fieldAt(state: GameState, pos: Axial): FieldType {
    return this.getTile(state, pos)?.field ?? FieldType.Farmland;
  }

  /**
   * Rates an attack from a position by expected damage dealt versus taken, weighted by unit price.
   * Returns null if the target is out of range or already counted as destroyed.
   */
  private scoreAttack(
    state: GameState,
    attacker: Unit,
    target: Unit,
    from: Axial
  ): { score: number; damage: number } | null {
    const distance = axialDistance(from, target);
    if (distance > attacker.attackRange) return null;

    const remaining = target.hp - (this.plannedDamage.get(target) ?? 0);
    if (remaining <= 0) return null;

    const targetTile = this.getTile(state, target);
    const outcome = this.combatSystem.estimateOutcome(attacker, target, this.fieldAt(state, target), distance);
    const dealt = Math.min(outcome.damageDefender, remaining);
    const taken = Math.min(outcome.damageAttacker, attacker.hp);

    let score = (dealt / 100) * this.unitValue(target) - (taken / 100) * this.unitValue(attacker);
    if (dealt >= remaining) {
      score += this.unitValue(target) * 0.5;
      if (targetTile && this.isCityOrIndustry(targetTile)) score += 25;
    }
    return { score, damage: dealt };
  }

  /** Expected damage a unit may suffer on a tile during the next enemy turn. */
  private estimateThreat(state: GameState, unit: Unit, pos: Axial): number {
    const field = this.fieldAt(state, pos);
    let total = 0;
    for (const enemy of state.units) {
      if (enemy.owner === unit.owner || enemy.offense <= 0) continue;
      if (enemy.hp - (this.plannedDamage.get(enemy) ?? 0) <= 0) continue;

      const distance = axialDistance(enemy, pos);
      if (distance > enemy.data.maxMovement + enemy.attackRange) continue;

      const outcome = this.combatSystem.estimateOutcome(enemy, unit, field, Math.min(distance, enemy.attackRange));
      const likelihood = distance <= enemy.attackRange ? 1 : 0.6;
      total += outcome.damageDefender * likelihood;
    }
    return Math.min(total, unit.hp);
  }

  private findBestAttack(
    state: GameState,
    attacker: Unit,
    getNeighbors: GetNeighbors
  ): { from: Axial; target: Unit; damage: number; reachable: Record<string, number> | null } | null {
    const origin: Axial = { q: attacker.q, r: attacker.r };
    const originTile = this.getTile(state, origin);
    const holdsPosition = !!originTile && this.isCityOrIndustry(originTile);

    const candidates: { pos: Axial; moveCost: number }[] = [{ pos: origin, moveCost: 0 }];
    let reachable: Record<string, number> | null = null;
    if (!holdsPosition && attacker.remainingMovement > 0 && attacker.type !== UnitType.MilitaryBase) {
      reachable = this.movementSystem.computeReachableTiles(state, attacker, getNeighbors);
      for (const key of Object.keys(reachable)) {
        const [qStr, rStr] = key.split(",");
        candidates.push({ pos: { q: Number(qStr), r: Number(rStr) }, moveCost: reachable[key]! });
      }
    }

    const enemies = state.units.filter((unit) => unit.owner !== attacker.owner);
    const value = this.unitValue(attacker);
    const options: { from: Axial; target: Unit; damage: number; total: number }[] = [];

    for (const candidate of candidates) {
      let positionBest: { target: Unit; damage: number; score: number } | null = null;
      for (const enemy of enemies) {
        const rated = this.scoreAttack(state, attacker, enemy, candidate.pos);
        if (!rated || rated.score <= 0) continue;
        if (!positionBest || rated.score > positionBest.score) {
          positionBest = { target: enemy, damage: rated.damage, score: rated.score };
        }
      }
      if (!positionBest) continue;

      // Prefer defensible, low-threat positions; this also makes ranged units keep their distance.
      const terrain = (getFieldDef(this.fieldAt(state, candidate.pos)).defense / 100) * value * 0.15;
      const threat = (this.estimateThreat(state, attacker, candidate.pos) / 100) * value * 0.5 *
        this.profile.threatWeight;
      const total = positionBest.score + terrain - threat - candidate.moveCost * 0.5;
      options.push({ from: candidate.pos, target: positionBest.target, damage: positionBest.damage, total });
    }

    if (options.length === 0) return null;
    let best = options[0]!;
    for (const option of options) {
      if (option.total > best.total) best = option;
    }
    // A weaker player sometimes does not pick the best of the acceptable attacks.
    if (options.length > 1 && this.rng() < this.profile.mistakeChance) {
      best = options[Math.floor(this.rng() * options.length)]!;
    }

    const moves = best.from.q !== origin.q || best.from.r !== origin.r;
    return { from: best.from, target: best.target, damage: best.damage, reachable: moves ? reachable : null };
  }

  private tryMove(
    state: GameState,
    unit: Unit,
    getNeighbors: GetNeighbors,
    hasUnoccupiedCitiesOrIndustries: boolean,
    hasUnactedCavalry: boolean,
    attackingUnits: ReadonlySet<Unit>
  ): boolean {
    if (unit.acted || unit.remainingMovement <= 0) return false;
    if (this.profile.idleChance > 0 && this.rng() < this.profile.idleChance) return false;
    //keep the city and industry units in place
    const currentTile = this.getTile(state, { q: unit.q, r: unit.r });
    if (currentTile && this.isCityOrIndustry(currentTile)) return false;

    const shouldReserveCapturesForCavalry =
      hasUnoccupiedCitiesOrIndustries &&
      unit.type !== UnitType.Cavalry &&
      hasUnactedCavalry;
    const target = this.findTarget(state, unit, !shouldReserveCapturesForCavalry);
    if (!target) return false;

    if (this.tryRelieveGarrison(state, unit, target, getNeighbors, attackingUnits)) return true;

    const reachableTiles = this.movementSystem.computeReachableTiles(
      state,
      unit,
      function (q, r) {
        return getNeighbors(q, r);
      }
    );

    const bestMove = this.chooseAdvanceTile(state, unit, target, reachableTiles, getNeighbors);
    if (!bestMove) return false;

    const path = this.movementSystem.computePathToTarget(
      state,
      unit,
      bestMove,
      function (q, r) {
        return getNeighbors(q, r);
      }
    );

    if (!path) return false;

    const moved = this.movementSystem.tryMoveUsingReachable(state, unit, bestMove, reachableTiles);

    if (moved) {
      unit.acted = true;
      unit.animationPath = path;
    }

    return moved;
  }

  /**
   * Picks the reachable tile that is closest to the target by real path cost,
   * preferring defensible tiles and avoiding heavy enemy threat. Returns null if staying is better.
   */
  private chooseAdvanceTile(
    state: GameState,
    unit: Unit,
    target: Axial,
    reachableTiles: Record<string, number>,
    getNeighbors: GetNeighbors
  ): Axial | null {
    const field = this.getCostField(state, target, getNeighbors);
    const rate = (pos: Axial): number => {
      const pathCost = field.get(MovementSystem.key(pos.q, pos.r)) ?? 1000 + axialDistance(pos, target);
      if (pos.q === target.q && pos.r === target.r) return pathCost;
      const terrain = getFieldDef(this.fieldAt(state, pos)).defense / 50;
      const threat = Math.min(2, (this.estimateThreat(state, unit, pos) / Math.max(1, unit.hp)) * 1.5) *
        this.profile.threatWeight;
      return pathCost - terrain + threat;
    };

    let bestMove: Axial | null = null;
    let bestRating = rate({ q: unit.q, r: unit.r });
    for (const key of Object.keys(reachableTiles)) {
      const [qStr, rStr] = key.split(",");
      const pos = { q: Number(qStr), r: Number(rStr) };
      const rating = rate(pos);
      if (rating < bestRating) {
        bestRating = rating;
        bestMove = pos;
      }
    }
    return bestMove;
  }

  /** Remaining movement cost from every tile to the target, ignoring units. */
  private getCostField(state: GameState, target: Axial, getNeighbors: GetNeighbors): Map<string, number> {
    const cacheKey = MovementSystem.key(target.q, target.r);
    const cached = this.costFieldCache.get(cacheKey);
    if (cached) return cached;

    const dist = new Map<string, number>([[cacheKey, 0]]);
    const open: { q: number; r: number; cost: number }[] = [{ q: target.q, r: target.r, cost: 0 }];

    while (open.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i]!.cost < open[bestIdx]!.cost) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0]!;
      if (current.cost !== dist.get(MovementSystem.key(current.q, current.r))) continue;

      const currentTile = this.getTile(state, current);
      if (!currentTile) continue;
      // Stepping from a neighbour onto the current tile costs what the current tile costs.
      const stepCost = this.movementSystem.getMovementCost(currentTile);

      for (const neighbor of getNeighbors(current.q, current.r)) {
        if (neighbor.field === FieldType.Ocean) continue;
        const nextCost = current.cost + stepCost;
        const key = MovementSystem.key(neighbor.q, neighbor.r);
        const old = dist.get(key);
        if (old === undefined || nextCost < old) {
          dist.set(key, nextCost);
          open.push({ q: neighbor.q, r: neighbor.r, cost: nextCost });
        }
      }
    }

    this.costFieldCache.set(cacheKey, dist);
    return dist;
  }

  private canRelieveGarrison(unit: Unit): boolean {
    return unit.type !== UnitType.MilitaryBase &&
      unit.type !== UnitType.Engineer && unit.type !== UnitType.Medic &&
      !unit.acted && unit.remainingMovement > 0 && unit.hp >= unit.maxHP * this.profile.retreatHpRatio;
  }

  private findAdvancePath(
    state: GameState,
    unit: Unit,
    target: Axial,
    getNeighbors: GetNeighbors
  ): Axial[] | null {
    const occupant = this.getUnitAt(state, target);
    if (occupant && occupant.owner === unit.owner) return null;

    // An occupied enemy tile is approached via a free position in attack range.
    const destinations = occupant
      ? state.tiles.filter((tile) => tile.field !== FieldType.Ocean &&
          axialDistance(tile, target) <= unit.attackRange && !this.getUnitAt(state, tile))
      : [target];

    let bestPath: Axial[] | null = null;
    for (const destination of destinations) {
      const path = this.movementSystem.computePathToTarget(
        state, unit, destination, getNeighbors, { maxCost: Number.POSITIVE_INFINITY }
      );
      if (path && (bestPath === null || path.length < bestPath.length)) bestPath = path;
    }
    return bestPath;
  }

  private tryRelieveGarrison(
    state: GameState,
    replacement: Unit,
    target: Axial,
    getNeighbors: GetNeighbors,
    attackingUnits: ReadonlySet<Unit>
  ): boolean {
    if (!this.canRelieveGarrison(replacement)) return false;

    const candidates = state.units.filter((unit) => unit !== replacement &&
      unit.owner === replacement.owner && this.canRelieveGarrison(unit) &&
      !attackingUnits.has(unit) &&
      axialDistance(unit, target) < axialDistance(replacement, target)
    ).sort((left, right) => axialDistance(left, target) - axialDistance(right, target));

    for (const garrison of candidates) {
      const holding = this.getTile(state, garrison);
      if (!holding || !this.isCityOrIndustry(holding)) continue;

      // Preserve attacks even when this garrison has not been processed yet.
      if (state.units.some((enemy) => enemy.owner !== garrison.owner &&
          axialDistance(garrison, enemy) <= garrison.attackRange)) continue;

      // Check the takeover without changing the live position of the garrison.
      const clearedState: GameState = {
        ...state,
        units: state.units.filter((unit) => unit !== garrison),
      };
      const arrivalReachable = this.movementSystem.computeReachableTiles(clearedState, replacement, getNeighbors);
      if (arrivalReachable[MovementSystem.key(holding.q, holding.r)] === undefined) continue;
      const arrivalPath = this.movementSystem.computePathToTarget(clearedState, replacement, holding, getNeighbors);
      if (!arrivalPath || arrivalPath.length === 0) continue;

      const advancePath = this.findAdvancePath(state, garrison, target, getNeighbors);
      if (!advancePath || advancePath.length === 0) continue;
      const replacementAdvance = this.findAdvancePath(clearedState, replacement, target, getNeighbors);
      if (replacementAdvance && advancePath.length >= replacementAdvance.length) continue;

      const departureReachable = this.movementSystem.computeReachableTiles(state, garrison, getNeighbors);
      const departurePath: Axial[] = [];
      for (const step of advancePath) {
        if (departureReachable[MovementSystem.key(step.q, step.r)] === undefined) break;
        departurePath.push(step);
      }

      // The departing unit must leave the entire takeover route clear.
      // Avoid stopping on another holding unless that holding is the assigned goal.
      while (departurePath.length > 0) {
        const destination = departurePath[departurePath.length - 1]!;
        const tile = this.getTile(state, destination);
        const blocksArrival = arrivalPath.some((step) => step.q === destination.q && step.r === destination.r);
        const stopsOnOtherHolding = tile && this.isCityOrIndustry(tile) &&
          (destination.q !== target.q || destination.r !== target.r);
        if (!blocksArrival && !stopsOnOtherHolding) break;
        departurePath.pop();
      }
      const destination = departurePath[departurePath.length - 1];
      if (!destination) continue;

      const previousMovement = garrison.remainingMovement;
      if (!this.movementSystem.tryMoveUsingReachable(state, garrison, destination, departureReachable)) continue;
        garrison.q = holding.q;
        garrison.r = holding.r;
        garrison.remainingMovement = previousMovement;
        continue;
      }

      // Both units are finished for this turn, preventing repeated handovers.
      garrison.acted = true;
      replacement.acted = true;
      garrison.animationPath = departurePath;
      replacement.animationPath = arrivalPath;
      return true;
    }
    return false;
  }

  private tryMoveEngineer(
    state: GameState,
    engineer: Unit,
    target: HexTile,
    getNeighbors: GetNeighbors
  ): boolean {
    if (engineer.acted || engineer.remainingMovement <= 0) return false;

    // Find a real route to a free building position, including detours around units.
    let bestPath: Axial[] | null = null;
    for (const tile of getNeighbors(target.q, target.r)) {
      if (tile.field === FieldType.Ocean || this.isCityOrIndustry(tile)) continue;
      const occupant = this.getUnitAt(state, tile);
      if (occupant && occupant !== engineer) continue;

      const path = this.movementSystem.computePathToTarget(
        state,
        engineer,
        tile,
        getNeighbors,
        { maxCost: Number.POSITIVE_INFINITY }
      );
      if (path && (bestPath === null || path.length < bestPath.length)) {
        bestPath = path;
      }
    }

    if (!bestPath || bestPath.length === 0) return false;

    const reachableTiles = this.movementSystem.computeReachableTiles(
      state,
      engineer,
      getNeighbors
    );

    // Follow only the part of the approach route reachable in this turn.
    const movementPath: Axial[] = [];
    for (const step of bestPath) {
      if (reachableTiles[MovementSystem.key(step.q, step.r)] === undefined) break;
      movementPath.push(step);
    }
    const bestMove = movementPath[movementPath.length - 1];
    if (!bestMove) return false;

    const moved = this.movementSystem.tryMoveUsingReachable(
      state,
      engineer,
      bestMove,
      reachableTiles
    );

    if (moved) {
      // Leave the action available for building after movement.
      engineer.animationPath = movementPath;
    }

    return moved;
  }

  private tryRetreat(
    state: GameState,
    unit: Unit,
    getNeighbors: GetNeighbors
  ): boolean {
    if (unit.acted || unit.remainingMovement <= 0) return false;

    const retreatTarget = this.findRetreatTarget(state, unit);
    if (!retreatTarget) return false;

    const reachableTiles = this.movementSystem.computeReachableTiles(
      state,
      unit,
      function (q, r) {
        return getNeighbors(q, r);
      }
    );

    let bestMove: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const key of Object.keys(reachableTiles)) {
      const [qStr, rStr] = key.split(",");
      const q = Number(qStr);
      const r = Number(rStr);
      const dist = axialDistance({ q, r }, retreatTarget);

      if (dist < bestDistance) {
        bestDistance = dist;
        bestMove = { q, r };
      }
    }

    if (!bestMove) return false;
    
    const path = this.movementSystem.computePathToTarget(
      state,
      unit,
      bestMove,
      function (q, r) {
        return getNeighbors(q, r);
      }
    );

    if (!path) return false;

    const moved = this.movementSystem.tryMoveUsingReachable(state, unit, bestMove, reachableTiles);

    if (moved) {
      unit.acted = true;
      unit.animationPath = path;
    }
    return moved;
  }

  private tryMoveToInjured(
    state: GameState,
    medic: Unit,
    getNeighbors: GetNeighbors
  ): boolean {
    if (medic.acted || medic.remainingMovement <= 0) return false;

    const target = this.findInjuredAlly(state, medic);
    if (!target) return false;

    const reachableTiles = this.movementSystem.computeReachableTiles(
      state,
      medic,
      function (q, r) {
        return getNeighbors(q, r);
      }
    );

    let bestMove: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const key of Object.keys(reachableTiles)) {
      const [qStr, rStr] = key.split(",");
      const q = Number(qStr);
      const r = Number(rStr);
      const tile = this.getTile(state, { q, r });
      if (tile && this.isCityOrIndustry(tile)) continue;
      const dist = axialDistance({ q, r }, target);

      if (dist < bestDistance) {
        bestDistance = dist;
        bestMove = { q, r };
      }
    }

    if (!bestMove) return false;

    const path = this.movementSystem.computePathToTarget(
      state,
      medic,
      bestMove,
      (q, r) => getNeighbors(q, r)
    );

    if (!path) return false;

    const moved = this.movementSystem.tryMoveUsingReachable(state, medic, bestMove, reachableTiles);

    if (moved) {
      medic.acted = true;
      medic.animationPath = path;
    }

    return moved;
  }

  private getTile(state: GameState, pos: Axial): HexTile | undefined {
    if (this.tileIndexSource !== state.tiles) {
      this.tileIndex = new Map(state.tiles.map((tile) => [MovementSystem.key(tile.q, tile.r), tile]));
      this.tileIndexSource = state.tiles;
    }
    return this.tileIndex.get(MovementSystem.key(pos.q, pos.r));
  }

  private getUnitAt(state: GameState, pos: Axial): Unit | undefined {
    return state.units.find(function (occupant) {
      return occupant.q === pos.q && occupant.r === pos.r;
    });
  }

  private isCityOrIndustry(tile: HexTile): boolean {
    return tile.field === FieldType.City || tile.field === FieldType.Industry;
  }

  private countHoldings(state: GameState, owner: PlayerId): number {
    let count = 0;
    for (const occupant of state.units) {
      if (occupant.owner !== owner) continue;
      const tile = this.getTile(state, { q: occupant.q, r: occupant.r });
      if (!tile || !this.isCityOrIndustry(tile)) continue;
      count += 1;
    }
    return count;
  }

  private findClosestFreeTileInRange(state: GameState, unit: Unit, center: Axial): Axial | null {
    let bestTile: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestCenterDistance = Number.POSITIVE_INFINITY;

    for (const tile of state.tiles) {
      if (tile.field === FieldType.Ocean) continue;
      if (this.getUnitAt(state, { q: tile.q, r: tile.r })) continue;

      const centerDistance = axialDistance({ q: tile.q, r: tile.r }, center);
      if (centerDistance > unit.attackRange) continue;

      const unitDistance = axialDistance({ q: unit.q, r: unit.r }, { q: tile.q, r: tile.r });

      if (
        unitDistance < bestDistance ||
        (unitDistance === bestDistance && centerDistance < bestCenterDistance)
      ) {
        bestDistance = unitDistance;
        bestCenterDistance = centerDistance;
        bestTile = { q: tile.q, r: tile.r };
      }
    }

    return bestTile;
  }

  private findClosestHeadquarter(state: GameState, owner: PlayerId, from: Axial): Unit | null {
    let bestHq: Unit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const unit of state.units) {
      if (unit.owner !== owner) continue;
      if (unit.type !== UnitType.MilitaryBase) continue;
      const distance = axialDistance(from, { q: unit.q, r: unit.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestHq = unit;
      }
    }

    return bestHq;
  }

  private planEngineerRoadPath(
    state: GameState,
    engineer: Unit,
    getNeighbors: GetNeighbors
  ): Axial[] {
    const ownHq = this.findClosestHeadquarter(state, engineer.owner, engineer);
    const enemyOwner: PlayerId = engineer.owner === 0 ? 1 : 0;
    const enemyHq = this.findClosestHeadquarter(state, enemyOwner, engineer);
    if (!ownHq || !enemyHq) return [];

    // Plan across the whole map, ignoring units and per-turn movement limits.
    const path = this.movementSystem.computePathToTarget(
      state,
      engineer,
      { q: enemyHq.q, r: enemyHq.r },
      getNeighbors,
      {
        start: { q: ownHq.q, r: ownHq.r },
        maxCost: Number.POSITIVE_INFINITY,
        ignoreUnits: true,
      }
    );

    // The search excludes the start; remove the enemy HQ tile as well.
    return path ? path.slice(0, -1) : [];
  }

  private findEngineerTarget(state: GameState, engineer: Unit): HexTile | null {
    // Keep skipped gaps in the plan so they can be completed in a later turn.
    for (const pos of engineer.roadBuildPath) {
      const tile = this.getTile(state, pos);
      if (!tile || tile.field === FieldType.Ocean || tile.hasRoad) continue;
      if (this.isCityOrIndustry(tile)) continue;

      const occupant = this.getUnitAt(state, pos);
      if (occupant && occupant !== engineer) continue;
      return tile;
    }
    return null;
  }

  private tryBuildEngineerRoad(
    state: GameState,
    engineer: Unit,
    target: HexTile,
    spend: Spend
  ): boolean {
    if (engineer.acted) return false;

    const overlay = this.combatSystem.computeEngineerRoadOverlay(state, engineer);
    if (!overlay[MovementSystem.key(target.q, target.r)]) return false;
    if (!spend(engineer.owner, AiSystem.ENGINEER_ROAD_COST)) return false;

    target.hasRoad = true;
    engineer.acted = true;
    return true;
  }

  /** Closest enemy that threatens a nearby own headquarter, as a position to attack it from. */
  private findHeadquarterDefenseTarget(state: GameState, unit: Unit): Axial | null {
    let threat: Unit | null = null;
    let threatDistance = Number.POSITIVE_INFINITY;

    for (const hq of state.units) {
      if (hq.owner !== unit.owner || hq.type !== UnitType.MilitaryBase) continue;
      if (axialDistance(unit, hq) > AiSystem.HQ_DEFENDER_DISTANCE) continue;

      for (const enemy of state.units) {
        if (enemy.owner === unit.owner || enemy.type === UnitType.MilitaryBase) continue;
        if (axialDistance(enemy, hq) > AiSystem.HQ_DANGER_DISTANCE) continue;
        const distance = axialDistance(unit, enemy);
        if (distance < threatDistance) {
          threatDistance = distance;
          threat = enemy;
        }
      }
    }

    if (!threat) return null;
    return this.findClosestFreeTileInRange(state, unit, threat) ?? { q: threat.q, r: threat.r };
  }

  private findTarget(state: GameState, unit: Unit, allowFreeTargets: boolean): Axial | null {
    if (this.profile.defendHeadquarter) {
      const defenseTarget = this.findHeadquarterDefenseTarget(state, unit);
      if (defenseTarget) return defenseTarget;
    }

    if (allowFreeTargets) {
      const freeTarget = this.findClosestUnoccupiedCityOrIndustry(state, unit);
      if (freeTarget) return freeTarget;
    }

    const aiHoldings = this.countHoldings(state, unit.owner);
    let opponentHoldings = 0;
    for (const occupant of state.units) {
      if (occupant.owner === unit.owner) continue;
      const holdings = this.countHoldings(state, occupant.owner);
      opponentHoldings = Math.max(opponentHoldings, holdings);
    }

    // Prioritize attacking enemy military bases if we have more holdings
    if (aiHoldings > opponentHoldings) {
      for (const enemy of state.units) {
        if (enemy.owner === unit.owner) continue;
        if (enemy.type !== UnitType.MilitaryBase) continue;

        const target = this.findClosestFreeTileInRange(state, unit, { q: enemy.q, r: enemy.r });
        if (target) return target;
      }
    }

    let bestTarget: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    
    // Next, try to attack enemy-occupied cities or industries
    for (const tile of state.tiles) {
      if (!this.isCityOrIndustry(tile)) continue;
      const occupant = this.getUnitAt(state, { q: tile.q, r: tile.r });
      if (!occupant || occupant.owner === unit.owner) continue;

      const target = this.findClosestFreeTileInRange(state, unit, { q: tile.q, r: tile.r });
      if (!target) continue;

      const distance = axialDistance({ q: unit.q, r: unit.r }, target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = target;
      }
    }
    
    if (bestTarget) return bestTarget;
    // Finally, move towards the closest enemy unit
    for (const enemy of state.units) {
      if (enemy.owner === unit.owner) continue;
      const distance = axialDistance({ q: unit.q, r: unit.r }, { q: enemy.q, r: enemy.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { q: enemy.q, r: enemy.r };
      }
    }

    return bestTarget;
  }

  private hasUnoccupiedCityOrIndustry(state: GameState): boolean {
    const system = this;
    return state.tiles.some(function (tile) {
      if (!system.isCityOrIndustry(tile)) return false;
      return !system.getUnitAt(state, { q: tile.q, r: tile.r });
    });
  }

  private hasUnactedCavalry(state: GameState, owner: PlayerId): boolean {
    return state.units.some(function (unit) {
      return unit.owner === owner && unit.type === UnitType.Cavalry && !unit.acted;
    });
  }

  private findClosestUnoccupiedCityOrIndustry(state: GameState, unit: Unit): Axial | null {
    let bestTarget: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const tile of state.tiles) {
      if (!this.isCityOrIndustry(tile)) continue;
      if (this.getUnitAt(state, { q: tile.q, r: tile.r })) continue;
      const distance = axialDistance({ q: unit.q, r: unit.r }, { q: tile.q, r: tile.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { q: tile.q, r: tile.r };
      }
    }

    return bestTarget;
  }

  private findRetreatTarget(state: GameState, unit: Unit): Axial | null {
    const medics = state.units.filter(function (ally) {
      return ally.owner === unit.owner && ally.type === UnitType.Medic;
    });

    let bestTarget: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const medic of medics) {
      const distance = axialDistance({ q: unit.q, r: unit.r }, { q: medic.q, r: medic.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { q: medic.q, r: medic.r };
      }
    }

    if (bestTarget) return bestTarget;

    for (const hq of state.units) {
      if (hq.owner !== unit.owner) continue;
      if (hq.type !== UnitType.MilitaryBase) continue;

      const distance = axialDistance({ q: unit.q, r: unit.r }, { q: hq.q, r: hq.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { q: hq.q, r: hq.r };
      }
    }

    return bestTarget;
  }
}
