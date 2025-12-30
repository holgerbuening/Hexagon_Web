import { FieldType, type Axial, type GameState, type HexTile, type Unit } from "./types";
import { axialDistance } from "./hexMath";

// Main game logic container (no rendering here)
export class GameCore {
  private state: GameState;
  private tileGrid: HexTile[][]; // 2D array for easy access

  constructor(width: number, height: number) {
    this.tileGrid = [];
    this.state = {
      turn: 1,
      currentPlayer: 0,
      selectedHex: null,
      mapWidth: width,
      mapHeight: height,
      //tiles: this.createHexDisk(radius),
      tiles: this.createBaseMap(width, height),
      units: this.createTestUnits(),
    };
    
    this.createRandomMap(width, height);
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

  public getTile(pos: Axial): HexTile | undefined {
    for (const tile of this.state.tiles) {
        if (tile.q === pos.q && tile.r === pos.r) {
        return tile;
        }
    }
    return undefined;
  }

  private getNeighbors(q: number, r: number): HexTile[] {
      const results: HexTile[] = [];

      // axial neighbors
      const directions = [
        { dq: +1, dr:  0 },
        { dq: -1, dr:  0 },
        { dq:  0, dr: +1 },
        { dq:  0, dr: -1 },
        { dq: +1, dr: -1 },
        { dq: -1, dr: +1 },
      ];

      for (const d of directions) {
        let tempAxial: Axial = {q: q + d.dq, r: r + d.dr};
        const n = this.getTile(tempAxial);
        if (n) {
          results.push(n);
        }
      }
      return results;
  }
    
  private createBaseMap(width: number, height: number): HexTile[] {
    const tiles: HexTile[] = [];
    this.tileGrid = [];
    // 1) Initialize everything as Farmland
    for (let row = 0; row < height; row++) {
      const rowArray: HexTile[] = [];
      this.tileGrid[row] = rowArray;

      for (let col = 0; col < width; col++) {
        const q = col - Math.floor(row / 2);
        const r = row;
        const tile: HexTile = {
          q: q,
          r: r,
          col: col,
          row: row,
          field: FieldType.Farmland,
        };
        tiles.push(tile);
        rowArray[col] = tile;
        
      }
    }
    return tiles;
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

  private createRandomMap(width: number, height: number): void {
        
    const oceanAreas = Math.floor((width * height) / 80);
    const mountainAreas = Math.floor((width * height) / 60);

    for (let i = 0; i < oceanAreas; i++) {
      const q = Math.floor(Math.random() * width);
      const r = Math.floor(Math.random() * height);
      this.growArea(q + this.getQOffsetForRow(r), r, FieldType.Ocean, 12);
    }

    for (let i = 0; i < mountainAreas; i++) {
      const q = Math.floor(Math.random() * width);
      const r = Math.floor(Math.random() * height);
      this.growArea(q + this.getQOffsetForRow(r), r, FieldType.Mountain, 8);
    }
      for (const tile of this.state.tiles) {
    if (tile.field !== FieldType.Farmland) {
      continue;
    }

    const rnd = Math.floor(Math.random() * 100);

    if (rnd < 20) {
      tile.field = FieldType.Hills;
      } else if (rnd < 70) {
      tile.field = FieldType.Woods;
      }
    }
    this.placeCities(width, height);
    this.placeIndustries(width, height);
    
  }

private growArea(
    startQ: number,
    startR: number,
    targetField: FieldType,
    maxSize: number
  ): void {
    const stack: { q: number; r: number }[] = [];
    stack.push({ q: startQ, r: startR });

    let painted = 0;

    while (stack.length > 0 && painted < maxSize) {
      const current = stack.pop();
      if (!current) {
        break;
      }
      let tempAxial: Axial = {q: current.q, r: current.r};  
      const tile = this.getTile(tempAxial);
      if (!tile) {
        continue;
      }

      if (tile.field !== FieldType.Farmland) {
        continue;
      }

      tile.field = targetField;
      painted++;

      const neighbors = this.getNeighbors(tile.q, tile.r);

      // shuffle neighbors (like std::shuffle)
      for (let i = neighbors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        const a = neighbors[i];
        const b = neighbors[j];

        if (!a || !b) {
          continue;
        }

        neighbors[i] = b;
        neighbors[j] = a;
      }


      for (const n of neighbors) {
        stack.push({ q: n.q, r: n.r });
      }
    }
  } 

  private isLand(field: FieldType): boolean {
    // In the original C++ version: territory == 0 means land.
    // Here we treat Ocean as water, everything else as land.
    if (field === FieldType.Ocean) {
      return false;
    }
    return true;
  }

  private placeCities(width: number, height: number): void {
    const cityCount = Math.floor((width * height) / 80); // 1 city per 80 hexes
    let placedCities = 0;

    // Avoid endless loops if the map has too little land
    const maxAttempts = cityCount * 200;
    let attempts = 0;

    while (placedCities < cityCount && attempts < maxAttempts) {
      attempts++;

      const r = Math.floor(Math.random() * height);
      const qOffset = this.getQOffsetForRow(r);
      const q = qOffset + Math.floor(Math.random() * width);

      const tile = this.getTile({ q: q, r: r });
      if (!tile) {
        continue;
      }

      if (!this.isLand(tile.field)) {
        continue;
      }

      // Place city
      tile.field = FieldType.City;
      placedCities++;
    }

    console.log(placedCities + " Cities placed");
  }

  private placeIndustries(width: number, height: number): void {
    const industryCount = Math.floor((width * height) / 60); // 1 industry per 60 hexes
    let placedIndustries = 0;

    const maxAttempts = industryCount * 200;
    let attempts = 0;

    while (placedIndustries < industryCount && attempts < maxAttempts) {
      attempts++;

      const r = Math.floor(Math.random() * height);
      const qOffset = this.getQOffsetForRow(r);
      const q = qOffset + Math.floor(Math.random() * width);

      const tile = this.getTile({ q: q, r: r });
      if (!tile) {
        continue;
      }

      if (!this.isLand(tile.field)) {
        continue;
      }

      // Must not overwrite a city (same rule as in C++)
      if (tile.field === FieldType.City) {
        continue;
      }

      tile.field = FieldType.Industry;
      placedIndustries++;
    }

    console.log(placedIndustries + " Industries placed");
  }

  private getQOffsetForRow(r: number): number {
  // odd-r offset layout:
  // odd rows are shifted left by 1
  let qOffset: number = 0;
  for (let i = 0; i < r; i++) {
    if ((i % 2) === 1) {
        qOffset --;
   }
  }
  return qOffset;
  }

  public tryGetMapCenterTile(): HexTile | undefined {
    const width = this.state.mapWidth;
    const height = this.state.mapHeight;

    const centerCol = Math.floor(width / 2);
    const centerRow = Math.floor(height / 2);

    const tile = this.getTileByColRow(centerCol, centerRow);
    if (tile) {
      return tile;
    }

    // Fallback: return first tile if available
    if (this.state.tiles.length > 0) {
      return this.state.tiles[0];
    }

    return undefined;
  }

  public getTileByColRow(col: number, row: number): HexTile | undefined {
    if (row < 0 || row >= this.state.mapHeight) {
      return undefined;
    }
    if (col < 0 || col >= this.state.mapWidth) {
      return undefined;
    }
    const rowArray = this.tileGrid[row];
    console.log('this.tileGrid[row]:', this.tileGrid[row]);
    if (!rowArray) {
      return undefined;
    }
    return rowArray[col];
}


  
}

 