export enum UnitType {
  Infantry = "infantry"
}

export interface UnitTypeData {
  name: string;
  maxMovement: number;
  offense: number;
  defense: number;
  attackRange: number;
  maxHP: number;
  spriteKey: string;
}

export const UNIT_TYPES: Record<UnitType, UnitTypeData> = {
  [UnitType.Infantry]: {
    name: "Infantry",
    maxMovement: 3,
    offense: 10,
    defense: 5,
    attackRange: 1,
    maxHP: 100,
    spriteKey: "infantry"
  }
};
