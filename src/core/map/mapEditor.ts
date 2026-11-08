import type { Axial, HexTile } from "../types";
import type { Rng } from "../rng";
import { FieldType } from "./fieldTypes";
import { MapGenerator } from "./mapGenerator";
import { parseMapDocument, type MapDocument } from "./mapSerializer";

export const EDITOR_FIELDS = [FieldType.Farmland, FieldType.Woods, FieldType.Hills,
  FieldType.Mountain, FieldType.Ocean, FieldType.City, FieldType.Industry];

export class MapEditor {
  public document: MapDocument;
  public dirty = false;
  private history: Array<{ tile: HexTile; field: FieldType }> = [];

  constructor(width = 20, height = 20, rng?: Rng) {
    this.document = { format: "hexagon-map", version: 1, name: "New Map", width, height,
      tiles: new MapGenerator(rng).generate(width, height).tiles };
  }

  get canUndo(): boolean { return this.history.length > 0; }

  cycle(hex: Axial): void {
    const tile = this.document.tiles.find(t => t.q === hex.q && t.r === hex.r);
    if (!tile) return;
    this.history.push({ tile, field: tile.field });
    tile.field = EDITOR_FIELDS[(EDITOR_FIELDS.indexOf(tile.field) + 1) % EDITOR_FIELDS.length]!;
    this.dirty = true;
  }

  undo(): void {
    const change = this.history.pop();
    if (!change) return;
    change.tile.field = change.field;
    this.dirty = true;
  }

  load(value: unknown): void {
    const document = parseMapDocument(value);
    this.document = document;
    this.history = [];
    this.dirty = false;
  }
}
