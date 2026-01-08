export enum UnitType {
  Infantry = "infantry",
  MilitaryBase = "militarybase",
  MachnineGun = "machinegun"
}

export interface UnitTypeData {
  name: string;
  maxMovement: number;
  offense: number;
  defense: number;
  attackRange: number;
  maxHP: number;
  spriteKey: string;
  price: number;
}

export const UNIT_TYPES: Record<UnitType, UnitTypeData> = {
  [UnitType.Infantry]: {
    name: "Infantry",
    maxMovement: 3,
    offense: 100,
    defense: 100,
    attackRange: 1,
    maxHP: 100,
    spriteKey: "infantry",
    price: 150
  },
  [UnitType.MilitaryBase]: {
    name: "Military Base",
    maxMovement: 0,
    offense: 0,
    defense: 10,
    attackRange: 0,
    maxHP: 100,
    spriteKey: "militarybase",
    price: 0
  },
  [UnitType.MachnineGun]: {
    name: "Machine Gun",
    maxMovement: 2,
    offense: 150,
    defense: 100,
    attackRange: 1,
    maxHP: 120,
    spriteKey: "machinegun",
    price: 250
  }
};
