import { type Axial, type GameState, type HexTile, type PlayerId , type CombatPreview} from "./types";
import  { Unit } from "./units/unit";
import  { UnitType } from "./units/unitType";
import { FieldType, getFieldDef } from "./map/fieldTypes";
import { axialDistance } from "./hexMath";
import { CombatSystem } from "./systems/combatSystem";
import { MovementSystem } from "./systems/movementSystem";
import { MapGenerator } from "./map/mapGenerator";


// Main game logic container (no rendering here)
export class GameCore {
  private state: GameState;
  private tileGrid: HexTile[][]; // 2D array for easy access
  private combatSystem: CombatSystem = new CombatSystem();
  private movementSystem: MovementSystem = new MovementSystem();
  private mapGenerator: MapGenerator = new MapGenerator();
  
  constructor(width: number, height: number) {
    this.tileGrid = [];
    
    this.state = {
      turn: 1,
      currentPlayer: 0,
      selectedHex: null,
      selectedUnit: null,
      mapWidth: width,
      mapHeight: height,
      reachableTiles: {},
      attackOverlay: {},
      tiles: [],
      //tiles: this.createHexDisk(radius),
      //tiles: this.createBaseMap(width, height),
      units: this.createTestUnits(),
    };
    
    this.createNewMap(width, height);
  }

  // Expose immutable view (simple approach for now)
  public getState(): Readonly<GameState> {
    return this.state;
  }

  // Handle click selection
  public selectHex(pos: Axial): CombatPreview | null {
    const tile = this.getTile(pos);
    if (!tile) {
      this.clearSelectionAndOverlays(true);
      return null;
    }

    // English comment: Always store last clicked hex
    this.state.selectedHex = { q: tile.q, r: tile.r };

    // 1) Friendly unit click -> select unit + overlays
    if (this.handleFriendlyUnitClick(pos)) {
      return null;
    }

    // 2) Move attempt -> if moved, we're done
    if (this.handleMoveAttempt(pos)) {
      return null;
    }

    // 3) Attack attempt -> may return preview
    const preview = this.handleAttackAttempt(pos);
    if (preview) {
      return preview;
    }

    // 4) Nothing useful -> clear overlays + selectedUnit (keep selectedHex)
    this.clearSelectionAndOverlays(false);
    return null;
  }

  public endTurn(): void {
    this.state.turn += 1;
    this.resetUnitsOfPlayer(this.state.currentPlayer);
    this.togglePlayer();
    this.state.selectedHex = null;
    this.state.selectedUnit = null;
    this.state.attackOverlay = {};
    this.state.reachableTiles = {};
    
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
    
  
  private createTestUnits(): Unit[] {
    const units: Unit[] = [];

    // Player 0 units
    units.push(new Unit(UnitType.Infantry, 2, 2, 0));
    units.push(new Unit(UnitType.Infantry, 4, 3, 0));
    let unittemp=units[units.length -1];
    if (unittemp) {
      unittemp.hp = 5; // damage for testing
      unittemp.experience = 10;
    }
    // Player 1 units
    units.push(new Unit(UnitType.Infantry, 7, 7, 1));
    units.push(new Unit(UnitType.Infantry, 6, 5, 1));

    return units;
  }

  public getUnitAt(pos: Axial): Unit | undefined {
    for (const unit of this.state.units) {
        if (unit.q === pos.q && unit.r === pos.r) {
        return unit;
        }
    }
    return undefined;
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
    //console.log('this.tileGrid[row]:', this.tileGrid[row]);
    if (!rowArray) {
      return undefined;
    }
    return rowArray[col];
  }
 
  private resetUnitsOfPlayer(player: PlayerId): void {
    for (const unit of this.state.units) {
      if (unit.owner === player) {
        unit.resetForNewTurn();
      }
    }
  }
 
  public applyCombat(preview: CombatPreview): void {
    this.combatSystem.apply(this.state, preview);

    // Clear selection/overlays after combat (UI/interaction belongs in GameCore)
    this.state.selectedUnit = null;
    this.state.attackOverlay = {};
    this.state.reachableTiles = {};
  }

  private clearSelectionAndOverlays(clearSelectedHex: boolean): void {
    // English comment: Central reset to keep behavior consistent
    if (clearSelectedHex) {
      this.state.selectedHex = null;
    }

    this.state.selectedUnit = null;
    this.state.reachableTiles = {};
    this.state.attackOverlay = {};
  }

  private handleFriendlyUnitClick(pos: Axial): boolean {
    const unit = this.getUnitAt(pos);
    if (!unit) return false;

    // English comment: Only react to friendly unit clicks
    if (unit.owner !== this.state.currentPlayer) return false;

    this.state.selectedUnit = unit;

    // English comment: Only show overlays if unit has not acted yet
    if (!unit.acted) {
      this.state.reachableTiles = this.movementSystem.computeReachableTiles(
        this.state,
        unit,
        (q, r) => this.getNeighbors(q, r)
      );

      this.state.attackOverlay = this.combatSystem.computeAttackOverlayForUnit(this.state, unit);
    } else {
      this.state.reachableTiles = {};
      this.state.attackOverlay = {};
    }

    return true;
  }

  private handleMoveAttempt(pos: Axial): boolean {
    const selected = this.state.selectedUnit;
    if (!selected) return false;

    // English comment: Try to move selected unit to clicked tile based on reachable map
    const moved = this.movementSystem.tryMoveUsingReachable(
      this.state,
      selected,
      pos,
      this.state.reachableTiles
    );

    if (!moved) return false;

    // English comment: After a successful move, clear overlays (same behavior as before)
    this.state.reachableTiles = {};
    this.state.attackOverlay = {};
    return true;
  }

  private handleAttackAttempt(pos: Axial): CombatPreview | null {
    const attacker = this.state.selectedUnit;
    if (!attacker) return null;

    // English comment: Attacker must be able to act
    if (attacker.acted) return null;

    const defender = this.getUnitAt(pos);
    if (!defender) return null;

    // English comment: Must be enemy
    if (defender.owner === attacker.owner) return null;

    // English comment: Must be inside precomputed attack overlay
    const k = MovementSystem.key(defender.q, defender.r);
    if (!this.state.attackOverlay[k]) return null;

    const preview = this.combatSystem.computePreview(
      this.state,
      attacker,
      defender,
      (p) => this.getTile(p)
    );

    // English comment: Clear overlays like your previous implementation (Qt-like behavior)
    this.state.reachableTiles = {};
    this.state.attackOverlay = {};
    this.state.selectedUnit = null;

    return preview;
  }

  public createNewMap(width: number, height: number): void {
    this.state.mapWidth = width;
    this.state.mapHeight = height;

    const generated = this.mapGenerator.generate(width, height);

    this.state.tiles = generated.tiles;
    this.tileGrid = generated.tileGrid;

    // English comment: Clear selection/overlays because map changed
    this.state.selectedHex = null;
    this.state.selectedUnit = null;
    this.state.reachableTiles = {};
    this.state.attackOverlay = {};
  }


}

 