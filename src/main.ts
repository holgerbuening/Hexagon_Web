import { showCampaignLibrary, showCampaignStory } from "./ui/campaignDialog";
import { clone, type CampaignDocument } from "./core/campaigns/documents";
import { createCampaignSave, parseCampaignSave, readCampaignProgress, writeCampaignProgress, finishCampaignMission, type CampaignSave } from "./core/campaigns/runtime";
import { consumeGameLaunch } from "./gameLaunch";
import { MapEditor } from "./core/map/mapEditor";
import { type MapDocument, serializeMapDocument } from "./core/map/mapSerializer";
import { GameCore } from "./core/gameCore";
import { axialToPixel, pixelToAxial } from "./core/hexMath";
import type { CombatPreview, CombatPreviewEntry, PlayerId, SelectHexResult} from "./core/types";
import { Unit } from "./core/units/unit";
import { FxAudioController, MovementAudioController } from "./audio/movementAudio";
import { CanvasRenderer } from "./render/canvasRenderer";
import { showCombatDialog } from "./ui/combatDialog";
import { showHeadquarterDialog } from "./ui/headquarterDialog";
import { showStartDialog } from "./ui/startDialog";
import { showSettingsDialog } from "./ui/settingsDialog";
import { showWinDialog } from "./ui/winDialog";
import { showAboutDialog } from "./ui/aboutDialog";
import { PLAYER_NAMES } from "./core/types";
import type { SettingsState } from "./ui/settingsDialog";
import { aiProfiles } from "./core/systems/aiSystem";
import { OnlineSession, RelayRequestError, type CloseReason } from "./net/onlineSession";
import { buildInviteLink, getRelayUrl, parseInviteRoom } from "./net/relayUrl";
import { isPlausibleGameState } from "./net/stateGuard";
import type { GameMessage, OnlineReplay } from "./net/protocol";
import type { SavedGameState } from "./core/types";
import { showDiscardMapDialog, describeSeat, showGameModeDialog, showInviteDialog, showNoticeDialog, type InviteDialogHandle } from "./ui/onlineDialog";

const BASE_HEX_SIZE = 64;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, BASE_HEX_SIZE);
let mapEditor: MapEditor | null = null;
let editorToolbar: HTMLElement | null = null;
const game = new GameCore(20,20); // 20x20 map
renderer.setInvalidateHandler(renderAll);
const AI_PLAYER_ID: PlayerId = 1;
const UNIT_ANIMATION_EPSILON = 0.001;
let combatIntroActive = false;
let remotePlaybackActive = false;
let remoteMessages: Promise<void> = Promise.resolve();
let pendingRemoteMessages = 0;
let aiPlaybackActive = false;
let aiPlaybackUnit: Unit | null = null;

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
const hudOnline = document.getElementById("hudOnline") as HTMLDivElement | null;
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

// Online game with a second human player. The player whose turn it is plays on their own
// copy of the game and sends the full state to the other one when the turn ends.
interface OnlineGame {
  session: OnlineSession;
  myPlayer: PlayerId;
  peerConnected: boolean;
  // Link the host sends to the opponent; the guest does not need it.
  inviteLink: string | null;
  // Dialog shown while the guest waits for the first state of the host.
  waitingDialog: { close: () => void } | null;
  inviteDialog: InviteDialogHandle | null;
}
let online: OnlineGame | null = null;
let activeCampaign: CampaignSave | null = null;
let pendingCampaignCombats: CombatPreviewEntry[] = [];
let campaignStorageWarning = "";
const campaignStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
// Incremented whenever a pending connection attempt is cancelled.
let onlineAttempt = 0;


// Prepared scenarios use the same game loop, combat UI and AI as ordinary play.
const preparedGame = consumeGameLaunch();
if (preparedGame) {
  game.loadState(preparedGame.state);
  settingsState.aiDifficulty = preparedGame.difficulty;
  settingsState.fullscreen = false;
  game.configureAi(AI_PLAYER_ID, aiProfiles[preparedGame.difficulty]);
}

// Render once initially
resizeCanvasToDisplaySize(canvas);
const centerTile = game.tryGetMapCenterTile();
renderer.resetView();
if (centerTile) {
  renderer.centerOnAxial(centerTile.q, centerTile.r);
}
renderAll();
// Show start dialog, or join the game of an invite link
const inviteRoom = parseInviteRoom(window.location.search);
if (inviteRoom) {
  void joinOnlineGame(inviteRoom);
} else if (!preparedGame) {
  openStartDialog();
}

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
    if (mapEditor || isInputBlocked() || isOpponentsTurn()) {
      return;
    }
    const aiPreviews = game.endTurn();
    if (activeCampaign) pendingCampaignCombats = [...aiPreviews];
    sendOnlineState();
    renderAll();
    void playAiTurn(aiPreviews);
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
const isInputBlocked = (): boolean => remotePlaybackActive || aiPlaybackActive || combatIntroActive || !!document.querySelector(".dialog-overlay") || (!mapEditor && game.hasActiveUnitAnimations());

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

  if (!mapEditor && isOpponentsTurn()) {
    return;
  }
  if (mapEditor) {
    mapEditor.cycle(hex);
    renderAll();
    return;
  }
  const res = game.selectHex(hex);
  if (res.kind !== "combat") sendOnlineState();
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
    if (!mapEditor && isOpponentsTurn()) {
      return;
    }
    if (mapEditor) {
      mapEditor.cycle(hex);
      renderAll();
      return;
    }
    const res = game.selectHex(hex);
  if (res.kind !== "combat") sendOnlineState();
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
  const gameState = game.getState();
  const state = mapEditor ? { ...gameState, selectedHex: null, selectedUnit: null } : gameState;

  hudTurn.textContent = String(state.turn);
  hudPlayer.textContent = online
    ? describeSeat(state.currentPlayer, online.myPlayer)
    : PLAYER_NAMES[state.currentPlayer];
  hudBalance.textContent = String(state.playerBalances[state.currentPlayer] ?? 0);
  updateOnlineHud();
  let campaignHud = document.getElementById("hudCampaign");
  if (!campaignHud && hudOnline?.parentElement) {
    campaignHud = document.createElement("div"); campaignHud.id = "hudCampaign"; campaignHud.className = "hudCampaign";
    hudOnline.parentElement.append(campaignHud);
  }
  if (campaignHud) {
    const index = activeCampaign?.campaign.missions.findIndex(m => m.id === activeCampaign?.missionId) ?? -1;
    campaignHud.textContent = activeCampaign ? `${activeCampaign.campaign.title} · Mission ${index + 1}/${activeCampaign.campaign.missions.length}${campaignStorageWarning ? " · Progress not saved — use Save Game" : ""}` : "";
  }

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
  const state = game.getState();
  renderer.render(mapEditor ? { ...state, tiles: mapEditor.document.tiles,
    mapWidth: mapEditor.document.width, mapHeight: mapEditor.document.height,
    units: [], selectedHex: null, selectedUnit: null,
    reachableTiles: {}, attackOverlay: {}, combatOverlay: {} } : state);
  updateHud();
  if (mapEditor) {
    hudPlayer.textContent = "Map Editor";
    hudTurn.textContent = "–";
    hudBalance.textContent = "–";
    hudSelected.textContent = `${mapEditor.document.width} × ${mapEditor.document.height}`;
    if (hudEndTurn) hudEndTurn.disabled = true;
    const undo = editorToolbar?.querySelector<HTMLButtonElement>("[data-undo]");
    if (undo) undo.disabled = !mapEditor.canUndo;
  }
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

  if (mapEditor && (ev.ctrlKey || ev.metaKey) && ev.code === "KeyZ") {
    ev.preventDefault();
    mapEditor.undo();
    renderAll();
    return;
  }
  // Existing: Space ends turn
  if (ev.code === "Space" || ev.code === " " || ev.code === "Escape" || ev.code === "KeyP") {
    ev.preventDefault();
    if (mapEditor) closeMapEditor();
    else openStartDialog();
    return;
  }

  // Reset view
  if (ev.code === "Digit0" || ev.code === "Numpad0") {
    renderer.resetView();
    const centerTile = mapEditor ? mapEditor.document.tiles.find(t => t.col === Math.floor(mapEditor!.document.width / 2) && t.row === Math.floor(mapEditor!.document.height / 2)) : game.tryGetMapCenterTile();
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
  const didAnimateUnits = !mapEditor && !aiPlaybackActive && game.advanceUnitAnimations(dt);
  if (didAnimateUnits) {
    didChange = true;
  }
  movementAudio.update(mapEditor ? [] : aiPlaybackActive ? (aiPlaybackUnit ? [aiPlaybackUnit] : []) : game.getState().units);

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

async function playAiTurn(previews: CombatPreviewEntry[], owner: PlayerId = AI_PLAYER_ID, isCurrent: () => boolean = () => true): Promise<void> {
  if (settingsState.animationsEnabled) {
    aiPlaybackActive = true;
    const moveCamera = (q: number, r: number, duration = 650): Promise<void> => {
      const start = renderer.getCameraCenter();
      const target = axialToPixel(q, r, renderer.getHexSize());
      const started = performance.now();
      return new Promise(resolve => {
        const step = (now: number) => {
          if (!isCurrent()) { resolve(); return; }
          const t = Math.min((now - started) / duration, 1);
          const eased = t * t * (3 - 2 * t);
          renderer.centerOnWorld(start.x + (target.x - start.x) * eased, start.y + (target.y - start.y) * eased);
          renderAll();
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    };
    try {
      // Purchases happen before troop movements; show each purchasing HQ once.
      const shownHeadquarters = new Set<string>();
      for (const hq of online ? [] : game.getAiPurchaseHeadquarters()) {
        const key = `${hq.q},${hq.r}`;
        if (shownHeadquarters.has(key)) continue;
        shownHeadquarters.add(key);
        await moveCamera(hq.q, hq.r);
        await new Promise<void>(resolve => window.setTimeout(resolve, 450));
      }
      const movingUnits = game.getState().units.filter(unit =>
        unit.owner === owner && (unit.animationPath.length > 0 ||
          Math.abs(unit.pos.q - unit.q) > UNIT_ANIMATION_EPSILON ||
          Math.abs(unit.pos.r - unit.r) > UNIT_ANIMATION_EPSILON));
      for (const unit of movingUnits) {
        if (!isCurrent()) return;
        await moveCamera(unit.pos.q, unit.pos.r);
        if (!isCurrent()) return;
        aiPlaybackUnit = unit;
        await new Promise<void>(resolve => {
          let previous = performance.now();
          const step = (now: number) => {
            if (!isCurrent()) { resolve(); return; }
            game.advanceUnitAnimations(Math.min((now - previous) / 1000, 0.1), [unit]);
            previous = now;
            renderer.centerOnAxial(unit.pos.q, unit.pos.r);
            renderAll();
            if (unit.animationPath.length > 0 ||
                Math.abs(unit.pos.q - unit.q) > UNIT_ANIMATION_EPSILON ||
                Math.abs(unit.pos.r - unit.r) > UNIT_ANIMATION_EPSILON) {
              requestAnimationFrame(step);
            } else resolve();
          };
          requestAnimationFrame(step);
        });
        aiPlaybackUnit = null;
      }
    } finally {
      aiPlaybackUnit = null;
      aiPlaybackActive = false;
    }
  }
  if (previews.length > 0) showAiCombatDialogs(previews);
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
        playCombatIntro(attacker, defender, () => showCombatDialog(appRoot, attacker, defender, preview, {
          onOk: () => {
            renderer.clearCombatPresentation();
            const before = game.serializeState();
            const destroyedUnits = game.applyCombat(preview);
            sendOnlineState({ before, preview });
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
          
        }));
      }
    }
}

function playCombatIntro(attacker: Unit, defender: Unit, onComplete: () => void, isCurrent: () => boolean = () => true): void {
  if (!settingsState.animationsEnabled) {
    onComplete();
    return;
  }

  combatIntroActive = true;
  const startCenter = renderer.getCameraCenter();
  const midpoint = axialToPixel(
    (attacker.pos.q + defender.pos.q) / 2,
    (attacker.pos.r + defender.pos.r) / 2,
    renderer.getHexSize()
  );
  const deltaQ = defender.pos.q - attacker.pos.q;
  const deltaR = defender.pos.r - attacker.pos.r;
  // Cap the approach for ranged attacks to a small fraction of one hex.
  const distance = Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaQ + deltaR), 1);
  const approach = Math.min(0.12, 0.22 / distance);
  const ease = (t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  };
  const startTime = performance.now();
  let fanfarePlayed = false;
  const step = (now: number) => {
    if (!isCurrent()) {
      renderer.clearCombatPresentation();
      combatIntroActive = false;
      onComplete();
      return;
    }
    const elapsed = now - startTime;
    const camera = ease(elapsed / 900);
    renderer.centerOnWorld(
      startCenter.x + (midpoint.x - startCenter.x) * camera,
      startCenter.y + (midpoint.y - startCenter.y) * camera
    );
    const attackerScale = 1 + ease((elapsed - 900) / 700);
    const defenderScale = 1 + ease((elapsed - 1600) / 700);
    const movement = approach * ease((elapsed - 2300) / 550);
    if (elapsed >= 2300 && !fanfarePlayed) {
      fanfarePlayed = true;
      fxAudio.playFanfare();
    }
    renderer.setCombatPresentation(attacker, attackerScale, deltaQ * movement, deltaR * movement);
    renderer.setCombatPresentation(defender, defenderScale, -deltaQ * movement, -deltaR * movement);
    renderAll();
    if (elapsed < 3000) {
      requestAnimationFrame(step);
    } else {
      combatIntroActive = false;
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

    const attacker = game.getUnitAt(entry.preview.attackerPos) ?? Unit.fromSaved(entry.attacker);
    const defender = game.getUnitAt(entry.preview.defenderPos) ?? Unit.fromSaved(entry.defender);
    game.setCombatOverlay(entry.preview.attackerPos, entry.preview.defenderPos);
    renderAll();

   

    const showDialog = () => {
      showCombatDialog(appRoot, attacker, defender, entry.preview, {
        onOk: () => {
          renderer.clearCombatPresentation();
          const destroyedUnits = game.applyCombat(entry.preview);
          if (activeCampaign) pendingCampaignCombats.shift();
          checkpointCampaign();
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

    playCombatIntro(attacker, defender, showDialog);
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
  if (mapEditor) { closeMapEditor(); return; }
  if (!appRoot) {
    return;
  }
  exitFullscreen();

  showStartDialog(appRoot, {
    onOpenEditor: openMapEditor,
    onCampaigns: openCampaigns,
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
      openGameModeDialog();
    },
    onOpenSettings: () => {
      openSettingsDialog();
    },
        onOpenAbout: () => {
      openAboutDialog();
    },
  });
}

function applyAiConfiguration(): void {
  // In an online game both players are people.
  const mission = activeCampaign?.campaign.missions.find(m => m.id === activeCampaign?.missionId);
  game.configureAi(online ? null : AI_PLAYER_ID, aiProfiles[mission?.difficulty ?? settingsState.aiDifficulty]);
}

function isOpponentsTurn(): boolean {
  return online !== null && game.getState().currentPlayer !== online.myPlayer;
}

function sendOnlineState(combat?: NonNullable<OnlineReplay["combat"]>): void {
  checkpointCampaign();
  if (!online) {
    return;
  }
  const movements = game.getState().units.flatMap((unit, index) =>
    unit.animationPath.length > 0 ? [{ index, start: { ...unit.pos }, path: unit.animationPath.map(pos => ({ ...pos })) }] : []);
  online.session.send({ kind: "state", state: game.serializeState(), replay: { movements, ...(combat ? { combat } : {}) } });
}

function updateOnlineHud(): void {
  if (!hudOnline) {
    return;
  }
  if (!online) {
    hudOnline.classList.add("is-hidden");
    hudOnline.style.cursor = "";
    if (hudEndTurn) {
      hudEndTurn.disabled = false;
    }
    return;
  }

  const opponentsTurn = isOpponentsTurn();
  const canCopyInvite = !online.peerConnected && online.inviteLink !== null;
  hudOnline.classList.remove("is-hidden");
  hudOnline.style.cursor = canCopyInvite ? "pointer" : "";
  if (canCopyInvite) {
    hudOnline.textContent = "Opponent offline – click to copy the invite link";
  } else {
    hudOnline.textContent = opponentsTurn ? "Waiting for the opponent…" : "Your turn";
  }
  if (hudEndTurn) {
    hudEndTurn.disabled = opponentsTurn;
  }
}

if (hudOnline) {
  hudOnline.addEventListener("click", () => {
    if (!online || online.peerConnected || online.inviteLink === null || !navigator.clipboard) {
      return;
    }
    const link = online.inviteLink;
    void navigator.clipboard.writeText(link).then(() => {
      if (hudOnline) {
        hudOnline.textContent = "Invite link copied";
      }
    });
  });
}

function prepareFreshGame(map?: MapDocument): SavedGameState {
  // Some generated maps have no room for the start units.
  for (let attempt = 1; ; attempt++) {
    try {
      return game.prepareNewGame(map);
    } catch (error) {
      if (attempt >= 10) {
        throw new Error(map
          ? "This map needs space for a base and three adjacent land units on each side, connected by land. Please edit the map and try again."
          : "Could not generate a playable map. Please try again.");
      }
    }
  }
}

function showFreshMap(): void {
  renderer.resetView();
  const mapCenter = game.tryGetMapCenterTile();
  if (mapCenter) {
    renderer.centerOnAxial(mapCenter.q, mapCenter.r);
  }
}

function openGameModeDialog(): void {
  if (!appRoot) {
    return;
  }
  showGameModeDialog(appRoot, {
    onSinglePlayer: (map) => {
      const state = prepareFreshGame(map);
      activeCampaign = null;
      leaveOnline();
      game.loadState(state);
      showFreshMap();
      applyFullscreenPreference();
      renderAll();
    },
    onOnline: (map) => {
      if (map && (map.width > 100 || map.height > 100)) {
        throw new Error("Online maps support a maximum size of 100 × 100.");
      }
      const state = prepareFreshGame(map);
      void startOnlineHost(state);
    },
    onBack: () => {
      openStartDialog();
    },
  });
}

function describeRelayError(error: unknown): string {
  const reason = error instanceof RelayRequestError ? error.reason : "unreachable";
  switch (reason) {
    case "room-not-found":
      return "This game does not exist anymore. Ask your opponent for a new invite link.";
    case "room-full":
      return "This game already has two players. If you were just disconnected, wait a moment and reload the page.";
    case "too-many-rooms":
      return "The game server is busy right now. Please try again later.";
    default:
      return "The game server could not be reached. Check your connection and try again.";
  }
}

function leaveOnline(keepInviteLink = false): void {
  onlineAttempt += 1;
  const current = online;
  online = null;
  if (current) {
    current.waitingDialog?.close();
    current.inviteDialog?.close();
    current.session.close();
  }
  if (!keepInviteLink && parseInviteRoom(window.location.search)) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  applyAiConfiguration();
  renderAll();
}

function handleOnlineClosed(reason: CloseReason): void {
  if (!online || reason === "closed-by-user" || !appRoot) {
    return;
  }
  const text =
    reason === "room-closed"
      ? "The host left the game."
      : "The connection to the game server was lost. Open the invite link again to reconnect.";
  leaveOnline(true);
  showNoticeDialog(appRoot, {
    title: "Online Game",
    text,
    onOk: () => {
      openStartDialog();
    },
  });
}

function enqueueRemoteMessage(message: GameMessage): void {
  const connection = online;
  if (!connection || !isPlausibleGameState(message.state)) return;
  remotePlaybackActive = true;
  remoteMessages = remoteMessages.catch(() => undefined).then(async () => {
    if (online !== connection) return;
    const replay = message.replay;
    const state = message.state as SavedGameState;
    const combat = replay?.combat;
    if (combat && isPlausibleGameState(combat.before) && isValidRemoteCombat(combat.preview)) {
      applyRemoteState(combat.before, false);
      const attacker = game.getUnitAt(combat.preview.attackerPos);
      const defender = game.getUnitAt(combat.preview.defenderPos);
      if (attacker && defender) {
        game.setCombatOverlay(combat.preview.attackerPos, combat.preview.defenderPos);
        await new Promise<void>(resolve => playCombatIntro(attacker, defender, resolve, () => online === connection));
        if (online !== connection) return;
        if (appRoot) {
          await new Promise<void>(resolve => showCombatDialog(appRoot, attacker, defender, combat.preview, { onOk: resolve }));
        }
        if (online !== connection) return;
        renderer.clearCombatPresentation();
        if (state.units.length < combat.before.units.length) fxAudio.playUnitDestroyed();
      }
    } else {
      applyRemoteState(state, false);
      if (Array.isArray(replay?.movements) && replay.movements.length <= state.units.length) {
        const units = game.getState().units;
        for (const movement of replay.movements) {
          if (!movement || !Number.isInteger(movement.index)) continue;
          const unit = units[movement.index];
          if (!unit || unit.owner === connection.myPlayer || !isReplayPosition(movement.start) ||
              !Array.isArray(movement.path) || movement.path.length > 10000 || !movement.path.every(isReplayPosition)) continue;
          unit.pos = { ...movement.start };
          unit.animationPath = movement.path.map(pos => ({ ...pos }));
        }
        await playAiTurn([], connection.myPlayer === 0 ? 1 : 0, () => online === connection);
      }
    }
    if (online === connection) applyRemoteState(state);
  }).catch(error => {
    console.error("Failed to replay the opponent's action.", error);
    if (online === connection) applyRemoteState(message.state);
  }).finally(() => {
    // A newer queued action keeps input blocked until its playback completes.
    pendingRemoteMessages--;
    remotePlaybackActive = pendingRemoteMessages > 0;
  });
  pendingRemoteMessages++;
}

function isReplayPosition(value: unknown): value is { q: number; r: number } {
  if (!value || typeof value !== "object") return false;
  const pos = value as { q: number; r: number };
  return Number.isFinite(pos.q) && Number.isFinite(pos.r) && Math.abs(pos.q) <= 1000 && Math.abs(pos.r) <= 1000;
}

function isValidRemoteCombat(value: unknown): value is CombatPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as CombatPreview;
  return isReplayPosition(preview.attackerPos) && isReplayPosition(preview.defenderPos) &&
    Object.values(preview).every(item => typeof item !== "number" || Number.isFinite(item));
}

function applyRemoteState(state: unknown, showWinner = true): void {
  if (!online) {
    return;
  }
  if (!isPlausibleGameState(state)) {
    console.warn("Ignored an invalid game state from the opponent.");
    return;
  }
  try {
    game.loadState(state as SavedGameState);
  } catch (error) {
    console.error("Failed to load the game state of the opponent.", error);
    return;
  }

  if (online.waitingDialog) {
    online.waitingDialog.close();
    online.waitingDialog = null;
    showFreshMap();
  }
  renderAll();

  const current = game.getState();
  if (showWinner && current.gameOver && current.winner !== null) {
    openWinDialog(current.winner);
  }
}

function showConnectingDialog(text: string): { close: () => void } | null {
  if (!appRoot) {
    return null;
  }
  return showNoticeDialog(appRoot, {
    title: "Online Game",
    text,
    buttonLabel: "Cancel",
    onOk: () => {
      leaveOnline();
      openStartDialog();
    },
  });
}

async function startOnlineHost(initialState: SavedGameState): Promise<void> {
  activeCampaign = null;
  if (!appRoot) {
    return;
  }
  leaveOnline();
  const attempt = onlineAttempt;
  const pending = showConnectingDialog("Connecting to the game server…");

  let created: { session: OnlineSession; room: string };
  try {
    created = await OnlineSession.createRoom(getRelayUrl(window.location), {
      onPeerJoined: () => {
        if (!online) {
          return;
        }
        online.peerConnected = true;
        online.inviteDialog?.close();
        online.inviteDialog = null;
        sendOnlineState();
        renderAll();
      },
      onPeerLeft: () => {
        if (!online) {
          return;
        }
        online.peerConnected = false;
        renderAll();
      },
      onGameMessage: enqueueRemoteMessage,
      onClosed: handleOnlineClosed,
    });
  } catch (error) {
    if (attempt !== onlineAttempt) {
      return;
    }
    pending?.close();
    showNoticeDialog(appRoot, {
      title: "Online Game",
      text: describeRelayError(error),
      onOk: () => {
        openStartDialog();
      },
    });
    return;
  }

  if (attempt !== onlineAttempt) {
    created.session.close();
    return;
  }
  pending?.close();

  const inviteLink = buildInviteLink(window.location, created.room);
  online = {
    session: created.session,
    myPlayer: 0,
    peerConnected: false,
    inviteLink,
    waitingDialog: null,
    inviteDialog: null,
  };
  applyAiConfiguration();
  game.loadState(initialState);
  showFreshMap();
  applyFullscreenPreference();
  renderAll();
  online.inviteDialog = showInviteDialog(appRoot, {
    link: inviteLink,
    onCancel: () => {
      leaveOnline();
      openStartDialog();
    },
  });
}

async function joinOnlineGame(room: string): Promise<void> {
  activeCampaign = null;
  if (!appRoot) {
    return;
  }
  leaveOnline(true);
  const attempt = onlineAttempt;
  const pending = showConnectingDialog("Joining the game…");

  let session: OnlineSession;
  try {
    session = await OnlineSession.joinRoom(getRelayUrl(window.location), room, {
      onGameMessage: enqueueRemoteMessage,
      onClosed: handleOnlineClosed,
    });
  } catch (error) {
    if (attempt !== onlineAttempt) {
      return;
    }
    pending?.close();
    showNoticeDialog(appRoot, {
      title: "Online Game",
      text: describeRelayError(error),
      onOk: () => {
        leaveOnline();
        openStartDialog();
      },
    });
    return;
  }

  if (attempt !== onlineAttempt) {
    session.close();
    return;
  }

  // The host sends the game as soon as the connection is established.
  online = {
    session,
    myPlayer: 1,
    peerConnected: true,
    inviteLink: null,
    waitingDialog: pending,
    inviteDialog: null,
  };
  applyAiConfiguration();
}

function openAboutDialog(): void {
  if (!appRoot) {
    return;
  }

  showAboutDialog(appRoot, {
    onClose: () => {
      openStartDialog();
    },
  });
}

function openSettingsDialog(): void {
  if (!appRoot) {
    return;
  }

  showSettingsDialog(appRoot, {
    initialState: settingsState,
    difficultyLocked: activeCampaign !== null,
    onApply: (nextState) => {
      settingsState = nextState;
      applyAiConfiguration();
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

function checkpointCampaign(): void {
  if (!activeCampaign || online) return;
  activeCampaign.state = game.serializeState();
  activeCampaign.pendingCombats = clone(pendingCampaignCombats);
  if (!writeCampaignProgress(activeCampaign, campaignStorage)) {
    campaignStorageWarning = "Browser storage is full or unavailable. Use Save Game to keep your campaign progress in a file.";
  } else campaignStorageWarning = "";
}

function openCampaigns(): void {
  if (!appRoot) return;
  showCampaignLibrary(appRoot, { storage: campaignStorage, warning: campaignStorageWarning,
    onStart: (campaign, index) => {
      const briefing = () => showMissionBriefing(campaign, index);
      if (index === 0 && campaign.introduction) {
        showCampaignStory(appRoot, { title: campaign.title, text: campaign.introduction, image: campaign.image,
          actions: [{ label: "Continue", onClick: briefing }, { label: "Back", onClick: openCampaigns }] });
      } else briefing();
    },
    onResume: resumeCampaign, onBack: openStartDialog,
  });
}

function showMissionBriefing(campaign: CampaignDocument, index: number): void {
  if (!appRoot) return;
  const mission = campaign.missions[index]; if (!mission) return;
  showCampaignStory(appRoot, { title: mission.title, text: mission.briefing || "Destroy the enemy headquarters to complete this mission.",
    image: mission.image, subtitle: `${campaign.title} · Mission ${index + 1} / ${campaign.missions.length} · ${{ easy: "Easy", normal: "Normal", hard: "Hard" }[mission.difficulty]}`,
    actions: [{ label: "Start mission", onClick: () => {
      const progress = readCampaignProgress(campaign, campaignStorage);
      resumeCampaign(createCampaignSave(campaign, index, progress.completedMissionIds));
    } }, { label: "Back", onClick: openCampaigns }] });
}

function resumeCampaign(save: CampaignSave): void {
  const restored = parseCampaignSave(save);
  leaveOnline();
  activeCampaign = restored;
  pendingCampaignCombats = clone(restored.pendingCombats ?? []);
  const mission = restored.campaign.missions.find(m => m.id === restored.missionId)!;
  settingsState.aiDifficulty = mission.difficulty;
  game.loadState(clone(restored.state));
  applyAiConfiguration();
  showFreshMap();
  checkpointCampaign();
  renderAll();
  if (restored.state.gameOver && restored.state.winner !== null && restored.state.winner !== undefined) {
    showCampaignOutcome(restored.state.winner);
  } else if (pendingCampaignCombats.length) {
    showAiCombatDialogs([...pendingCampaignCombats]);
  } else if (campaignStorageWarning && appRoot) {
    showNoticeDialog(appRoot, { title: "Campaign progress", text: campaignStorageWarning, onOk: () => {} });
  }
}

function showCampaignOutcome(winner: PlayerId): void {
  if (!activeCampaign || !appRoot) return;
  const save = activeCampaign;
  const campaign = save.campaign;
  const index = campaign.missions.findIndex(m => m.id === save.missionId);
  const mission = campaign.missions[index]!;
  const next = finishCampaignMission(save, winner);
  checkpointCampaign();
  showCampaignStory(appRoot, { title: winner === 0 ? "Mission accomplished!" : "Mission failed",
    text: (winner === 0 ? mission.victoryText : mission.defeatText) || (winner === 0 ? "Victory!" : "Try again."),
    image: mission.image, subtitle: `${campaign.title} · ${mission.title}`,
    actions: [{ label: winner === 0 ? (next === null ? "Complete campaign" : "Next mission") : "Retry mission", onClick: () => {
      if (winner !== 0) showMissionBriefing(campaign, index);
      else if (next !== null) showMissionBriefing(campaign, next);
      else showCampaignStory(appRoot, { title: "Campaign completed!", text: campaign.completionText || "You have completed every mission. Congratulations!",
        image: campaign.image, subtitle: campaign.title, actions: [{ label: "Campaigns", onClick: openCampaigns }, { label: "Main menu", onClick: openStartDialog }] });
    } }, { label: "Main menu", onClick: openStartDialog }] });
}

function openWinDialog(winner: PlayerId): void {
  if (activeCampaign && !online) {
    showCampaignOutcome(winner);
    return;
  }
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
  checkpointCampaign();
  const saveData = activeCampaign ?? game.serializeState();
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
        if (parsed?.format === "hexagon-campaign-save") {
          resumeCampaign(parseCampaignSave(parsed));
        } else {
          game.loadState(parsed);
          activeCampaign = null;
          leaveOnline();
          applyAiConfiguration();
          showFreshMap();
          renderAll();
        }
      } catch (error) {
        console.error("Failed to load save game.", error);
        window.alert("Could not load the saved game.");
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

function centerEditorMap(): void {
  if (!mapEditor) return;
  const { width, height, tiles } = mapEditor.document;
  const center = tiles.find(t => t.col === Math.floor(width / 2) && t.row === Math.floor(height / 2));
  renderer.resetView();
  if (center) renderer.centerOnAxial(center.q, center.r);
}

function confirmDiscardMap(onDiscard: () => void): void {
  if (!mapEditor?.dirty) {
    onDiscard();
    return;
  }
  if (appRoot && !document.querySelector(".dialog-overlay")) {
    showDiscardMapDialog(appRoot, onDiscard);
  }
}

function closeMapEditor(): void {
  confirmDiscardMap(() => {
    mapEditor = null;
    editorToolbar?.remove();
    editorToolbar = null;
    renderer.resetView();
    const center = game.tryGetMapCenterTile();
    if (center) renderer.centerOnAxial(center.q, center.r);
    renderAll();
    openStartDialog();
  });
}

function openMapEditor(): void {
  mapEditor = new MapEditor();
  const toolbar = document.createElement("section");
  toolbar.className = "uiPanel map-editor-toolbar";
  toolbar.style.backgroundImage = 'url("/images/background/startbackground.png")';
  toolbar.setAttribute("aria-label", "Map Editor");
  const title = document.createElement("strong");
  title.textContent = "Map Editor";
  const name = document.createElement("input");
  name.className = "start-dialog-input";
  name.value = mapEditor.document.name;
  name.setAttribute("aria-label", "Map name");
  name.maxLength = 120;
  name.addEventListener("input", () => {
    if (!mapEditor) return;
    mapEditor.document.name = name.value;
    mapEditor.dirty = true;
  });
  // Typing in the name must not pan the map or activate keyboard shortcuts.
  name.addEventListener("keydown", ev => ev.stopPropagation());
  toolbar.append(title, name);
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "start-dialog-button";
    element.textContent = label;
    element.addEventListener("click", action);
    toolbar.append(element);
    return element;
  };
  button("Generate New Map", () => {
    confirmDiscardMap(() => {
      mapEditor = new MapEditor();
      name.value = mapEditor.document.name;
      centerEditorMap();
      renderAll();
    });
  });
  button("Undo", () => { mapEditor?.undo(); renderAll(); }).dataset.undo = "";
  button("Save Map", () => {
    if (!mapEditor) return;
    const blob = new Blob([serializeMapDocument(mapEditor.document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hexagon-map-${Date.now()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    mapEditor.dirty = false;
  });
  button("Load Map", () => {
    const targetEditor = mapEditor;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(text => {
        if (!targetEditor || mapEditor !== targetEditor) return;
        const candidate = new MapEditor();
        candidate.load(JSON.parse(text));
        confirmDiscardMap(() => {
          mapEditor = candidate;
          name.value = candidate.document.name;
          centerEditorMap();
          renderAll();
        });
      }).catch(() => window.alert("Could not load the map. Please select a valid Hexagon map file."));
    });
    input.click();
  });
  button("Back to Menu", closeMapEditor);
  const help = document.createElement("small");
  help.textContent = "Click: Farmland → Woods → Hills → Mountain → Ocean → City → Industry · Drag: Pan · Ctrl+Z: Undo";
  toolbar.append(help);
  editorToolbar = toolbar;
  appRoot?.append(toolbar);
  centerEditorMap();
  renderAll();
}

window.addEventListener("beforeunload", event => {
  if (!mapEditor?.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});
