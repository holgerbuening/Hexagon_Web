import type { Axial, CombatPreview, GameState, HexTile } from "../types";
import { axialDistance } from "../hexMath";
import { getFieldDef } from "../map/fieldTypes";
import type { Unit } from "../units/unit";

export class CombatSystem {
  private getUnitAt(state: GameState, pos: Axial): Unit | undefined {
    // English comment: Small helper so GameCore does not need to provide getUnitAt callback
    for (const u of state.units) {
      if (u.q === pos.q && u.r === pos.r) return u;
    }
    return undefined;
  }

  private removeDeadUnits(state: GameState): void {
    // English comment: Remove units with hp <= 0
    state.units = state.units.filter((u) => u.hp > 0);
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
    const randomAttacker = Math.floor(Math.random() * 100);
    const attackPower = Math.floor(
      minAttacker + (maxAttacker - minAttacker) * (randomAttacker / 100.0)
    );

    const minDefender = defenseBase - defenseBase * 0.1;
    const maxDefender = defenseBase + defenseBase * 0.1;
    const randomDefender = Math.floor(Math.random() * 100);
    const defensePower = Math.floor(
      minDefender + (maxDefender - minDefender) * (randomDefender / 100.0)
    );

    const result = attackPower - defensePower;

    // English comment: Random damage bonus 1..5 (same as before)
    const randomDamage = Math.floor(Math.random() * 5) + 1;

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

  public apply(state: GameState, preview: CombatPreview): void {
    // English comment: Apply combat results only after OK in dialog

    const attacker = this.getUnitAt(state, preview.attackerPos);
    const defender = this.getUnitAt(state, preview.defenderPos);

    if (!attacker) return;
    if (!defender) return;

    // English comment: Only allow if attacker is current player and not acted
    if (attacker.owner !== state.currentPlayer) return;
    if (attacker.acted) return;

    defender.hp = defender.hp - preview.damageDefender;
    attacker.hp = attacker.hp - preview.damageAttacker;

    if (defender.hp < 0) defender.hp = 0;
    if (attacker.hp < 0) attacker.hp = 0;

    attacker.experience = attacker.experience + 1;
    if (attacker.experience > 10) attacker.experience = 10;

    attacker.acted = true;

    this.removeDeadUnits(state);
  }
}
