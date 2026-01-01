import { UnitType } from "./units/unitType";
import { Unit } from "./units/unit";
import { FieldType } from "./map/fieldTypes";
// Core shared types

export type PlayerId = 0 | 1;

export interface Axial {
  q: number;
  r: number;
}

export interface HexTile extends Axial {
  field: FieldType;
  col: number
  row: number
}


export interface GameState {
  turn: number;
  currentPlayer: PlayerId;
  selectedHex: Axial | null;
  selectedUnit: Unit | null;
  reachableTiles: Record<string, number>;
  attackOverlay: Record<string, true>;
  tiles: HexTile[];
  units: Unit[];
  mapWidth: number;
  mapHeight: number;
}

export type CombatPreview = {
  attackerPos: Axial;
  defenderPos: Axial;

  attackBase: number;
  defenseBase: number;

  minAttacker: number;
  maxAttacker: number;
  randomAttacker: number; // 0..99
  attackPower: number;

  minDefender: number;
  maxDefender: number;
  randomDefender: number; // 0..99
  defensePower: number;

  distance: number;
  defenderCanCounter: boolean;

  result: number;
  randomDamage: number; // 1..5

  damageDefender: number;
  damageAttacker: number;
};
