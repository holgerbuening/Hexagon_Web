import { UnitType, UNIT_TYPES } from "./unitType";
import type { PlayerId, Axial, SavedUnit } from "../types";

export class Unit {
  readonly type: UnitType;
  q: number;
  r: number;
  pos: Axial;
  owner: PlayerId;

  hp: number;
  maxHP: number;
  offense: number;
  defense: number;
  attackRange: number;
  experience: number = 0;
  remainingMovement: number;
  acted: boolean = false;

  selected: boolean = false;
  animationPath: Axial[] = [];

  // Planned road route for the AI engineer, independent of movement animations.
  roadBuildPath: Axial[] = [];

  constructor(type: UnitType, q: number, r: number, owner: PlayerId) {
    this.type = type;
    this.q = q;
    this.r = r;
    this.pos = { q, r };
    this.owner = owner;

    const data = UNIT_TYPES[type];
    this.hp = data.maxHP;
    this.maxHP = data.maxHP;
    this.remainingMovement = data.maxMovement;
    this.offense = data.offense;
    this.defense = data.defense;
    this.attackRange = data.attackRange;
  }

  get data() {
    return UNIT_TYPES[this.type];
  }

  public resetForNewTurn(): void {
    if (this.remainingMovement === this.data.maxMovement && !this.acted) {
      this.hp +=10;
      if (this.hp > this.maxHP) this.hp = this.maxHP;
    }
    this.remainingMovement = this.data.maxMovement;
    this.acted = false;
  }
  
  public static serialize(unit: Unit): SavedUnit {
    return {
      type: unit.type,
      q: unit.q,
      r: unit.r,
      owner: unit.owner,
      hp: unit.hp,
      maxHP: unit.maxHP,
      offense: unit.offense,
      defense: unit.defense,
      attackRange: unit.attackRange,
      experience: unit.experience,
      remainingMovement: unit.remainingMovement,
      acted: unit.acted,
      selected: unit.selected,
      roadBuildPath: unit.roadBuildPath.map((pos) => ({ q: pos.q, r: pos.r })),
    };
  }

  public static fromSaved(data: SavedUnit): Unit {
    const unit = new Unit(data.type, data.q, data.r, data.owner);
    unit.hp = data.hp;
    unit.maxHP = data.maxHP;
    unit.offense = data.offense;
    unit.defense = data.defense;
    unit.attackRange = data.attackRange;
    unit.experience = data.experience;
    unit.remainingMovement = data.remainingMovement;
    unit.acted = data.acted;
    unit.selected = data.selected;
    unit.roadBuildPath = (data.roadBuildPath ?? []).map((pos) => ({ q: pos.q, r: pos.r }));
    unit.pos = { q: data.q, r: data.r };
    return unit;
  }
}

/** Shared by player and AI upgrades; fortification never repairs existing damage. */
export function fortifyHeadquarter(base: Unit): Unit {
  if (base.type !== UnitType.MilitaryBase) throw new Error("Only a basic military base can be fortified.");
  const fortified = new Unit(UnitType.MilitaryBaseFortified, base.q, base.r, base.owner);
  fortified.maxHP = base.maxHP;
  fortified.hp = base.hp;
  fortified.experience = base.experience;
  fortified.acted = true;
  return fortified;
}
