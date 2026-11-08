import assert from "node:assert/strict";
import { test } from "node:test";
import { MapEditor, EDITOR_FIELDS } from "../src/core/map/mapEditor";
import { parseMapDocument, serializeMapDocument } from "../src/core/map/mapSerializer";
import { createSeededRng } from "../src/core/rng";

test("editor cycles all terrain types, ignores outside clicks and undoes changes", () => {
  const editor = new MapEditor(20, 20, createSeededRng(1));
  const tile = editor.document.tiles[0]!;
  const initial = tile.field;
  for (let i = 0; i < EDITOR_FIELDS.length; i++) editor.cycle(tile);
  assert.equal(tile.field, initial);
  for (let i = 0; i < EDITOR_FIELDS.length; i++) editor.undo();
  assert.equal(tile.field, initial);
  assert.equal(editor.canUndo, false);
  editor.cycle({ q: -999, r: -999 });
  assert.equal(editor.canUndo, false);
});

test("maps round trip with dimensions and roads, load resets undo and does not share tiles", () => {
  const editor = new MapEditor(13, 9, createSeededRng(2));
  editor.document.tiles[0]!.hasRoad = true;
  const saved = JSON.parse(serializeMapDocument(editor.document));
  editor.cycle(editor.document.tiles[0]!);
  editor.load(saved);
  assert.deepEqual(editor.document, saved);
  assert.equal(editor.canUndo, false);
  assert.equal(editor.dirty, false);
  editor.cycle(editor.document.tiles[0]!);
  assert.notEqual(editor.document.tiles[0]!.field, saved.tiles[0].field);
});

test("invalid files are rejected without replacing the current map", () => {
  const editor = new MapEditor(20, 20);
  const original = editor.document;
  const copy = () => JSON.parse(serializeMapDocument(original));
  const invalid = [null, {}, { ...copy(), version: 2 }, { ...copy(), width: 0 },
    { ...copy(), height: 201 }, { ...copy(), tiles: [] }];
  const duplicate = copy(); duplicate.tiles[1] = duplicate.tiles[0]; invalid.push(duplicate);
  const terrain = copy(); terrain.tiles[0].field = "unknown"; invalid.push(terrain);
  for (const value of invalid) {
    assert.throws(() => editor.load(value));
    assert.equal(editor.document, original);
  }
  const coords = copy(); coords.tiles[0].q = 999;
  assert.equal(parseMapDocument(coords).tiles[0]!.q, 0);
});

test("custom maps start fresh games without changing terrain or the running match", async () => {
  const { GameCore } = await import("../src/core/gameCore");
  const { FieldType } = await import("../src/core/map/fieldTypes");
  const game = new GameCore(20, 20, createSeededRng(5));
  const before = game.serializeState();
  const map = new MapEditor(15, 12, createSeededRng(9)).document;
  map.tiles.forEach(tile => { tile.field = FieldType.Farmland; });
  map.tiles[0]!.hasRoad = true;
  const fresh = game.prepareNewGame(map);
  assert.deepEqual(game.serializeState(), before);
  assert.deepEqual(fresh.tiles, map.tiles);
  assert.equal(fresh.mapWidth, 15);
  assert.equal(fresh.mapHeight, 12);
  assert.equal(fresh.turn, 1);
  assert.equal(fresh.units.length, 8);
  assert.equal(new Set(fresh.units.map(unit => `${unit.q},${unit.r}`)).size, 8);
  assert.deepEqual(fresh.playerBalances, [50, 50]);
  game.loadState(fresh);
  assert.deepEqual(game.getState().tiles, map.tiles);
  const random = game.prepareNewGame();
  assert.equal(random.mapWidth, 20);
  assert.equal(random.mapHeight, 20);
});

test("unplayable custom maps fail without replacing an existing match", async () => {
  const { GameCore } = await import("../src/core/gameCore");
  const { FieldType } = await import("../src/core/map/fieldTypes");
  const game = new GameCore(20, 20, createSeededRng(5));
  const before = game.serializeState();
  const map = new MapEditor().document;
  map.tiles.forEach(tile => { tile.field = FieldType.Ocean; });
  assert.throws(() => game.prepareNewGame(map));
  assert.deepEqual(game.serializeState(), before);
});
