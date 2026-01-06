// src/core/map/mapGenerator.ts
import type { HexTile } from "../types";
import { FieldType } from "./fieldTypes";

export interface GeneratedMap {
  tiles: HexTile[];
  tileGrid: HexTile[][];
}

export class MapGenerator {
  public generate(width: number, height: number): GeneratedMap {
    // English comment: Initialize grid
    const tileGrid: HexTile[][] = [];
    const tiles: HexTile[] = [];

    for (let row = 0; row < height; row++) {
      const rowArr: HexTile[] = [];
      for (let col = 0; col < width; col++) {
        const q = this.getQOffsetForRow(row)+ col;
        const r = row;

        const tile: HexTile = {
          q,
          r,
          col,
          row,
          field: FieldType.Farmland,
        };

        rowArr.push(tile);
        tiles.push(tile);
      }
      tileGrid.push(rowArr);
    }

    // English comment: Apply generation steps (keep same behavior as before)
    this.addAreas(tileGrid, width, height, FieldType.Ocean);
    this.addAreas(tileGrid, width, height, FieldType.Mountain);
    this.randomFill(tileGrid, width, height);
    this.placeCities(tileGrid, width, height);
    this.placeIndustries(tileGrid, width, height);

    return { tiles, tileGrid };
  }

  private addAreas(
    tileGrid: (HexTile | undefined)[][],
    width: number,
    height: number,
    field: FieldType
  ): void {
    // English comment: This should mirror your old "growArea / generateLargeAreas" logic.
    // Keep it simple: start points + flood-fill / random-walk.

    const areaCountBase = Math.floor((width * height) / 80);
    const maxSizeBase = Math.floor((width * height) / 60);

    const numAreas = (Math.floor(Math.random() * 4) + 1) + areaCountBase;
    const maxSize = (Math.floor(Math.random() * 8) + 1) + maxSizeBase;

    for (let i = 0; i < numAreas; i++) {
      const startRow = Math.floor(Math.random() * height);
      const startCol = Math.floor(Math.random() * width);
      this.floodFill(tileGrid, width, height, startCol, startRow, field, maxSize);
    }
  }

  private floodFill(
    tileGrid: (HexTile | undefined)[][],
    width: number,
    height: number,
    startCol: number,
    startRow: number,
    field: FieldType,
    maxSize: number
  ): void {
    const stack: Array<{ col: number; row: number }> = [{ col: startCol, row: startRow }];
    let painted = 0;

    // English comment: Ensure minimum area size
    let sizeOfThisArea = maxSize;
    if (sizeOfThisArea < 4) sizeOfThisArea = 4;
    sizeOfThisArea = Math.floor(Math.random() * (sizeOfThisArea - 3)) + 4;

    while (stack.length > 0 && painted < sizeOfThisArea) {
      const cur = stack.pop();
      if (!cur) continue;

      if (!this.isValid(cur.col, cur.row, width, height)) continue;

      const tile = tileGrid[cur.row]?.[cur.col];
      if (!tile) continue;

      // English comment: Only overwrite Farmland (like your C++ version does)
      if (tile.field !== FieldType.Farmland) continue;

      tile.field = field;
      painted++;

      // English comment: Push shuffled neighbors (col/row neighbors)
      const neigh = this.getNeighborColRows(cur.col, cur.row, width, height);
      this.shuffleInPlace(neigh);
      for (const n of neigh) stack.push(n);
    }
  }

  private randomFill(
    tileGrid: (HexTile | undefined)[][],
    width: number,
    height: number
  ): void {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const tile = tileGrid[row]?.[col];
        if (!tile) continue;

        if (tile.field !== FieldType.Farmland) continue;

        const r = Math.floor(Math.random() * 100);
        if (r < 25) tile.field = FieldType.Hills;
        else if (r < 70) tile.field = FieldType.Woods;
      }
    }
  }

  private placeCities(tileGrid: (HexTile | undefined)[][], width: number, height: number): void {
    const cityCount = Math.floor((width * height) / 80);

    for (let i = 0; i < cityCount; i++) {
      let placed = false;
      let tries = 0;

      while (!placed && tries < width * height * 2) {
        tries++;

        const row = Math.floor(Math.random() * height);
        const col = Math.floor(Math.random() * width);
        const tile = tileGrid[row]?.[col];
        if (!tile) continue;

        if (tile.field === FieldType.Ocean) continue;

        tile.field = FieldType.City;
        placed = true;
      }
    }
  }

  private placeIndustries(
    tileGrid: (HexTile | undefined)[][],
    width: number,
    height: number
  ): void {
    const industryCount = Math.floor((width * height) / 60);

    for (let i = 0; i < industryCount; i++) {
      let placed = false;
      let tries = 0;

      while (!placed && tries < width * height * 2) {
        tries++;

        const row = Math.floor(Math.random() * height);
        const col = Math.floor(Math.random() * width);
        const tile = tileGrid[row]?.[col];
        if (!tile) continue;

        if (tile.field === FieldType.Ocean) continue;
        if (tile.field === FieldType.City) continue;

        tile.field = FieldType.Industry;
        placed = true;
      }
    }
  }

  private isValid(col: number, row: number, width: number, height: number): boolean {
    if (row < 0 || row >= height) return false;
    if (col < 0 || col >= width) return false;
    return true;
  }

  private getNeighborColRows(
    col: number,
    row: number,
    width: number,
    height: number
  ): Array<{ col: number; row: number }> {
    // English comment: Neighbor set on "offset grid" (not axial). Keep it consistent with how you build tileGrid.
    // If your existing code uses odd-r / odd-q offsets, replicate it here.
    const res: Array<{ col: number; row: number }> = [];

    // simple 6-neighbor approximation for "pointy top / odd-r"
    const odd = row % 2 === 1;

    const candidates = odd
      ? [
          { col: col - 1, row: row - 1 },
          { col: col, row: row - 1 },
          { col: col - 1, row: row },
          { col: col + 1, row: row },
          { col: col - 1, row: row + 1 },
          { col: col, row: row + 1 },
        ]
      : [
          { col: col, row: row - 1 },
          { col: col + 1, row: row - 1 },
          { col: col - 1, row: row },
          { col: col + 1, row: row },
          { col: col, row: row + 1 },
          { col: col + 1, row: row + 1 },
        ];

    for (const c of candidates) {
      if (this.isValid(c.col, c.row, width, height)) res.push(c);
    }

    return res;
  }

  private shuffleInPlace<T>(arr: T[]): void {
    // English comment: Fisher–Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j]!;
      arr[j] = tmp!;
    }
  }

  private getQOffsetForRow(row: number): number {
    let qOffset: number = 0;
    for (let i = 0; i < row; i++) {
        if ((i % 2) === 1) {
            qOffset --;
    }
    }
    return qOffset;
  }

  private colRowToQ(col: number, _row: number): number {
    // English comment: In your mapping, q usually equals col (offset handled via r)
    return col;
  }
}
