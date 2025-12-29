import { FieldType, type Axial, type GameState, type HexTile, type Unit } from "./types";
import { axialDistance } from "./hexMath";

// Main game logic container (no rendering here)
export class GameCore {
  private state: GameState;

  constructor(radius: number = 4) {
    this.state = {
      turn: 1,
      currentPlayer: 0,
      selectedHex: null,
      tiles: this.createHexDisk(radius),
      units: this.createTestUnits(),
    };
  }

  // Expose immutable view (simple approach for now)
  getState(): Readonly<GameState> {
    return this.state;
  }

  // Handle click selection
  selectHex(pos: Axial): void {
    const tile = this.getTile(pos);
    if (!tile) {
      this.state.selectedHex = null;
      return;
    }
    // Store the position of the selected tile
    this.state.selectedHex = { q: tile.q, r: tile.r };
  }

  endTurn(): void {
    this.state.turn += 1;
    this.togglePlayer();
    this.state.selectedHex = null;
  }

  // --- helpers ---

  private togglePlayer(): void {
    if (this.state.currentPlayer === 0) {
      this.state.currentPlayer = 1;
    } else {
      this.state.currentPlayer = 0;
    }
  }

  private getTile(pos: Axial): HexTile | undefined {
    for (const tile of this.state.tiles) {
        if (tile.q === pos.q && tile.r === pos.r) {
        return tile;
        }
    }
    return undefined;
  }


  private createHexDisk(radius: number): HexTile[] {
    const tiles: HexTile[] = [];
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        const s = -q - r;
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
          tiles.push({
            q,
            r,
            field: this.pickFieldType(q, r),
          });
        }
      }
    }
    return tiles;
  }

  private pickFieldType(q: number, r: number): FieldType {
    // Simple deterministic pattern (replace with noise later)
    const v = (q * 13 + r * 7) % 10;

    if (v < 6) {
      return FieldType.Plains;
    }
    if (v < 9) {
      return FieldType.Forest;
    }
    return FieldType.Mountain;
  }

  private createTestUnits(): Unit[] {
    return [
      { id: 1, owner: 0, pos: { q: 0, r: 0 }, hp: 10, movement: 4 },
      { id: 2, owner: 1, pos: { q: 2, r: -1 }, hp: 10, movement: 4 },
    ];
  }

  // Example: find unit at a hex (useful later)
  getUnitAt(pos: Axial): Unit | undefined {
    for (const unit of this.state.units) {
        if (unit.pos.q === pos.q && unit.pos.r === pos.r) {
        return unit;
        }
    }
    return undefined;
  }


  // Example rule helper: can current player interact with a unit?
  canSelectUnit(pos: Axial): boolean {
    const unit = this.getUnitAt(pos);
    if (!unit) {
        return false;
    }
    if (unit.owner !== this.state.currentPlayer) {
        return false;
    }
    return true;
    }


  // Example: movement range check (placeholder)
  inMoveRange(from: Axial, to: Axial, maxSteps: number): boolean {
    return axialDistance(from, to) <= maxSteps;
  }
}
