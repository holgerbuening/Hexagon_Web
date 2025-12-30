import { UnitType, UNIT_TYPES } from "./unitType";

export class Unit {
  readonly type: UnitType;
  q: number;
  r: number;
  owner: number;

  hp: number;
  experience: number = 0;
  remainingMovement: number;
  acted: boolean = false;

  selected: boolean = false;

  constructor(type: UnitType, q: number, r: number, owner: number) {
    this.type = type;
    this.q = q;
    this.r = r;
    this.owner = owner;

    const data = UNIT_TYPES[type];
    this.hp = data.maxHP;
    this.remainingMovement = data.maxMovement;
  }

  get data() {
    return UNIT_TYPES[this.type];
  }
}
