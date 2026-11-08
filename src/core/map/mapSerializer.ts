import type { HexTile } from "../types";
import { FieldType } from "./fieldTypes";

export interface MapDocument {
  format: "hexagon-map";
  version: 1;
  name: string;
  width: number;
  height: number;
  tiles: HexTile[];
}

export function parseMapDocument(value: unknown): MapDocument {
  const fail = (): never => { throw new Error("Ungültige Kartendatei."); };
  if (!value || typeof value !== "object") return fail();
  const map = value as Record<string, unknown>;
  const { width, height } = map;
  if (map.format !== "hexagon-map" || map.version !== 1 || typeof map.name !== "string" ||
      typeof width !== "number" || !Number.isInteger(width) || width < 1 || width > 200 ||
      typeof height !== "number" || !Number.isInteger(height) || height < 1 || height > 200 ||
      !Array.isArray(map.tiles) || map.tiles.length !== width * height) return fail();
  const occupied = new Set<number>();
  const tiles = map.tiles.map((raw: unknown): HexTile => {
    if (!raw || typeof raw !== "object") return fail();
    const tile = raw as Record<string, unknown>;
    const { col, row, field, hasRoad } = tile;
    if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col >= width ||
        typeof row !== "number" || !Number.isInteger(row) || row < 0 || row >= height ||
        !Object.values(FieldType).includes(field as FieldType) || typeof hasRoad !== "boolean") return fail();
    const key = row * width + col;
    if (occupied.has(key)) return fail();
    occupied.add(key);
    // Derive axial coordinates from grid positions instead of trusting file input.
    return { col, row, q: col - Math.floor(row / 2), r: row, field: field as FieldType, hasRoad };
  });
  return { format: "hexagon-map", version: 1, name: map.name, width, height, tiles };
}

export function serializeMapDocument(map: MapDocument): string {
  return JSON.stringify(parseMapDocument(map), null, 2);
}
