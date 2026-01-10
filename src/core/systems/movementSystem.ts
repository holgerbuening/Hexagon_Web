import type { Axial, GameState, HexTile } from "../types";
import { FieldType } from "../map/fieldTypes";
import type { Unit } from "../units/unit";

export class MovementSystem {
  public static key(q: number, r: number): string {
    // English comment: Stable key for maps/sets
    return `${q},${r}`;
  }

  private isOccupied(state: GameState, q: number, r: number): boolean {
    for (const u of state.units) {
      if (u.q === q && u.r === r) return true;
    }
    return false;
  }

  private isPassableForUnit(unit: Unit, tile: HexTile): boolean {
    // English comment: Infantry can't move on Ocean (for now)
    if (tile.field === FieldType.Ocean) return false;
    return true;
  }

  private getMovementCost(tile: HexTile): number {
    // English comment: Keep it simple and readable (no clever one-liners)
    if (tile.hasRoad) return Math.floor(this.getFieldCost(tile.field) / 2);
    return this.getFieldCost(tile.field);
  }

  private getFieldCost(field: FieldType): number {
    // English comment: Keep it simple and readable (no clever one-liners)
    if (field === FieldType.Mountain) return 3;
    if (field === FieldType.Hills) return 2;
    if (field === FieldType.Woods) return 2;
    if (field === FieldType.City) return 1;
    if (field === FieldType.Industry) return 1;
    if (field === FieldType.Farmland) return 1;
    if (field === FieldType.Ocean) return 999; // not passable for infantry
    return 1;
  }

  /**
   * Dijkstra-lite: compute all reachable tiles under movement points.
   * - movement cost depends on field
   * - cannot step onto occupied tiles
   * - excludes the start tile itself
   */
  public computeReachableTiles(
    state: GameState,
    unit: Unit,
    getNeighbors: (q: number, r: number) => HexTile[]
  ): Record<string, number> {
    const result: Record<string, number> = {};

    const startQ = unit.q;
    const startR = unit.r;

    const dist = new Map<string, number>();
    const open: { q: number; r: number; cost: number }[] = [];

    dist.set(MovementSystem.key(startQ, startR), 0);
    open.push({ q: startQ, r: startR, cost: 0 });

    while (open.length > 0) {
      // English comment: pick node with lowest cost (simple O(n) is fine for small maps)
      let bestIdx = 0;
      let bestCost = open[0] ? open[0].cost : 0;

      for (let i = 1; i < open.length; i++) {
        const entry = open[i];
        if (!entry) continue;
        if (entry.cost < bestCost) {
          bestCost = entry.cost;
          bestIdx = i;
        }
      }

      const current = open.splice(bestIdx, 1)[0];
      if (!current) continue;

      const ck = MovementSystem.key(current.q, current.r);
      const currentBest = dist.get(ck);
      if (currentBest === undefined) continue;

      if (current.cost !== currentBest) {
        // English comment: outdated entry
        continue;
      }

      const neighbors = getNeighbors(current.q, current.r);
      for (const n of neighbors) {
        if (!this.isPassableForUnit(unit, n)) continue;

        // English comment: Do not allow moving onto occupied tiles (but allow standing on own start)
        const isStart = n.q === startQ && n.r === startR;
        if (!isStart && this.isOccupied(state, n.q, n.r)) continue;

        const stepCost = this.getMovementCost(n);
        const nextCost = current.cost + stepCost;

        if (nextCost > unit.remainingMovement) continue;

        const nk = MovementSystem.key(n.q, n.r);
        const old = dist.get(nk);

        if (old === undefined || nextCost < old) {
          dist.set(nk, nextCost);
          open.push({ q: n.q, r: n.r, cost: nextCost });
        }
      }
    }

    const startKey = MovementSystem.key(startQ, startR);
    for (const [k, cost] of dist.entries()) {
      if (k === startKey) continue;
      result[k] = cost;
    }

    return result;
  }

  public tryMoveUsingReachable(
    state: GameState,
    unit: Unit,
    target: Axial,
    reachableTiles: Record<string, number>
  ): boolean {
    const k = MovementSystem.key(target.q, target.r);
    const cost = reachableTiles[k];

    if (cost === undefined) return false;

    // English comment: Safety checks
    if (this.isOccupied(state, target.q, target.r)) return false;

    // Apply move
    unit.q = target.q;
    unit.r = target.r;

    // Reduce movement points
    unit.remainingMovement = unit.remainingMovement - cost;

    return true;
  }
}
