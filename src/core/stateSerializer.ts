import type { GameState, HexTile, SavedGameState } from "./types";
import { Unit } from "./units/unit";

type DeserializedState = {
  state: GameState;
  tileGrid: HexTile[][];
};

export function serializeState(state: GameState): SavedGameState {
  return {
    version: 1,
    turn: state.turn,
    currentPlayer: state.currentPlayer,
    tiles: state.tiles.map((tile) => ({ ...tile })),
    units: state.units.map((unit) => Unit.serialize(unit)),
    playerBalances: [...state.playerBalances],
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
  };
}

export function deserializeState(saved: SavedGameState): DeserializedState {
  if (saved.version !== 1) {
    throw new Error(`Unsupported save version: ${saved.version}`);
  }

  const tiles = saved.tiles.map((tile) => ({ ...tile }));
  const units = saved.units.map((unit) => Unit.fromSaved(unit));

  const state: GameState = {
    turn: saved.turn,
    currentPlayer: saved.currentPlayer,
    selectedHex: null,
    selectedUnit: null,
    reachableTiles: {},
    attackOverlay: {},
    tiles,
    units,
    playerBalances: [...saved.playerBalances],
    mapWidth: saved.mapWidth,
    mapHeight: saved.mapHeight,
  };

  return {
    state,
    tileGrid: buildTileGrid(tiles, saved.mapWidth, saved.mapHeight),
  };
}

function buildTileGrid(tiles: HexTile[], width: number, height: number): HexTile[][] {
  const grid: HexTile[][] = [];
  for (let row = 0; row < height; row++) {
    const rowTiles = tiles.filter((tile) => tile.row === row);
    rowTiles.sort((a, b) => a.col - b.col);
    grid.push(rowTiles);
  }
  return grid;
}