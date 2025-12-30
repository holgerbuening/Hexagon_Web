import { GameCore } from "./core/gameCore";
import { pixelToAxial } from "./core/hexMath";
import { CanvasRenderer } from "./render/canvasRenderer";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, 38);
const game = new GameCore(4);

// HUD elements
const hudTurn = document.getElementById("hudTurn") as HTMLSpanElement;
const hudPlayer = document.getElementById("hudPlayer") as HTMLSpanElement;
const hudSelected = document.getElementById("hudSelected") as HTMLSpanElement;
const hudZoom = document.getElementById("hudZoom") as HTMLSpanElement;

// Render once initially
resizeCanvasToDisplaySize(canvas);
renderAll();

// --- Mouse interaction state ---
let isMouseDown = false;
let isDragging = false;
let lastX = 0;
let lastY = 0;

// If mouse moved more than this, treat as drag
const DRAG_THRESHOLD_PX = 3;

canvas.addEventListener("mousedown", function (ev) {
  if (ev.button !== 0) {
    return;
  }
  isMouseDown = true;
  isDragging = false;

  const rect = canvas.getBoundingClientRect();
  lastX = ev.clientX - rect.left;
  lastY = ev.clientY - rect.top;
});

canvas.addEventListener("mousemove", function (ev) {
  if (!isMouseDown) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

  const dx = x - lastX;
  const dy = y - lastY;

  if (!isDragging) {
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist >= DRAG_THRESHOLD_PX) {
      isDragging = true;
    }
  }

  if (isDragging) {
    // Pan in screen space
    renderer.panBy(dx, dy);
    renderAll();
  }

  lastX = x;
  lastY = y;
});

canvas.addEventListener("mouseup", function (ev) {
  if (ev.button !== 0) {
    return;
  }
  isMouseDown = false;

  // If it was a drag, do not treat as click
  if (isDragging) {
    isDragging = false;
    return;
  }

  // Otherwise: click selects hex
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;

  const world = renderer.screenToWorld(sx, sy);
  const hex = pixelToAxial(world.x, world.y, renderer.getHexSize());

  game.selectHex(hex);
  renderAll();
});

// Stop dragging if mouse leaves canvas
canvas.addEventListener("mouseleave", function () {
  isMouseDown = false;
  isDragging = false;
});

// Wheel zoom
canvas.addEventListener("wheel", function (ev) {
  ev.preventDefault(); // prevent page scroll

  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;

  // Wheel delta: negative = zoom in, positive = zoom out (typical)
  let factor = 1.0;

  if (ev.deltaY < 0) {
    factor = 1.1;
  } else if (ev.deltaY > 0) {
    factor = 1.0 / 1.1;
  }

  renderer.zoomAtScreenPoint(sx, sy, factor);
  renderAll();
}, { passive: false });

// Press space to end turn
window.addEventListener("keydown", function (ev) {
  if (ev.code === "Space") {
    game.endTurn();
    renderAll();
  }
});

function updateHud(): void {
  const state = game.getState();

  hudTurn.textContent = String(state.turn);
  hudPlayer.textContent = String(state.currentPlayer);

  if (state.selectedHex) {
    hudSelected.textContent = `q=${state.selectedHex.q}, r=${state.selectedHex.r}`;
  } else {
    hudSelected.textContent = "-";
  }

  hudZoom.textContent = renderer.getZoom().toFixed(2);
}

function renderAll(): void {
  renderer.render(game.getState());
  updateHud();
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();

  const displayWidth = Math.floor(rect.width);
  const displayHeight = Math.floor(rect.height);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    return true;
  }

  return false;
}

window.addEventListener("resize", function () {
  const resized = resizeCanvasToDisplaySize(canvas);
  if (resized) {
    renderAll();
  }
});

