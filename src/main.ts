import { GameCore } from "./core/gameCore";
import { pixelToAxial } from "./core/hexMath";
import type { CombatPreview, SelectHexResult} from "./core/types";
import { CanvasRenderer } from "./render/canvasRenderer";
import { showCombatDialog } from "./ui/combatDialog";
import { showHeadquarterDialog } from "./ui/headquarterDialog";
import { showStartDialog } from "./ui/startDialog";
import { PLAYER_NAMES } from "./core/types";

const BASE_HEX_SIZE = 64;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, BASE_HEX_SIZE);
const game = new GameCore(20,20); // 20x20 map
renderer.setInvalidateHandler(renderAll);


// HUD elements
const hudTurn = document.getElementById("hudTurn") as HTMLSpanElement;
const hudPlayer = document.getElementById("hudPlayer") as HTMLSpanElement;
const hudSelected = document.getElementById("hudSelected") as HTMLSpanElement;
const hudUnit = document.getElementById("hudUnit") as HTMLSpanElement;
const hudZoom = document.getElementById("hudZoom") as HTMLSpanElement;
const hudFlag = document.getElementById("hudFlag") as HTMLImageElement | null;
const hudEndTurn = document.getElementById("hudEndTurn") as HTMLButtonElement | null;
const hudSettings = document.getElementById("hudSettings") as HTMLImageElement | null;
// App root for dialogs
const appRoot = document.getElementById("app");

// Render once initially
resizeCanvasToDisplaySize(canvas);
const centerTile = game.tryGetMapCenterTile();
renderer.resetView();
if (centerTile) {
  renderer.centerOnAxial(centerTile.q, centerTile.r);
}
renderAll();
// Show start dialog
openStartDialog();

if (hudSettings) {
  hudSettings.addEventListener("click", () => {
    openStartDialog();
  });
}

// End turn button
if (hudEndTurn) {
  hudEndTurn.addEventListener("click", () => {
    game.endTurn();
    renderAll();
  });
}

// --- Mouse interaction state ---
let isMouseDown = false;
let isDragging = false;
let lastX = 0;
let lastY = 0;

// If mouse moved more than this, treat as drag
const DRAG_THRESHOLD_PX = 3;

// --- Keyboard control state ---
let panLeft = false;
let panRight = false;
let panUp = false;
let panDown = false;

let zoomIn = false;
let zoomOut = false;
let fastMode = false;

let lastFrameTimeMs = 0;

// Pan speed in pixels per second (screen space)
const PAN_SPEED = 700;

// Zoom speed factor per second (smooth exponential feel)
const ZOOM_SPEED = 1.8;



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

  const res = game.selectHex(hex);
  //console.log("Selected hex:", hex, "Combat preview Main.ts :", preview);
  if (res.kind === "combat") {
    combatDialog( res.preview);
  } 
  else if (res.kind === "headquarter") {
    headquarterDialog( res);
  }
  else {
    renderAll();
  }
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


function updateHud(): void {
  const state = game.getState();

  hudTurn.textContent = String(state.turn);
  hudPlayer.textContent = PLAYER_NAMES[state.currentPlayer];
  
  if (hudFlag) {
    // English comment: Update flag image based on current player id
    hudFlag.src = `flags/player${state.currentPlayer}.png`;
  }


  if (state.selectedHex) {
    const tile = game.getTile(state.selectedHex);
    hudSelected.textContent = `q=${state.selectedHex.q}, r=${state.selectedHex.r}, col=${tile?.col}, row=${tile?.row}`;
  } else {
    hudSelected.textContent = "-";
  }

  if (state.selectedUnit !== null) {
      const unit = state.units.find(u => u === state.selectedUnit);
      if (unit) {
        // Show basic unit info (extend later with unit type/stats)
        hudUnit.textContent = ` owner=${unit.owner}, hp=${unit.hp}, mv=${unit.remainingMovement}`;
      } else {
        hudUnit.textContent = "-";
      }
    } else {
      hudUnit.textContent = "-";
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

window.addEventListener("keydown", function (ev) {
  // Existing: Space ends turn
  if (ev.code === "Space" || ev.code === " " || ev.code === "Escape" || ev.code === "KeyP") {
    ev.preventDefault();
    openStartDialog();
    return;
  }

  // Reset view
  if (ev.code === "Digit0" || ev.code === "Numpad0") {
    renderer.resetView();
    const centerTile = game.tryGetMapCenterTile();
    if (centerTile) {
      renderer.centerOnAxial(centerTile.q, centerTile.r);
    }
    renderAll();
    return;
  }

  // Pan keys
  if (ev.code === "ArrowLeft" || ev.code === "KeyA") {
    panLeft = true;
  } else if (ev.code === "ArrowRight" || ev.code === "KeyD") {
    panRight = true;
  } else if (ev.code === "ArrowUp" || ev.code === "KeyW") {
    panUp = true;
  } else if (ev.code === "ArrowDown" || ev.code === "KeyS") {
    panDown = true;
  }

  //fast mode
  if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") {
    fastMode = true;

  }

  // Zoom keys (+/- and numpad)
  if (ev.code === "KeyE" || ev.code === "NumpadAdd") {
    zoomIn = true;
    ev.preventDefault();
  } else if (ev.code === "KeyQ" || ev.code === "NumpadSubtract") {
    zoomOut = true;
    ev.preventDefault();
  }
});

window.addEventListener("keyup", function (ev) {
  if (ev.code === "ArrowLeft" || ev.code === "KeyA") {
    panLeft = false;
  } else if (ev.code === "ArrowRight" || ev.code === "KeyD") {
    panRight = false;
  } else if (ev.code === "ArrowUp" || ev.code === "KeyW") {
    panUp = false;
  } else if (ev.code === "ArrowDown" || ev.code === "KeyS") {
    panDown = false;
  }

  //fast mode
  if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") {
    fastMode = false;
  }

  if (ev.code === "KeyE" || ev.code === "NumpadAdd") {
    zoomIn = false;
  } else if (ev.code === "KeyQ" || ev.code === "NumpadSubtract") {
    zoomOut = false;
  }
});

function animationLoop(timeMs: number): void {
  if (lastFrameTimeMs === 0) {
    lastFrameTimeMs = timeMs;
  }

  const dt = (timeMs - lastFrameTimeMs) / 1000.0;
  lastFrameTimeMs = timeMs;

  let didChange = false;

  // Pan movement
  let dx = 0;
  let dy = 0;

  if (panLeft) dx -= 1;
  if (panRight) dx += 1;
  if (panUp) dy -= 1;
  if (panDown) dy += 1;

  if (dx !== 0 || dy !== 0) {
    // Normalize diagonal speed a bit
    const len = Math.sqrt(dx * dx + dy * dy);
    dx = dx / len;
    dy = dy / len;

    // Shift = faster
    // (We read modifier state via keyboard event usually; here we keep it simple:
    // you can add a separate shift flag if you want perfect behavior.)
    let speed = PAN_SPEED;
    if (fastMode) {
      speed = PAN_SPEED * 2.2;
    } 
    
    renderer.panBy(dx * speed * dt, dy * speed * dt);
    didChange = true;
  }

  // Zoom (smooth exponential)
  if (zoomIn && !zoomOut) {
    const factor = Math.pow(ZOOM_SPEED, dt);
    renderer.zoomAtCenter(factor);
    didChange = true;
  } else if (zoomOut && !zoomIn) {
    const factor = Math.pow(ZOOM_SPEED, dt);
    renderer.zoomAtCenter(1.0 / factor);
    didChange = true;
  }

  if (didChange) {
    renderAll();
  }

  requestAnimationFrame(animationLoop);
}

function combatDialog(preview: CombatPreview): void {
  if (appRoot) {
      // We need attacker/defender objects for the header display
      //console.log("AttackerPos:", preview.attackerPos.q, preview.attackerPos.r, "DefenderPos:", preview.defenderPos.q, preview.defenderPos.r);
      const attacker = game.getUnitAt(preview.attackerPos);
      const defender = game.getUnitAt(preview.defenderPos);
      //console.log("Attacker:", attacker, "Defender:", defender);
      if (attacker && defender) {
        showCombatDialog(appRoot, attacker, defender, preview, {
          onOk: () => {
            game.applyCombat(preview);
            renderAll();
          },
          
        });
      }
    }
}

function headquarterDialog(result: SelectHexResult ): void {
  const balance = game.getBalance(game.getState().currentPlayer);
  if (appRoot && result.kind === "headquarter") { 
    showHeadquarterDialog(appRoot, result.unit, {
      onClose: () => renderAll(),
      onBuy: (unitType) => {
      game.beginPurchase(result.unit, unitType);
      renderAll();
    },
   }, { balance });
  }
   else {
    renderAll();
  }
}

function openStartDialog(): void {
  if (!appRoot) {
    return;
  }

  showStartDialog(appRoot, {
    onResume: () => {
      renderAll();
    },
    onSave: () => {
      saveGameToFile();
    },
    onLoad: () => {
      loadGameFromFile();
    },
    onStartNew: () => {
      game.startNewGame();
      renderAll();
    },
  });
}

function saveGameToFile(): void {
  const saveData = game.serializeState();
  const json = JSON.stringify(saveData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hexagon-save-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadGameFromFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(reader.result);
        game.loadState(parsed);
        renderAll();
      } catch (error) {
        console.error("Failed to load save game.", error);
        window.alert("Save Game konnte nicht geladen werden.");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}



// Start loop
requestAnimationFrame(animationLoop);


