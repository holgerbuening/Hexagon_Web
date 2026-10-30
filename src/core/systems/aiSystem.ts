import type { Axial, CombatPreviewEntry, GameState, HexTile, PlayerId } from "../types";
import { axialDistance } from "../hexMath";
import { FieldType } from "../map/fieldTypes";
import { MovementSystem } from "./movementSystem";
import { CombatSystem } from "./combatSystem";
import { Unit } from "../units/unit";
import { UnitType, UNIT_TYPES } from "../units/unitType";

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

export const aiDifficultyMultipliers: Record<AiDifficulty, number> = {
  easy: 1.0,
  normal: 2.0,
  hard: 3.0,
};

export class AiSystem {
  private static readonly ENGINEER_ROAD_COST = 20;
  private movementSystem: MovementSystem;
  private combatSystem: CombatSystem;
  private aiPlayer: PlayerId | null = 1;
  private aiDifficultyMultiplier: number = 1.0;

  constructor(movementSystem: MovementSystem, combatSystem: CombatSystem) {
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;
  }

  public configure(player: PlayerId | null, difficultyMultiplier = aiDifficultyMultipliers.normal): void {
    this.aiPlayer = player;
    this.aiDifficultyMultiplier = Math.max(1, difficultyMultiplier);
  }

  public shouldRun(state: GameState): boolean {
    return this.aiPlayer !== null && state.currentPlayer === this.aiPlayer;
  }

  public getIncomeMultiplier(player: PlayerId): number {
    if (this.aiPlayer === null) return 1;
    if (this.aiPlayer !== player) return 1;
    return this.aiDifficultyMultiplier;
  }

  public setDifficultyMultiplier(multiplier: number): void {
    this.aiDifficultyMultiplier = Math.max(1, multiplier);
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

      if (unit.hp < 15 && this.tryRetreat(state, unit, getNeighbors)) continue;

      const preview = this.tryAttack(state, unit, getTile);
      if (preview) {
        combatPreviews.push(preview);
        continue;
      }

      this.tryMove(state, unit, getNeighbors, hasUnoccupiedCitiesOrIndustries, hasUnactedCavalry);
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
    getTile: GetTile
    ): CombatPreviewEntry | null {
    if (attacker.type === UnitType.Engineer) return null;
    if (attacker.acted) return null;

    let bestTarget: Unit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const unit of state.units) {
      if (unit.owner === attacker.owner) continue;
      const distance = axialDistance({ q: attacker.q, r: attacker.r }, { q: unit.q, r: unit.r });
      if (distance > attacker.attackRange) continue;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = unit;
      }
    }

    if (!bestTarget) return null;

    attacker.pos = { q: attacker.q, r: attacker.r };
    bestTarget.pos = { q: bestTarget.q, r: bestTarget.r };

    const preview = this.combatSystem.computePreview(state, attacker, bestTarget, getTile);
    const attackerSnapshot = Unit.serialize(attacker);
    const defenderSnapshot = Unit.serialize(bestTarget);
    return { preview, attacker: attackerSnapshot, defender: defenderSnapshot };
  }

  private tryMove(
    state: GameState,
    unit: Unit,
    getNeighbors: GetNeighbors,
    hasUnoccupiedCitiesOrIndustries: boolean,
    hasUnactedCavalry: boolean
  ): boolean {
    if (unit.acted || unit.remainingMovement <= 0) return false;
    //keep the city and industry units in place
    const currentTile = this.getTile(state, { q: unit.q, r: unit.r });
    if (currentTile && this.isCityOrIndustry(currentTile)) return false;

    const shouldReserveCapturesForCavalry =
      hasUnoccupiedCitiesOrIndustries &&
      unit.type !== UnitType.Cavalry &&
      hasUnactedCavalry;
    const target = this.findTarget(state, unit, !shouldReserveCapturesForCavalry);
    if (!target) return false;

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
      const dist = axialDistance({ q, r }, target);

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
    return state.tiles.find(function (tile) {
      return tile.q === pos.q && tile.r === pos.r;
    });
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

  private findTarget(state: GameState, unit: Unit, allowFreeTargets: boolean): Axial | null {
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
