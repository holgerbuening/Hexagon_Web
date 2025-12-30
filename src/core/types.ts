import { UnitType } from "./units/unitType";
import { Unit } from "./units/unit";
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

export enum FieldType {
  Woods = "Woods",
  Ocean = "Ocean",
  Mountain = "Mountain",
  Farmland = "Farmland",
  Hills = "Hills",
  City = "City",
  Industry = "Industry",
}

export interface GameState {
  turn: number;
  currentPlayer: PlayerId;
  selectedHex: Axial | null;
  selectedUnit: Unit | null;
  tiles: HexTile[];
  units: Unit[];
  mapWidth: number;
  mapHeight: number;
}
