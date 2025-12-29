import type { Axial, GameState, HexTile, Unit } from "../core/types";
import { FieldType } from "../core/types";
import { axialToPixel } from "../core/hexMath";

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private size: number;
  private originX: number;
  private originY: number;

  constructor(private canvas: HTMLCanvasElement, size: number = 38) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    this.size = size;

    // Center the board
    this.originX = Math.floor(canvas.width / 2);
    this.originY = Math.floor(canvas.height / 2);
  }

  render(state: Readonly<GameState>): void {
    this.clear();

    // Draw tiles
    for (const tile of state.tiles) {
      const isSelected = tileMatches(state.selectedHex, tile);
      this.drawTile(tile, isSelected);
    }

    // Draw units
    for (const unit of state.units) {
      this.drawUnit(unit);
    }

    // HUD text
    this.ctx.fillStyle = "black";
    this.ctx.fillText(`Turn: ${state.turn} | Player: ${state.currentPlayer}`, 10, 20);

    if (state.selectedHex) {
      this.ctx.fillText(`Selected: q=${state.selectedHex.q}, r=${state.selectedHex.r}`, 10, 40);
    }
  }

  // Convert world pixel (canvas coords) to board pixel (origin-centered)
  screenToWorld(x: number, y: number): { x: number; y: number } {
    return { x: x - this.originX, y: y - this.originY };
  }

  getHexSize(): number {
    return this.size;
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawTile(tile: HexTile, selected: boolean): void {
    const p = axialToPixel(tile.q, tile.r, this.size);
    const cx = p.x + this.originX;
    const cy = p.y + this.originY;

    // Build hex path
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const px = cx + this.size * Math.cos(angle);
      const py = cy + this.size * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }
    this.ctx.closePath();

    // Fill based on field type
    this.ctx.fillStyle = this.getTileFillColor(tile.field);
    this.ctx.fill();

    // Stroke style depending on selection
    if (selected) {
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = "#ff0000";
    } else {
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = "#333333";
    }
    this.ctx.stroke();

    // Optional: draw axial coords
    this.ctx.fillStyle = "#222222";
    this.ctx.font = "12px sans-serif";
    this.ctx.fillText(`${tile.q},${tile.r}`, cx - 16, cy + 4);
  }

  private getTileFillColor(field: FieldType): string {
    // Simple colors (replace with sprites later)
    if (field === FieldType.Plains) {
      return "#e8e2b6";
    }
    if (field === FieldType.Forest) {
      return "#b6e8b6";
    }
    return "#d0d0d0";
  }

  private drawUnit(unit: Unit): void {
    const p = axialToPixel(unit.pos.q, unit.pos.r, this.size);
    const cx = p.x + this.originX;
    const cy = p.y + this.originY;

    // Unit marker
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, this.size * 0.35, 0, Math.PI * 2);
    this.ctx.closePath();

    // Unit color per owner
    if (unit.owner === 0) {
      this.ctx.fillStyle = "#2b6cff";
    } else {
      this.ctx.fillStyle = "#ff2b2b";
    }

    this.ctx.fill();
    this.ctx.strokeStyle = "#111111";
    this.ctx.stroke();

    this.ctx.fillStyle = "white";
    this.ctx.fillText(String(unit.id), cx - 4, cy + 4);
  }
}

function tileMatches(a: Axial | null, b: Axial): boolean {
  if (!a) {
    return false;
  }
  return a.q === b.q && a.r === b.r;
}


