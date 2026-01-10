import { type Axial, type GameState, type HexTile, type PlayerId , type CombatPreview, type SelectHexResult} from "./types";
import  { Unit } from "./units/unit";
import  { UnitType } from "./units/unitType";
import { UNIT_TYPES } from "./units/unitType";
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
  private aiPlayer: PlayerId | null = null;
  private aiDifficultyMultiplier: number = 1.0; // 1.0 = normal, >1.0 = harder AI
  private pendingPurchase: { unitType: UnitType; owner: PlayerId } | null = null;
  
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
      units: [],
      playerBalances: [50, 50],
    };
    
    this.createNewMap(width, height);
    this.setStartUnits();
  }

  // Expose immutable view (simple approach for now)
  public getState(): Readonly<GameState> {
    return this.state;
  }

  // Handle click selection
  public selectHex(pos: Axial): SelectHexResult  {
    if (this.handlePurchasePlacement(pos)) {
      return { kind: "none" };
    }
    const tile = this.getTile(pos);
    if (!tile) {
      this.clearSelectionAndOverlays(true);
      return { kind: "none" };
    }

    // English comment: Always store last clicked hex
    this.state.selectedHex = { q: tile.q, r: tile.r };

    // 1) Friendly unit click -> select unit + overlays
    const friendlyRes = this.handleFriendlyUnitClick(pos);
    if (friendlyRes) return friendlyRes;

    // 2) Move attempt -> if moved, we're done
    if (this.handleMoveAttempt(pos)) {
      return { kind: "none" };
    }

    // 3) Attack attempt -> may return preview
    const preview = this.handleAttackAttempt(pos);
    if (preview) {
      return { kind: "combat", preview};
    }

    // 4) Nothing useful -> clear overlays + selectedUnit (keep selectedHex)
    this.clearSelectionAndOverlays(false);
    return { kind: "none" };
  }

  public endTurn(): void {
    this.resetUnitsOfPlayer(this.state.currentPlayer);
    this.applyTurnIncome(this.state.currentPlayer);
    this.state.turn += 1;
    this.cancelPurchase();
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
    units.push(new Unit(UnitType.MachnineGun, 4, 3, 0));
    let unittemp=units[units.length -1];
    if (unittemp) {
      unittemp.hp = 75; // damage for testing
      unittemp.experience = 10;
    }
    units.push(new Unit(UnitType.MilitaryBase, 3, 2, 0));
    // Player 1 units
    units.push(new Unit(UnitType.Infantry, 7, 7, 1));
    units.push(new Unit(UnitType.MachnineGun, 6, 5, 1));
    units.push(new Unit(UnitType.MilitaryBase, 6, 6, 1));

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

  private handleFriendlyUnitClick(pos: Axial): SelectHexResult | null{
    const unit = this.getUnitAt(pos);
    if (!unit) return null;

    // English comment: Only react to friendly unit clicks
    if (unit.owner !== this.state.currentPlayer) return null;

     // English comment: If the player clicked their own HQ, return an HQ-event
    if (unit.type === UnitType.MilitaryBase) {
      // Clear overlays so UI stays clean
      this.state.selectedUnit = null;
      this.state.reachableTiles = {};
      this.state.attackOverlay = {};
      return { kind: "headquarter", unit };
    }
    
    
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

    return { kind: "none" };
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

  public getBalance(player: number): number {
    return this.state.playerBalances[player] ?? 0;
  }

  public addBalance(player: number, amount: number): void {
    const old = this.getBalance(player);
    this.state.playerBalances[player] = old + amount;
  }

  public canAfford(player: number, cost: number): boolean {
    return this.getBalance(player) >= cost;
  }

  public spend(player: number, cost: number): boolean {
    if (!this.canAfford(player, cost)) return false;
    this.state.playerBalances[player] = this.getBalance(player) - cost;
    return true;
  }
  public beginPurchase(hqUnit: Unit, unitType: UnitType): void {
    this.pendingPurchase = { unitType, owner: hqUnit.owner };
    this.state.selectedUnit = null;
    this.state.attackOverlay = {};

    const probeUnit = new Unit(unitType, hqUnit.q, hqUnit.r, hqUnit.owner);
    this.state.reachableTiles = this.movementSystem.computeReachableTiles(
      this.state,
      probeUnit,
      (q, r) => this.getNeighbors(q, r)
    );
  }

  public cancelPurchase(): void {
    this.pendingPurchase = null;
    this.state.reachableTiles = {};
  }

  private handlePurchasePlacement(pos: Axial): boolean {
    if (!this.pendingPurchase) return false;
    const k = MovementSystem.key(pos.q, pos.r);
    if (this.state.reachableTiles[k] === undefined) return false;

    const { unitType, owner } = this.pendingPurchase;
    const cost = UNIT_TYPES[unitType].price;
    if (!this.spend(owner, cost)) {
      this.cancelPurchase();
      return false;
    }

    this.state.units.push(new Unit(unitType, pos.q, pos.r, owner));
    this.pendingPurchase = null;
    this.state.reachableTiles = {};
    this.state.selectedHex = { q: pos.q, r: pos.r };
    return true;
  }

  public configureAi(player: PlayerId | null, difficultyMultiplier = 1): void {
    this.aiPlayer = player;
    this.aiDifficultyMultiplier = Math.max(1, difficultyMultiplier);
  }

  private applyTurnIncome(player: PlayerId): void {
    const multiplier = this.getIncomeMultiplier(player);
    this.addBalance(player, 10 * multiplier);

    for (const unit of this.state.units) {
      if (unit.owner !== player) continue;
      const tile = this.getTile({ q: unit.q, r: unit.r });
      if (!tile) continue;

      if (tile.field === FieldType.City) {
        this.addBalance(player, 50 * multiplier);
      } else if (tile.field === FieldType.Industry) {
        this.addBalance(player, 40 * multiplier);
      }
    }
  }

  private getIncomeMultiplier(player: PlayerId): number {
    if (this.aiPlayer === null) return 1;
    if (this.aiPlayer !== player) return 1;
    return this.aiDifficultyMultiplier;
  }

  private setStartUnits(): void {
    // English comment: Reset units
    this.state.units = [];

    const width = this.state.mapWidth;
    const height = this.state.mapHeight;

    const maxAttempts = width * height;

    const leftMaxColExclusive = Math.floor(width / 3);
    const rightMinColInclusive = Math.floor((width * 2) / 3);

    // --- Helper: shuffle array in place
    const shuffleInPlace = <T,>(arr: T[]): void => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
    };

    // --- Helper: land check (territory==0 in your old C++ => here: not Ocean)
    const isLand = (tile: HexTile | undefined): tile is HexTile => {
      if (!tile) return false;
      if (tile.field === FieldType.Ocean) return false;
      return true;
    };

    // --- Helper: unit occupancy check
    const isOccupied = (q: number, r: number): boolean => {
      return this.state.units.some((u) => u.q === q && u.r === r);
    };

    // --- Helper: BFS land reachability between two axial positions
    const canReachByLand = (start: Axial, goal: Axial): boolean => {
      const startTile = this.getTile(start);
      const goalTile = this.getTile(goal);
      if (!isLand(startTile) || !isLand(goalTile)) return false;

      const key = (q: number, r: number) => `${q},${r}`;
      const visited = new Set<string>();
      const queue: Axial[] = [{ q: start.q, r: start.r }];

      visited.add(key(start.q, start.r));

      while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur) continue;

        if (cur.q === goal.q && cur.r === goal.r) return true;

        const neighbors = this.getNeighbors(cur.q, cur.r);
        for (const n of neighbors) {
          if (!isLand(n)) continue;

          const k = key(n.q, n.r);
          if (visited.has(k)) continue;

          visited.add(k);
          queue.push({ q: n.q, r: n.r });
        }
      }

      return false;
    };

    // --- Helper: find a base position in a col range with >=3 free land neighbors
    const findBaseAndNeighbors = (
      owner: PlayerId,
      colMinInclusive: number,
      colMaxExclusive: number,
      mustConnectTo?: Axial
    ): { base: Axial; neighbors: HexTile[] } | null => {
      for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const row = Math.floor(Math.random() * height);
        const col = Math.floor(Math.random() * (colMaxExclusive - colMinInclusive)) + colMinInclusive;

        const baseTile = this.getTileByColRow(col, row);
        if (!isLand(baseTile)) continue;

        // Avoid overlap
        if (isOccupied(baseTile.q, baseTile.r)) continue;

        // Optional: must be land-connected to other base
        if (mustConnectTo) {
          if (!canReachByLand({ q: baseTile.q, r: baseTile.r }, mustConnectTo)) continue;
        }

        // Get neighbors and filter to free land tiles
        const neigh = this.getNeighbors(baseTile.q, baseTile.r)
          .filter(isLand)
          .filter((t) => !isOccupied(t.q, t.r));

        if (neigh.length < 3) continue;

        shuffleInPlace(neigh);

        return {
          base: { q: baseTile.q, r: baseTile.r },
          neighbors: neigh,
        };
      }

      return null;
    };

    // --- Place Player 0
    const p0 = findBaseAndNeighbors(0, 0, leftMaxColExclusive);
    if (!p0) {
      throw new Error("Failed to place starting units for Player 0. Create a new map!");
    }
    const base0 = p0.base;
    const neigh0 = p0.neighbors;
    // English comment: TypeScript safety guard
    if (!neigh0[0] || !neigh0[1] || !neigh0[2]) {
      throw new Error("Internal error: not enough neighbors for Player 0 base");
    }
    // Place units adjacent to base (2 infantry + 1 machine gun)
    this.state.units.push(new Unit(UnitType.Infantry, neigh0[0].q, neigh0[0].r, 0));
    this.state.units.push(new Unit(UnitType.Cavalry, neigh0[1].q, neigh0[1].r, 0));
    this.state.units.push(new Unit(UnitType.MachnineGun, neigh0[2].q, neigh0[2].r, 0));
    this.state.units.push(new Unit(UnitType.MilitaryBase, base0.q, base0.r, 0));

    // --- Place Player 1 (must be connected by land to p0 base)
    const p1 = findBaseAndNeighbors(1, rightMinColInclusive, width, p0.base);
    if (!p1) {
      throw new Error("Failed to place starting units for Player 1. Create a new map!");
    }
     if (!p1.neighbors[0] || !p1.neighbors[1] || !p1.neighbors[2]) {
      throw new Error("Internal error: not enough neighbors for Player 1 base");
    }
    this.state.units.push(new Unit(UnitType.Infantry, p1.neighbors[0].q, p1.neighbors[0].r, 1));
    this.state.units.push(new Unit(UnitType.Cavalry, p1.neighbors[1].q, p1.neighbors[1].r, 1));
    this.state.units.push(new Unit(UnitType.MachnineGun, p1.neighbors[2].q, p1.neighbors[2].r, 1));
    this.state.units.push(new Unit(UnitType.MilitaryBase, p1.base.q, p1.base.r, 1));
  }

}

 