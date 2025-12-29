// Core shared types

export type PlayerId = 0 | 1;

export interface Axial {
  q: number;
  r: number;
}

export interface HexTile extends Axial {
  field: FieldType;
}

export enum FieldType {
  Plains = "Plains",
  Forest = "Forest",
  Mountain = "Mountain",
}

export interface Unit {
  id: number;
  owner: PlayerId;
  pos: Axial;
  hp: number;
  movement: number;
}

export interface GameState {
  turn: number;
  currentPlayer: PlayerId;
  selectedHex: Axial | null;
  tiles: HexTile[];
  units: Unit[];
}
