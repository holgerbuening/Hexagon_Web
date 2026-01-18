import type { PlayerId,Axial, GameState, HexTile } from "../core/types";
import { FieldType } from "../core/map/fieldTypes";
import { axialToPixel } from "../core/hexMath";
import type { Unit } from "../core/units/unit";

// Selection styles
const SELECT_FILL_COLOR = "rgba(0, 200, 0, 0.25)"; // semi-transparent green
const SELECT_STROKE_COLOR = "rgba(0, 180, 0, 0.9)";
const SELECT_STROKE_WIDTH = 3;





export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private size: number;

  // Camera / view transform
  private panX: number;
  private panY: number;
  private zoom: number;

  // Limits
  private minZoom: number;
  private maxZoom: number;

  // Tile image storage
  private tileImages: Map<FieldType, HTMLImageElement>;
  private tileImagesLoaded: boolean;
  private roadImages: Map<string, HTMLImageElement>;

  // Unit, flag, and rank image storage
  private unitImages: Map<string, HTMLImageElement>;
  private flagImages = new Map<PlayerId, HTMLImageElement>();
  private rankImages = new Map<number, HTMLImageElement>();

  private invalidateHandler: (() => void) | null;


  constructor(private canvas: HTMLCanvasElement, size: number = 38) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    this.size = size;

    // Start centered-ish
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;

    this.minZoom = 0.35;
    this.maxZoom = 3.0;

    this.tileImages = new Map<FieldType, HTMLImageElement>();
    this.tileImagesLoaded = false;
    this.roadImages = new Map<string, HTMLImageElement>();
    this.invalidateHandler = null;
    this.loadTileImages();
    this.loadRoadImages();
    this.unitImages = new Map<string, HTMLImageElement>();
    this.loadUnitSprites();
  }

  render(state: Readonly<GameState>): void {
    this.clear();

    this.applyCameraTransform();

    // Draw tiles
    for (const tile of state.tiles) {
      const isSelected = tileMatches(state.selectedHex, tile);
      this.drawTile(tile, isSelected);
    }
    this.drawRoads(state);
    // Draw movement overlay (yellow) BEFORE selected overlay (green)
    const keys = Object.keys(state.reachableTiles);
    for (const k of keys) {
      const parts = k.split(",");
      const q = Number(parts[0]);
      const r = Number(parts[1]);
      this.drawOverlayHex(q, r, "#FFD400", "rgba(255, 212, 0, 0.22)", 3 / this.zoom);
    }
    // Draw attack overlay (red) on enemy units in range
    const keys1 = Object.keys(state.attackOverlay);
    for (const k of keys1) {
      const parts = k.split(",");
      const q = Number(parts[0]);
      const r = Number(parts[1]);

      this.drawOverlayHex(q, r, "#ff0000", "rgba(255,0,0,0.22)", 3 / this.zoom);
    }


    // Draw units
    for (const unit of state.units) {
      this.drawUnit(unit);
    }

    // Reset transform for HUD (screen space)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Convert screen pixel (canvas coords) to world pixel (board coords, before axial conversion)
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    // Screen -> center
    const cx = screenX - this.canvas.width / 2;
    const cy = screenY - this.canvas.height / 2;

    // Remove pan, remove zoom
    const wx = (cx - this.panX) / this.zoom;
    const wy = (cy - this.panY) / this.zoom;

    return { x: wx, y: wy };
  }

  getHexSize(): number {
    return this.size;
  }

  // Pan by delta in screen pixels
  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  // Zoom around a screen point (mouse position in canvas coords)
  public zoomAtScreenPoint(screenX: number, screenY: number, zoomFactor: number): void {
    const oldZoom = this.zoom;
    let newZoom = oldZoom * zoomFactor;

    newZoom = this.clampZoom(newZoom);
    if (newZoom === oldZoom) {
      return;
    }

    // World position under the cursor before zoom
    const worldBefore = this.screenToWorld(screenX, screenY);

    // Apply new zoom
    this.zoom = newZoom;

    // World position under cursor after zoom
    const worldAfter = this.screenToWorld(screenX, screenY);

    // Adjust pan so that the world point stays under the cursor
    const dxWorld = worldAfter.x - worldBefore.x;
    const dyWorld = worldAfter.y - worldBefore.y;

    // Convert world delta to screen delta at current zoom
    this.panX += dxWorld * this.zoom;
    this.panY += dyWorld * this.zoom;
  }

  public getZoom(): number {
    return this.zoom;
  }

  private clampZoom(z: number): number {
    if (z < this.minZoom) return this.minZoom;
    if (z > this.maxZoom) return this.maxZoom;
    return z;
  }

  private applyCameraTransform(): void {
    // World origin at canvas center, then pan, then zoom
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
  }

  private clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawTile(tile: HexTile, selected: boolean): void {
    const p = axialToPixel(tile.q, tile.r, this.size);
    const cx = p.x;
    const cy = p.y;

    // Build hex path
    this.buildHexPath(cx, cy);

    // Clip to hex shape, then draw the tile image inside
    this.ctx.save();
    this.ctx.clip();

    const img = this.tileImages.get(tile.field);
    if (img && img.complete && img.naturalWidth > 0) {
      // Draw image centered. Clip will cut it to hex.
      // You can tweak the scale factor to taste.
      const scale = 1.15;

      const destH = (2 * this.size) * scale;
      const destW = destH * (img.naturalWidth / img.naturalHeight);

      this.ctx.drawImage(img, cx - destW / 2, cy - destH / 2, destW, destH);
    } else {
      // Fallback color if image not loaded yet
      this.ctx.fillStyle = this.getTileFillColor(tile.field);
      this.ctx.fill();
    }

    this.ctx.restore();

    // Stroke style depending on selection
    if (selected) {
      this.drawSelectedHex(cx, cy);
    } else {
      this.buildHexPath(cx, cy);
      this.ctx.lineWidth = 1 / this.zoom;
      this.ctx.strokeStyle = "#333333";
      this.ctx.stroke();
    }
  }

  private drawRoads(state: Readonly<GameState>): void {
    const roadTiles = state.tiles.filter((tile) => tile.hasRoad);
    if (roadTiles.length === 0) return;

    const roadKeys = new Set(roadTiles.map((tile) => MovementKey(tile.q, tile.r)));
    const directions = [
      { dq: 1, dr: 0, index: 0 },
      { dq: 0, dr: 1, index: 1 },
      { dq: -1, dr: 1, index: 2 },
      { dq: -1, dr: 0, index: 3 },
      { dq: 0, dr: -1, index: 4 },
      { dq: 1, dr: -1, index: 5 },
    ];

    for (const tile of roadTiles) {
      const p = axialToPixel(tile.q, tile.r, this.size);
      this.drawRoadImage("center", p.x, p.y);

      for (const dir of directions) {
        const neighborKey = MovementKey(tile.q + dir.dq, tile.r + dir.dr);
        if (!roadKeys.has(neighborKey)) continue;
        this.drawRoadImage(String(dir.index), p.x, p.y);
      }
    }
  }

  private drawRoadImage(key: string, x: number, y: number): void {
    const img = this.roadImages.get(key);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const scale = 1.1;
    const destH = (2 * this.size) * scale;
    const destW = destH * (img.naturalWidth / img.naturalHeight);
    this.ctx.drawImage(img, x - destW / 2, y - destH / 2, destW, destH);
  }

  private getTileFillColor(field: FieldType): string {
    if (field === FieldType.Farmland) {
      return "#e8e2b6";
    }
    if (field === FieldType.Woods) {
      return "#b6e8b6";
    }
    if (field === FieldType.Ocean) {
      return "#4eb1eaff";
    }
    if (field === FieldType.Mountain) {
      return "#a0a0a0";
    }
    if (field === FieldType.Hills) {
      return "#253921ff";
    }
    if (field === FieldType.City) {
      return "#c0c0c0";
    }
    if (field === FieldType.Industry) { 
      return "#d0d0d0";
    }
    return "#cccccc"; // default
  }

  private drawUnit(unit: Unit): void {
    const p = axialToPixel(unit.pos.q, unit.pos.r, this.size);
    this.drawUnitFlag(unit, p.x, p.y);
    this.drawUnitRank(unit, p.x, p.y);
    this.drawHpBar(unit, p.x, p.y);

    const img = this.unitImages.get(unit.data.spriteKey);

    if (!img || !img.complete) return;

     // Target size (in world units). Use ONE dimension as base.
  const targetH = (2 * this.size) * 0.7; // tweak factor to taste
  const aspect = img.naturalWidth / img.naturalHeight;
  const targetW = targetH * aspect;

  this.ctx.drawImage(
    img,
    p.x - targetW / 2,
    p.y - targetH / 2,
    targetW,
    targetH
  );
  }

  private drawUnitFlag(unit: Unit, cx: number, cy: number): void {
    const img = this.getFlagImage(unit.owner);

    if (!img.complete || img.naturalWidth <= 0) {
      return;
    }

    // Flag size in world units (zoom handled by your existing transform)
    const flagH = (2 * this.size) * 0.28; // tweak to taste
    const aspect = img.naturalWidth / img.naturalHeight;
    const flagW = flagH * aspect;

    // Offset: "top-left" relative to unit center
    const offsetX = -this.size * 0.55;
    const offsetY = -this.size * 0.55;

    const x = cx + offsetX - flagW / 2;
    const y = cy + offsetY - flagH / 2;

    this.ctx.drawImage(img, x, y, flagW, flagH);
  }

  private drawUnitRank(unit: Unit, cx: number, cy: number): void {
  const img = this.getRankImage(unit.experience);

  if (!img.complete || img.naturalWidth <= 0) {
    return;
  }

  // Rank size in world units
  const rankH = (2 * this.size) * 0.4; // tweak to taste
  const aspect = img.naturalWidth / img.naturalHeight;
  const rankW = rankH * aspect;

  // Offset: "right side" relative to unit center
  const offsetX = this.size * 0.62;
  const offsetY = 0;

  const x = cx + offsetX - rankW / 2;
  const y = cy + offsetY - rankH / 2;

  this.ctx.drawImage(img, x, y, rankW, rankH);
  }

  private drawHpBar(unit: Unit, cx: number, cy: number): void {
    const hp = this.clampHp(unit.hp);
    const hpRatio = hp / 100;

    // Hex width ~ sqrt(3) * size
    const hexWidth = Math.sqrt(3) * this.size;

    // Bar dimensions relative to hex width
    const barW = hexWidth * 0.70;
    const barH = this.size * 0.12;

    // Position: "feet" of the unit (slightly below center)
    const offsetY = this.size * 0.62;

    const x = cx - barW / 2;
    const y = cy + offsetY - barH / 2;

    // Background
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    this.ctx.fillRect(x, y, barW, barH);

    // Fill
    const fillW = barW * hpRatio;
    this.ctx.fillStyle = this.getHpBarColor(hp);
    this.ctx.fillRect(x, y, fillW, barH);

    // Border (thin)
    this.ctx.lineWidth = 1.5 / this.zoom;
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    this.ctx.strokeRect(x, y, barW, barH);
  }

  public resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
  }

  public zoomAtCenter(zoomFactor: number): void {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    this.zoomAtScreenPoint(centerX, centerY, zoomFactor);
  }

  public centerOnAxial(q: number, r: number): void {
    const p = axialToPixel(q, r, this.size);

    // We want this world position to end up at the screen center
    this.panX = -p.x*this.zoom;
    this.panY = -p.y*this.zoom;
  }

  // Load tile images from /public
  private loadTileImages(): void {
    this.addTileImage(FieldType.Farmland, "/images/tiles/farmland.png");
    this.addTileImage(FieldType.Woods, "/images/tiles/woods.png");
    this.addTileImage(FieldType.Ocean, "/images/tiles/ocean.png");
    this.addTileImage(FieldType.Mountain, "/images/tiles/mountain.png");
    this.addTileImage(FieldType.Hills, "/images/tiles/hills.png");
    this.addTileImage(FieldType.City, "/images/tiles/city.png");
    this.addTileImage(FieldType.Industry, "/images/tiles/industry.png");
  }

  private loadRoadImages(): void {
    this.addRoadImage("center", "/images/roads/roadcenter.png");
    for (let i = 0; i < 6; i += 1) {
      this.addRoadImage(String(i), `/images/roads/road${i}.png`);
    }
  }

  private addTileImage(field: FieldType, url: string): void {
    const img = new Image();

    // When the image finishes loading, request a redraw
    img.onload = this.handleAssetLoaded.bind(this);
    img.onerror = this.handleAssetLoaded.bind(this);

    img.src = url;
    this.tileImages.set(field, img);
  }
  private addRoadImage(key: string, url: string): void {
    const img = new Image();
    img.onload = this.handleAssetLoaded.bind(this);
    img.onerror = this.handleAssetLoaded.bind(this);
    img.src = url;
    this.roadImages.set(key, img);
  }

  private loadUnitSprites(): void {
    let img = new Image();
    img.src = "/images/units/infantry.png";
    this.unitImages.set("infantry", img);
    img = new Image();
    img.src = "/images/units/militarybase.png";
    this.unitImages.set("militarybase", img);
    img = new Image();
    img.src = "/images/units/machinegun.png";
    this.unitImages.set("machinegun", img);
    img = new Image();
    img.src = "/images/units/medic.png";
    this.unitImages.set("medic", img);
    img = new Image();
    img.src = "/images/units/artillery.png";
    this.unitImages.set("artillery", img);
    img = new Image();
    img.src = "/images/units/cavalry.png";
    this.unitImages.set("cavalry", img);
    img = new Image();
    img.src = "/images/units/tank.png";
    this.unitImages.set("tank", img);
    img = new Image();
    img.src = "/images/units/engineer.png";
    this.unitImages.set("engineer", img);
  }

  private getFlagImage(owner: PlayerId): HTMLImageElement {
    let img = this.flagImages.get(owner);
    if (!img) {
      img = new Image();
      img.src = `/images/flags/player${owner}.png`;
      this.flagImages.set(owner, img);
    }
    return img;
  }

  private getRankImage(experience: number): HTMLImageElement {
    const clamped = this.clampExperience(experience);

    let img = this.rankImages.get(clamped);
    if (!img) {
      img = new Image();
      img.src = `/images/rank/rank${clamped}.png`;
      this.rankImages.set(clamped, img);
    }

    return img;
  }

  private handleAssetLoaded(): void {
    if (this.invalidateHandler) {
      this.invalidateHandler();
    }
  }

  public setInvalidateHandler(handler: (() => void) | null): void {
    this.invalidateHandler = handler;
  }

  private buildHexPath(cx: number, cy: number): void {
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const px = cx + this.size * Math.cos(angle);
      const py = cy + this.size * Math.sin(angle);
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
  }

  private drawSelectedHex(cx: number, cy: number): void {
    // --- Overlay ---
    this.buildHexPath(cx, cy);
    this.ctx.shadowColor = "rgba(0, 255, 0, 0.35)";
    this.ctx.shadowBlur = 10;



    this.ctx.fillStyle = "rgba(0, 200, 0, 0.52)"; // semi-transparent green
    this.ctx.fill();

    // --- Border ---
    this.buildHexPath(cx, cy);
    this.ctx.lineWidth = 2
     / this.zoom;
    this.ctx.strokeStyle = "rgba(0, 180, 0, 0.95)";
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }
  private clampExperience(exp: number): number {
    if (exp < 0) {
      return 0;
    }
    if (exp > 10) {
      return 10;
    }
    return exp;
  }
  private clampHp(hp: number): number {
    if (hp < 0) {
      return 0;
    }
    if (hp > 100) {
      return 100;
    }
    return hp;
  }
  private getHpBarColor(hp: number): string {
    if (hp >= 70) {
      return "rgba(0, 180, 0, 0.95)"; // green
    }
    if (hp >= 35) {
      return "rgba(230, 180, 0, 0.95)"; // yellow/orange
    }
    return "rgba(200, 0, 0, 0.95)"; // red
  }
  private drawOverlayHex(
    q: number,
    r: number,
    strokeColor: string,
    fillColor: string,
    lineWidth: number
  ): void {
    const p = axialToPixel(q, r, this.size);
    const cx = p.x;
    const cy = p.y;

    this.buildHexPath(cx, cy);

    // Fill first
    this.ctx.save();
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();
    this.ctx.restore();

    // Then stroke
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.stroke();
  }
}

function tileMatches(a: Axial | null, b: Axial): boolean {
  if (!a) {
    return false;
  }
  return a.q === b.q && a.r === b.r;
}

function MovementKey(q: number, r: number): string {
  return `${q},${r}`;
}