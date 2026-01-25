import { GameCore } from "./core/gameCore";
import { pixelToAxial } from "./core/hexMath";
import type { CombatPreview, CombatPreviewEntry, PlayerId, SelectHexResult} from "./core/types";
import { Unit } from "./core/units/unit";
import { FxAudioController, MovementAudioController } from "./audio/movementAudio";
import { CanvasRenderer } from "./render/canvasRenderer";
import { showCombatDialog } from "./ui/combatDialog";
import { showHeadquarterDialog } from "./ui/headquarterDialog";
import { showStartDialog } from "./ui/startDialog";
import { showSettingsDialog } from "./ui/settingsDialog";
import { showWinDialog } from "./ui/winDialog";
import { PLAYER_NAMES } from "./core/types";
import type { SettingsState } from "./ui/settingsDialog";
import { aiDifficultyMultipliers } from "./core/systems/aiSystem";

const BASE_HEX_SIZE = 64;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, BASE_HEX_SIZE);
const game = new GameCore(20,20); // 20x20 map
renderer.setInvalidateHandler(renderAll);
const AI_PLAYER_ID: PlayerId = 1;
const UNIT_ANIMATION_EPSILON = 0.001;
const AI_COMBAT_ZOOM_TARGET = 1.8;
const AI_COMBAT_ZOOM_DURATION_MS = 450;
const AI_COMBAT_DIALOG_DELAY_MS = 1500;
const centeredAiUnits = new Set<Unit>();

// HUD elements
const hudTurn = document.getElementById("hudTurn") as HTMLSpanElement;
const hudPlayer = document.getElementById("hudPlayer") as HTMLSpanElement;
const hudBalance = document.getElementById("hudBalance") as HTMLSpanElement;
const hudSelected = document.getElementById("hudSelected") as HTMLSpanElement;
const hudUnitImage = document.getElementById("hudUnitImage") as HTMLImageElement;
const hudUnitHp = document.getElementById("hudUnitHp") as HTMLSpanElement;
const hudUnitOffense = document.getElementById("hudUnitOffense") as HTMLSpanElement;
const hudUnitDefense = document.getElementById("hudUnitDefense") as HTMLSpanElement;
const hudUnitExperience = document.getElementById("hudUnitExperience") as HTMLSpanElement;
const hudZoom = document.getElementById("hudZoom") as HTMLSpanElement;
const hudFlag = document.getElementById("hudFlag") as HTMLImageElement | null;
const hudEndTurn = document.getElementById("hudEndTurn") as HTMLButtonElement | null;
const hudSettings = document.getElementById("hudSettings") as HTMLImageElement | null;
// App root for dialogs
const appRoot = document.getElementById("app");

let settingsState: SettingsState = {
  fullscreen: true,
  aiDifficulty: "normal",
  animationsEnabled: true,
  animationSpeed: 2,
  soundEffectsEnabled: true,
  soundEffectsVolume: 0.7,
};

game.configureAnimations(settingsState.animationSpeed, settingsState.animationsEnabled);
const movementAudio = new MovementAudioController({
  enabled: settingsState.soundEffectsEnabled,
  volume: settingsState.soundEffectsVolume,
});
const fxAudio = new FxAudioController({
  enabled: settingsState.soundEffectsEnabled,
  volume: settingsState.soundEffectsVolume,
});


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
    if (isInputBlocked()) {
      return;
    }
    openStartDialog();
  });
}

// End turn button
if (hudEndTurn) {
  hudEndTurn.addEventListener("click", () => {
    if (isInputBlocked()) {
      return;
    }
    const aiPreviews = game.endTurn();
    renderAll();
    if (aiPreviews.length > 0) {
      showAiCombatDialogs(aiPreviews);
    }
  });
}

// --- Mouse interaction state ---
let isMouseDown = false;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let isTouchDown = false;
let isTouchDragging = false;
let isPinchZooming = false;
let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDistance = 0;
let touchStartedInCanvas = false;


// If mouse moved more than this, treat as drag
const DRAG_THRESHOLD_PX = 3;
const isInputBlocked = (): boolean => game.hasActiveUnitAnimations();

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
  if (isInputBlocked()) {
    return;
  }
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
  if (isInputBlocked()) {
    return;
  }
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
  if (isInputBlocked()) {
    isMouseDown = false;
    isDragging = false;
    return;
  }
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

function getTouchPoint(touch: Touch): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}

function getTouchDistance(t1: Touch, t2: Touch): number {
  const p1 = getTouchPoint(t1);
  const p2 = getTouchPoint(t2);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

function getTouchCenter(t1: Touch, t2: Touch): { x: number; y: number } {
  const p1 = getTouchPoint(t1);
  const p2 = getTouchPoint(t2);
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

canvas.addEventListener("touchstart", function (ev) {
  if (isInputBlocked()) {
    return;
  }
  if (ev.touches.length === 1 ) {
    const touch = ev.touches[0];
     if (!touch) {
      return;
    }
    const point = getTouchPoint(touch);
    isTouchDown = true;
    isTouchDragging = false;
    isPinchZooming = false;
    lastTouchX = point.x;
    lastTouchY = point.y;
    touchStartedInCanvas = true;
  } else if (ev.touches.length === 2) {
    isTouchDown = false;
    isTouchDragging = false;
    isPinchZooming = true;
    lastPinchDistance = getTouchDistance(ev.touches[0]!, ev.touches[1]!);
    touchStartedInCanvas = true;
  }
}, { passive: true });

canvas.addEventListener("touchmove", function (ev) {
  if (isInputBlocked()) {
    return;
  }
  if (!touchStartedInCanvas) {
    return;
  }
  ev.preventDefault();

  if (ev.touches.length === 1 && !isPinchZooming) {
    const touch = ev.touches[0];
    const point = getTouchPoint(touch!);
    const dx = point.x - lastTouchX;
    const dy = point.y - lastTouchY;

    if (!isTouchDragging) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist >= DRAG_THRESHOLD_PX) {
        isTouchDragging = true;
      }
    }

    if (isTouchDragging) {
      renderer.panBy(dx, dy);
      renderAll();
    }

    lastTouchX = point.x;
    lastTouchY = point.y;
  } else if (ev.touches.length === 2) {
    const distance = getTouchDistance(ev.touches[0]!, ev.touches[1]!);
    const center = getTouchCenter(ev.touches[0]!, ev.touches[1]!);

    if (lastPinchDistance > 0) {
      const zoomFactor = distance / lastPinchDistance;
      if (Math.abs(zoomFactor - 1) > 0.0001) {
        renderer.zoomAtScreenPoint(center.x, center.y, zoomFactor);
        renderAll();
      }
    }

    isPinchZooming = true;
    isTouchDown = false;
    lastPinchDistance = distance;
  }
}, { passive: false });

canvas.addEventListener("touchend", function (ev) {
  if (isInputBlocked()) {
    isTouchDown = false;
    isTouchDragging = false;
    isPinchZooming = false;
    touchStartedInCanvas = false;
    return;
  }

  if (ev.touches.length === 0) {
    const wasDragging = isTouchDragging;
    const wasPinching = isPinchZooming;
    isTouchDown = false;
    isTouchDragging = false;
    isPinchZooming = false;
    touchStartedInCanvas = false;

    if (wasDragging || wasPinching) {
      return;
    }

    const touch = ev.changedTouches[0];
    if (!touch) {
      return;
    }
    const point = getTouchPoint(touch);
    const world = renderer.screenToWorld(point.x, point.y);
    const hex = pixelToAxial(world.x, world.y, renderer.getHexSize());
    const res = game.selectHex(hex);
    if (res.kind === "combat") {
      combatDialog(res.preview);
    } else if (res.kind === "headquarter") {
      headquarterDialog(res);
    } else {
      renderAll();
    }
  } else if (ev.touches.length === 1) {
    const touch = ev.touches[0];
    if (!touch) {
      return;
    }
    const point = getTouchPoint(touch);
    isTouchDown = true;
    isTouchDragging = false;
    isPinchZooming = false;
    lastTouchX = point.x;
    lastTouchY = point.y;
    touchStartedInCanvas = true;
  }
}, { passive: true });

canvas.addEventListener("touchcancel", function () {
  isTouchDown = false;
  isTouchDragging = false;
  isPinchZooming = false;
  touchStartedInCanvas = false;
});
// Wheel zoom
canvas.addEventListener("wheel", function (ev) {
  ev.preventDefault(); // prevent page scroll
  if (isInputBlocked()) {
    return;
  }
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
  hudBalance.textContent = String(state.playerBalances[state.currentPlayer] ?? 0);

  if (hudFlag) {
    // English comment: Update flag image based on current player id
    hudFlag.src = `/images/flags/player${state.currentPlayer}.png`;
  }


  if (state.selectedHex) {
    const tile = game.getTile(state.selectedHex);
    hudSelected.textContent = `q=${state.selectedHex.q}, r=${state.selectedHex.r}, col=${tile?.col}, row=${tile?.row}`;
  } else {
    hudSelected.textContent = "-";
  }

  if (state.selectedUnit !== null) {
    const unit = state.selectedUnit;
    hudUnitImage.src = `/images/units/${unit.data.spriteKey}.png`;
    hudUnitImage.alt = unit.data.name;
    hudUnitImage.classList.remove("is-hidden");
    hudUnitHp.textContent = `${unit.hp}/${unit.maxHP}`;
    hudUnitOffense.textContent = String(unit.offense);
    hudUnitDefense.textContent = String(unit.defense);
    hudUnitExperience.textContent = String(unit.experience);
  } else {
    hudUnitImage.src = "";
    hudUnitImage.alt = "Selected unit";
    hudUnitImage.classList.add("is-hidden");
    hudUnitHp.textContent = "-";
    hudUnitOffense.textContent = "-";
    hudUnitDefense.textContent = "-";
    hudUnitExperience.textContent = "-";
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
  if (isInputBlocked()) {
    return;
  }

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
  const didFocusAiMovement = focusOnAiMoveStart();
  if (didFocusAiMovement) {
    didChange = true;
  }
  const didAnimateUnits = game.advanceUnitAnimations(dt);
  if (didAnimateUnits) {
    didChange = true;
  }
  movementAudio.update(game.getState().units);

  // Pan movement
  let dx = 0;
  let dy = 0;

  if (!isInputBlocked()) {
    if (panLeft) dx -= 1;
    if (panRight) dx += 1;
    if (panUp) dy -= 1;
    if (panDown) dy += 1;
  } else {
    panLeft = false;
    panRight = false;
    panUp = false;
    panDown = false;
    zoomIn = false;
    zoomOut = false;
    fastMode = false;
  }

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
  if (!isInputBlocked()&& zoomIn && !zoomOut) {
    const factor = Math.pow(ZOOM_SPEED, dt);
    renderer.zoomAtCenter(factor);
    didChange = true;
  } else if (!isInputBlocked() && zoomOut && !zoomIn) {
    const factor = Math.pow(ZOOM_SPEED, dt);
    renderer.zoomAtCenter(1.0 / factor);
    didChange = true;
  }

  if (didChange) {
    renderAll();
  }

  requestAnimationFrame(animationLoop);
}

function focusOnAiMoveStart(): boolean {
  const state = game.getState();
  let didFocus = false;

  for (const unit of state.units) {
    const atTarget =
      Math.abs(unit.pos.q - unit.q) <= UNIT_ANIMATION_EPSILON &&
      Math.abs(unit.pos.r - unit.r) <= UNIT_ANIMATION_EPSILON;
    if (atTarget && centeredAiUnits.has(unit)) {
      centeredAiUnits.delete(unit);
    }
  }

  for (const unit of state.units) {
    if (unit.owner !== AI_PLAYER_ID) {
      continue;
    }

    if (unit.animationPath.length > 0 && !centeredAiUnits.has(unit)) {
      renderer.centerOnAxial(unit.pos.q, unit.pos.r);
      centeredAiUnits.add(unit);
      didFocus = true;
      break;
    }
  }

  return didFocus;
}

function combatDialog(preview: CombatPreview): void {
  if (appRoot) {
      // We need attacker/defender objects for the header display
      //console.log("AttackerPos:", preview.attackerPos.q, preview.attackerPos.r, "DefenderPos:", preview.defenderPos.q, preview.defenderPos.r);
      const attacker = game.getUnitAt(preview.attackerPos);
      const defender = game.getUnitAt(preview.defenderPos);
      //console.log("Attacker:", attacker, "Defender:", defender);
      if (attacker && defender) {
        game.setCombatOverlay(preview.attackerPos, preview.defenderPos);
        renderAll();
        showCombatDialog(appRoot, attacker, defender, preview, {
          onOk: () => {
            const destroyedUnits = game.applyCombat(preview);
            if (destroyedUnits > 0) {
              fxAudio.playUnitDestroyed();
            }
            game.clearCombatOverlay();
            renderAll();
            const state = game.getState();
            if (state.gameOver && state.winner !== null) {
              openWinDialog(state.winner);
            }
          },
          
        });
      }
    }
}

function animateZoomTo(
  targetZoom: number,
  durationMs: number,
  onComplete: () => void
): void {
  const startZoom = renderer.getZoom();
  if (Math.abs(targetZoom - startZoom) < 0.001 || durationMs <= 0) {
    onComplete();
    return;
  }

  const startTime = performance.now();
  const step = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const nextZoom = startZoom + (targetZoom - startZoom) * eased;
    const currentZoom = renderer.getZoom();
    const zoomFactor = nextZoom / currentZoom;
    if (Math.abs(zoomFactor - 1) > 0.0001) {
      renderer.zoomAtCenter(zoomFactor);
      renderAll();
    }
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onComplete();
    }
  };

  requestAnimationFrame(step);
}


function showAiCombatDialogs(previews: CombatPreviewEntry[]): void {
  if (!appRoot) {
    return;
  }

  const queue = [...previews];

  const showNext = async () => {
    const entry = queue.shift();
    if (!entry) {
      return;
    }

    const attacker = Unit.fromSaved(entry.attacker);
    const defender = Unit.fromSaved(entry.defender);
    game.setCombatOverlay(entry.preview.attackerPos, entry.preview.defenderPos);
    renderer.centerOnAxial(entry.preview.attackerPos.q, entry.preview.attackerPos.r);
    renderAll();

   

    const currentZoom = renderer.getZoom();
    const showDialog = () => {
      showCombatDialog(appRoot, attacker, defender, entry.preview, {
        onOk: () => {
          const destroyedUnits = game.applyCombat(entry.preview);
          if (destroyedUnits > 0) {
            fxAudio.playUnitDestroyed();
          }
          game.clearCombatOverlay();
          renderAll();
          const state = game.getState();
          if (state.gameOver && state.winner !== null) {
            openWinDialog(state.winner);
            return;
          }
          showNext();
        },
      });
    };

    const startDialogDelay = () => {
      window.setTimeout(showDialog, AI_COMBAT_DIALOG_DELAY_MS);
    };

    if (currentZoom < AI_COMBAT_ZOOM_TARGET) {
      animateZoomTo(AI_COMBAT_ZOOM_TARGET, AI_COMBAT_ZOOM_DURATION_MS, startDialogDelay);
    } else {
      startDialogDelay();
    }
  };

  showNext();
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
  exitFullscreen();

  showStartDialog(appRoot, {
    resumeEnabled: !game.getState().gameOver,
    onResume: () => {
      applyFullscreenPreference();
      renderAll();
    },
    onSave: () => {
      saveGameToFile();
      applyFullscreenPreference();      
    },
    onLoad: () => {
      loadGameFromFile(() => {
        applyFullscreenPreference();
      });
    },
    onStartNew: () => {
      game.configureAi(1, aiDifficultyMultipliers[settingsState.aiDifficulty]);
      game.startNewGame();
      applyFullscreenPreference();
      renderAll();
    },
    onOpenSettings: () => {
      openSettingsDialog();
    },
  });
}

function openSettingsDialog(): void {
  if (!appRoot) {
    return;
  }

  showSettingsDialog(appRoot, {
    initialState: settingsState,
    onApply: (nextState) => {
      settingsState = nextState;
      game.configureAi(1, aiDifficultyMultipliers[settingsState.aiDifficulty]);
      game.configureAnimations(settingsState.animationSpeed, settingsState.animationsEnabled);
      movementAudio.setEnabled(settingsState.soundEffectsEnabled);
      movementAudio.setVolume(settingsState.soundEffectsVolume);
      fxAudio.setEnabled(settingsState.soundEffectsEnabled);
      fxAudio.setVolume(settingsState.soundEffectsVolume);
      openStartDialog();
    },
    onCancel: () => {
      openStartDialog();
    },
  });
}

function openWinDialog(winner: PlayerId): void {
  if (!appRoot) {
    return;
  }

  showWinDialog(appRoot, winner, {
    onOk: () => {
      openStartDialog();
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

function loadGameFromFile(onSelected?: () => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    onSelected?.();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(reader.result);
        game.loadState(parsed);
        game.configureAi(1, aiDifficultyMultipliers[settingsState.aiDifficulty]);
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

function requestFullscreen(): void {
  const root = document.documentElement;
  if (!root.requestFullscreen) {
    return;
  }
  void root.requestFullscreen().catch((error) => {
    console.warn("Failed to enter fullscreen mode.", error);
  });
}

function exitFullscreen(): void {
  if (!document.fullscreenElement || !document.exitFullscreen) {
    return;
  }
  void document.exitFullscreen().catch((error) => {
    console.warn("Failed to exit fullscreen mode.", error);
  });
}

function applyFullscreenPreference(): void {
  if (settingsState.fullscreen) {
    requestFullscreen();
    return;
  }
  exitFullscreen();
}



// Start loop
requestAnimationFrame(animationLoop);
