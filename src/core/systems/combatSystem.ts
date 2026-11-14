import type { Axial, EngineerBuildType, CombatPreview, GameState, HexTile } from "../types";
import { axialDistance } from "../hexMath";
import { FieldType,getFieldDef } from "../map/fieldTypes";
import type { Unit } from "../units/unit";
import type { Rng } from "../rng";
import { MovementSystem } from "./movementSystem";

export class CombatSystem {
  private readonly rng: Rng;

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
  }

  private getUnitAt(state: GameState, pos: Axial): Unit | undefined {
    // English comment: Small helper so GameCore does not need to provide getUnitAt callback
    for (const u of state.units) {
      if (u.q === pos.q && u.r === pos.r) return u;
    }
    return undefined;
  }

  private removeDeadUnits(state: GameState): Unit[] {
    // English comment: Remove units with hp <= 0
    const removed = state.units.filter((u) => u.hp <= 0);
    state.units = state.units.filter((u) => u.hp > 0);
    return removed;
  }

  public computePreview(
    state: GameState,
    attacker: Unit,
    defender: Unit,
    getTile: (pos: Axial) => HexTile | undefined
  ): CombatPreview {
    // English comment: Mirror the former GameCore.computeCombatPreview() logic

    const attackBase = attacker.offense + attacker.experience * 10;

    const defenderTile = getTile(defender.pos);
    let fieldDefense = 0;
    if (defenderTile) {
      fieldDefense = getFieldDef(defenderTile.field).defense;
    }
   
    const defenseBase = defender.defense + defender.experience * 10 + fieldDefense;

    const distance = axialDistance(attacker.pos, defender.pos);
    const defenderCanCounter = distance <= defender.attackRange;

    const minAttacker = attackBase - attackBase * 0.25;
    const maxAttacker = attackBase + attackBase * 0.5;
    const randomAttacker = Math.floor(this.rng() * 100);
    const attackPower = Math.floor(
      minAttacker + (maxAttacker - minAttacker) * (randomAttacker / 100.0)
    );

    const minDefender = defenseBase - defenseBase * 0.1;
    const maxDefender = defenseBase + defenseBase * 0.1;
    const randomDefender = Math.floor(this.rng() * 100);
    const defensePower = Math.floor(
      minDefender + (maxDefender - minDefender) * (randomDefender / 100.0)
    );

    const result = attackPower - defensePower;

    // English comment: Random damage bonus 1..5 (same as before)
    const randomDamage = Math.floor(this.rng() * 5) + 1;

    let damageDefender = 0;
    if (result < 5) {
      damageDefender = randomDamage;
    } else {
      damageDefender = result + randomDamage;
    }

    let damageAttacker = 0;
    if (defenderCanCounter) {
      if (result < 0) {
        damageAttacker = -result + randomDamage;
      } else {
        damageAttacker = randomDamage;
      }
    } else {
      damageAttacker = 0;
    }

    return {
      attackerPos: { q: attacker.q, r: attacker.r },
      defenderPos: { q: defender.q, r: defender.r },

      attackBase,
      defenseBase,

      minAttacker,
      maxAttacker,
      randomAttacker,
      attackPower,

      minDefender,
      maxDefender,
      randomDefender,
      defensePower,

      distance,
      defenderCanCounter,

      result,
      randomDamage,

      damageDefender,
      damageAttacker,
    };
  }

  /**
   * Deterministic average outcome of an attack, using the same formulas as computePreview.
   * Used by the AI to rate attacks and positions without rolling dice.
   */
  public estimateOutcome(
    attacker: Unit,
    defender: Unit,
    defenderField: FieldType,
    distance: number
  ): { damageDefender: number; damageAttacker: number } {
    const attackBase = attacker.offense + attacker.experience * 10;
    const defenseBase = defender.defense + defender.experience * 10 + getFieldDef(defenderField).defense;

    // Mean of the random rolls: attack 0.75..1.5 and defense 0.9..1.1 of base, random 0..99.
    const attackPower = attackBase * (0.75 + 0.75 * 0.495);
    const defensePower = defenseBase;
    const result = attackPower - defensePower;
    const averageRandomDamage = 3;

    const damageDefender = result < 5 ? averageRandomDamage : result + averageRandomDamage;

    let damageAttacker = 0;
    if (distance <= defender.attackRange) {
      damageAttacker = result < 0 ? -result + averageRandomDamage : averageRandomDamage;
    }

    return { damageDefender, damageAttacker };
  }

  public apply(state: GameState, preview: CombatPreview): number {
    // English comment: Apply combat results only after OK in dialog

    const attacker = this.getUnitAt(state, preview.attackerPos);
    const defender = this.getUnitAt(state, preview.defenderPos);

    if (!attacker) return 0;
    if (!defender) return 0;

  // English comment: Only allow if attacker has not acted yet
    if (attacker.acted) return 0;
    defender.hp = defender.hp - preview.damageDefender;
    attacker.hp = attacker.hp - preview.damageAttacker;

    if (defender.hp < 0) defender.hp = 0;
    if (attacker.hp < 0) attacker.hp = 0;

    attacker.experience = attacker.experience + 1;
    if (attacker.experience > 10) attacker.experience = 10;

    attacker.acted = true;

    const removedUnits = this.removeDeadUnits(state);
    return removedUnits.length;
  }

  public computeAttackOverlayForUnit(state: GameState, unit: Unit): Record<string, true> {
    // English comment: Returns a map of enemy unit positions that are within attack range
    const result: Record<string, true> = {};
    const range = unit.data.attackRange;
    const origin: Axial = { q: unit.q, r: unit.r };

    for (const other of state.units) {
      if (other.owner === unit.owner) continue;

      const target: Axial = { q: other.q, r: other.r };
      const dist = axialDistance(origin, target);

      if (dist <= range) {
        result[MovementSystem.key(other.q, other.r)] = true;
      }
    }

    return result;
  }

  public computeHealOverlayForUnit(state: GameState, unit: Unit): Record<string, true> {
    // English comment: Returns a map of friendly unit positions within heal range
    const result: Record<string, true> = {};
    const range = unit.data.attackRange;
    const origin: Axial = { q: unit.q, r: unit.r };

    for (const other of state.units) {
      if (other.owner !== unit.owner) continue;
      if (other === unit) continue;

      const target: Axial = { q: other.q, r: other.r };
      const dist = axialDistance(origin, target);

      if (dist <= range) {
        result[MovementSystem.key(other.q, other.r)] = true;
      }
    }

    return result;
  } 
    
  public computeEngineerRoadOverlay(state: GameState, unit: Unit): Record<string, true> {
    return this.computeEngineerBuildOverlay(state, unit, "road");
  }

  public computeEngineerBuildOverlay(state: GameState, unit: Unit, type?: EngineerBuildType): Record<string, true> {
    const result: Record<string, true> = {};
    const range = unit.data.attackRange;
    const origin: Axial = { q: unit.q, r: unit.r };

    for (const tile of state.tiles) {
      if (tile.field === FieldType.Ocean) continue;
      const canBuildRoad = type !== "trench" && !tile.hasRoad;
      const canBuildTrench = type !== "road" && !tile.hasTrench;
      if (!canBuildRoad && !canBuildTrench) continue;
      if (this.getUnitAt(state, { q: tile.q, r: tile.r })) continue;

      const dist = axialDistance(origin, { q: tile.q, r: tile.r });
      if (dist <= range) {
        result[MovementSystem.key(tile.q, tile.r)] = true;
      }
    }

    return result;
  }
}
