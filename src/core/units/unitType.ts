export enum UnitType {
  Infantry = "infantry",
  MilitaryBase = "militarybase",
  MachnineGun = "machinegun",
  Medic = "medic",
  Tank = "tank",
  Artillery = "artillery",
  Cavalry = "cavalry",
  Engineer = "engineer"
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
    maxHP: 100,
    spriteKey: "machinegun",
    price: 250
  },
  [UnitType.Medic]: {
    name: "Medic",
    maxMovement: 3,
    offense: 0,
    defense: 10,
    attackRange: 1,
    maxHP: 100,
    spriteKey: "medic",
    price: 100
  },
  [UnitType.Artillery]: {
    name: "Artillery",
    maxMovement: 2,
    offense: 200,
    defense: 50,
    attackRange: 3,
    maxHP: 100,
    spriteKey: "artillery",
    price: 300
  },
  [UnitType.Cavalry]: {
    name: "Cavalry",
    maxMovement: 5,
    offense: 120,
    defense: 50,
    attackRange: 1,
    maxHP: 100,
    spriteKey: "cavalry",
    price: 200
  },
  [UnitType.Tank]: {
    name: "Tank",
    maxMovement: 2,
    offense: 200,
    defense: 150,
    attackRange: 2,
    maxHP: 100,
    spriteKey: "tank",
    price: 400
  },
  [UnitType.Engineer]: {
    name: "Engineer",
    maxMovement: 3,
    offense: 0,
    defense: 10,
    attackRange: 1,
    maxHP: 100,
    spriteKey: "engineer",
    price: 180
  }

};
