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
  moveOverlay: Axial[];
  tiles: HexTile[];
  units: Unit[];
  mapWidth: number;
  mapHeight: number;
}
