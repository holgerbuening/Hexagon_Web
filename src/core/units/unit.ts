import { UnitType, UNIT_TYPES } from "./unitType";
import type { PlayerId, Axial } from "../types";

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
}
