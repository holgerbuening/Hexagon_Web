import type { Axial, GameState, HexTile, PlayerId } from "../types";
import { axialDistance } from "../hexMath";
import { FieldType } from "../map/fieldTypes";
import { MovementSystem } from "./movementSystem";
import { CombatSystem } from "./combatSystem";
import { Unit } from "../units/unit";
import { UnitType, UNIT_TYPES } from "../units/unitType";

export class AiSystem {
  private movementSystem: MovementSystem;
  private combatSystem: CombatSystem;
  private aiPlayer: PlayerId | null = 1;
  private aiDifficultyMultiplier: number = 1.0;

  constructor(movementSystem: MovementSystem, combatSystem: CombatSystem) {
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;
  }

  public configure(player: PlayerId | null, difficultyMultiplier = 1): void {
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

  public runTurn(
    state: GameState,
    getTile: (pos: Axial) => HexTile | undefined,
    getNeighbors: (q: number, r: number) => HexTile[],
    getUnitAt: (pos: Axial) => Unit | undefined,
    canAfford: (player: PlayerId, cost: number) => boolean,
    spend: (player: PlayerId, cost: number) => boolean
  ): void {
    if (!this.shouldRun(state)) return;

    this.purchaseUnits(state, getNeighbors, getUnitAt, canAfford, spend);

    const aiUnits = state.units.filter(
      (unit) => unit.owner === state.currentPlayer && unit.type !== UnitType.MilitaryBase
    );

    for (const unit of aiUnits) {
      if (unit.acted) continue;

      if (unit.type === UnitType.Medic && this.tryHeal(state, unit)) continue;

      if (this.tryAttack(state, unit, getTile)) continue;

      this.tryMove(state, unit, getNeighbors);
    }
  }

  private purchaseUnits(
    state: GameState,
    getNeighbors: (q: number, r: number) => HexTile[],
    getUnitAt: (pos: Axial) => Unit | undefined,
    canAfford: (player: PlayerId, cost: number) => boolean,
    spend: (player: PlayerId, cost: number) => boolean
  ): void {
    const aiPlayer = state.currentPlayer;
    if (this.aiPlayer === null || aiPlayer !== this.aiPlayer) return;

    const hasMedic = state.units.some(
      (unit) => unit.owner === aiPlayer && unit.type === UnitType.Medic
    );

    const purchasePriority: UnitType[] = [
      UnitType.Tank,
      UnitType.Artillery,
      UnitType.Cavalry,
      UnitType.MachnineGun,
      UnitType.Infantry,
    ];

    if (!hasMedic) {
      purchasePriority.unshift(UnitType.Medic);
    }

    const headquarters = state.units.filter(
      (unit) => unit.owner === aiPlayer && unit.type === UnitType.MilitaryBase
    );

    for (const hq of headquarters) {
      const spawnTile = this.findSpawnTileNear(hq.q, hq.r, getNeighbors, getUnitAt);
      if (!spawnTile) continue;

      for (const unitType of purchasePriority) {
        const cost = UNIT_TYPES[unitType].price;
        if (!canAfford(aiPlayer, cost)) continue;
        if (!spend(aiPlayer, cost)) continue;

        state.units.push(new Unit(unitType, spawnTile.q, spawnTile.r, aiPlayer));
        break;
      }
    }
  }

  private findSpawnTileNear(
    q: number,
    r: number,
    getNeighbors: (q: number, r: number) => HexTile[],
    getUnitAt: (pos: Axial) => Unit | undefined
  ): Axial | null {
    const neighbors = getNeighbors(q, r);
    for (const tile of neighbors) {
      if (tile.field === FieldType.Ocean) continue;
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

  private tryAttack(
    state: GameState,
    attacker: Unit,
    getTile: (pos: Axial) => HexTile | undefined
  ): boolean {
    if (attacker.acted) return false;

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

    if (!bestTarget) return false;

    attacker.pos = { q: attacker.q, r: attacker.r };
    bestTarget.pos = { q: bestTarget.q, r: bestTarget.r };

    const preview = this.combatSystem.computePreview(state, attacker, bestTarget, getTile);
    this.combatSystem.apply(state, preview);
    return true;
  }

  private tryMove(
    state: GameState,
    unit: Unit,
    getNeighbors: (q: number, r: number) => HexTile[]
  ): boolean {
    if (unit.acted || unit.remainingMovement <= 0) return false;

    const target = this.findTarget(state, unit);
    if (!target) return false;

    const reachableTiles = this.movementSystem.computeReachableTiles(
      state,
      unit,
      (q, r) => getNeighbors(q, r)
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

    const moved = this.movementSystem.tryMoveUsingReachable(state, unit, bestMove, reachableTiles);

    if (moved) {
      unit.acted = true;
    }

    return moved;
  }

  private findTarget(state: GameState, unit: Unit): Axial | null {
    let bestTarget: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of state.units) {
      if (enemy.owner === unit.owner) continue;
      const distance = axialDistance({ q: unit.q, r: unit.r }, { q: enemy.q, r: enemy.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { q: enemy.q, r: enemy.r };
      }
    }

    if (bestTarget) return bestTarget;

    for (const tile of state.tiles) {
      if (tile.field !== FieldType.City && tile.field !== FieldType.Industry) continue;
      if (state.units.some((u) => u.q === tile.q && u.r === tile.r && u.owner === unit.owner)) {
        continue;
      }
      const distance = axialDistance({ q: unit.q, r: unit.r }, { q: tile.q, r: tile.r });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { q: tile.q, r: tile.r };
      }
    }

    return bestTarget;
  }
}