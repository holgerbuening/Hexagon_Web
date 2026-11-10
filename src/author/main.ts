import { CanvasRenderer } from "../render/canvasRenderer";
import { pixelToAxial } from "../core/hexMath";
import { Unit } from "../core/units/unit";
import { UnitType, UNIT_TYPES } from "../core/units/unitType";
import { FieldType } from "../core/map/fieldTypes";
import { parseMapDocument } from "../core/map/mapSerializer";
import { GameCore } from "../core/gameCore";
import type { GameState, SavedUnit } from "../core/types";
import {
  createCampaign, createMission, parseCampaign, parseMission, parseMissionState,
  missionIssues, campaignIssues, moveMission, clone, newId,
  type CampaignDocument, type MissionDocument,
} from "./documents";

type Workspace = { version: 1; campaigns: CampaignDocument[]; campaignId: string; missionId: string | null };
type Tool = "select" | "terrain" | "unit" | "remove" | "road";
const STORAGE_KEY = "hexagon-author-workspace-v1";
let recoveryError = "";
function freshWorkspace(): Workspace {
  const campaign = createCampaign();
  return { version: 1, campaigns: [campaign], campaignId: campaign.id, missionId: campaign.missions[0]!.id };
}
function restore(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshWorkspace();
    const saved = JSON.parse(raw) as Workspace;
    if (saved.version !== 1 || !Array.isArray(saved.campaigns) || !saved.campaigns.length) throw new Error("Invalid workspace.");
    const campaigns = saved.campaigns.map(parseCampaign);
    if (new Set(campaigns.map(c => c.id)).size !== campaigns.length) throw new Error("Duplicate campaign IDs.");
    return { version: 1, campaigns, campaignId: campaigns.find(c => c.id === saved.campaignId)?.id ?? campaigns[0]!.id,
      missionId: saved.missionId };
  } catch (error) {
    recoveryError = `The local draft could not be loaded: ${String(error)}. It will not be overwritten automatically. Export new work to a file.`;
    return freshWorkspace();
  }
}
let workspace = restore();
let view: "mission" | "campaign" = "mission";
let tool: Tool = "select";
let selected: { q: number; r: number } | null = null;
const history: Workspace[] = [];
let storageBlocked = !!recoveryError;
let unsaved = false;
let saveMessage = "Local workspace";
const root = document.getElementById("studio")!;
root.innerHTML = `
  <header class="studio-header">
    <a class="brand" href="./index.html"><span class="brand-mark">⬡</span><span>HEXAGON<small>AUTHOR STUDIO</small></span></a>
    <span class="local-badge">LOCAL · AUTHOR EDITION</span>
    <span id="save-state" role="status"></span>
    <button id="import">Import</button><button id="export" class="accent">Export campaign</button>
  </header>
  <div class="studio-layout">
    <aside class="navigation">
      <p class="eyebrow">WORKSPACE</p>
      <label>Campaign<select id="campaign-select"></select></label>
      <div class="button-row"><button id="new-campaign">+ Campaign</button><button id="delete-campaign" class="subtle">Remove</button></div>
      <nav><button id="mission-tab" class="nav-button">01 <span>Mission editor</span></button><button id="campaign-tab" class="nav-button">02 <span>Campaign manager</span></button></nav>
      <div class="section-title"><p class="eyebrow">MISSIONS</p><button id="new-mission" title="New mission">+</button></div>
      <div id="mission-list"></div>
      <div class="navigation-note">Drafts stay in this browser. Export your work regularly as a JSON file.</div>
    </aside>
    <main>
      <div class="page-heading"><div><p class="eyebrow" id="page-kicker"></p><h1 id="page-title"></h1></div><button id="undo">↶ Undo</button></div>
      <section id="mission-view">
        <div class="mission-grid">
          <section class="panel inspector"><div class="panel-heading"><h2>Mission & story</h2></div><div id="mission-form" class="form-body"></div></section>
          <section class="map-column">
            <div class="panel map-panel"><div class="map-toolbar">
              <label>Tool<select id="tool"><option value="select">Select</option><option value="terrain">Paint terrain</option><option value="unit">Place unit</option><option value="remove">Remove unit</option><option value="road">Toggle road</option></select></label>
              <label>Terrain<select id="terrain"></select></label><label>Unit<select id="unit-type"></select></label>
              <label>Side<select id="owner"><option value="0">Player</option><option value="1">AI</option></select></label>
              <button id="fit">Center map</button>
            </div><div class="canvas-wrap"><canvas id="map" aria-label="Mission map"></canvas></div>
            <div class="map-caption"><span id="map-info"></span><span>Right mouse button: pan · Mouse wheel: zoom</span></div></div>
            <div class="panel"><div class="panel-heading"><h2>Selected tile</h2><span id="selection-label"></span></div><div id="unit-form" class="form-body unit-form"></div></div>
            <div class="panel"><div class="panel-heading"><h2>Map & starting setup</h2></div><div class="form-body">
              <div class="inline-fields"><label>Width<input id="map-width" type="number" min="4" max="100" value="16"></label><label>Height<input id="map-height" type="number" min="4" max="100" value="12"></label><button id="generate-map">New map</button></div>
              <div class="button-row"><button id="starting-units">Generate starting setup</button><button id="import-map">Load map / saved game</button><button id="export-mission">Export mission</button></div>
              <p class="hint">A new map replaces terrain and units. The starting setup places one HQ and three troops for each side.</p>
            </div></div>
          </section>
        </div>
      </section>
      <section id="campaign-view" hidden><div class="campaign-grid"><section class="panel"><div class="panel-heading"><h2>Campaign & story</h2></div><div id="campaign-form" class="form-body"></div></section><section class="panel"><div class="panel-heading"><h2>Mission sequence</h2><span>Order in the game</span></div><div id="campaign-order" class="form-body"></div></section></div></section>
      <section class="panel validation"><div><h2 id="validation-title">Validation</h2><ul id="issues"></ul></div><div class="validation-actions"><button id="validate">Validate all</button><button id="test" class="accent">▶ Test mission</button></div></section>
      <p id="notice" class="notice" role="status" aria-live="polite"></p>
    </main>
  </div>`;
function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function campaign(): CampaignDocument { return workspace.campaigns.find(c => c.id === workspace.campaignId) ?? workspace.campaigns[0]!; }
function mission(): MissionDocument | undefined { return campaign().missions.find(m => m.id === workspace.missionId) ?? campaign().missions[0]; }
function announce(message: string, error = false): void {
  element("notice").textContent = message;
  element("notice").classList.toggle("error", error);
}
function checkpoint(): void {
  history.push(clone(workspace));
  if (history.length > 30) history.shift();
}
function persist(): void {
  unsaved = true;
  if (!storageBlocked) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      unsaved = false;
      saveMessage = `Saved locally · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      saveMessage = "Browser storage full / unavailable · please export";
    }
  } else saveMessage = "Autosave paused · please export";
  element("save-state").textContent = saveMessage;
  element("save-state").classList.toggle("error", unsaved);
  element<HTMLButtonElement>("undo").disabled = !history.length;
  refreshNavigation();
  refreshValidation();
}
function change(action: () => void, rerender = false): void {
  checkpoint();
  action();
  persist();
  if (rerender) render();
  else drawMap();
}
function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.disabled = disabled;
  b.addEventListener("click", () => { try { action(); } catch (error) { announce(String(error), true); } }); return b;
}
function field(parent: HTMLElement, label: string, value: string | number, set: (value: string) => void,
  options: { multiline?: boolean; type?: string; min?: number; max?: number; choices?: [string, string][] } = {}): void {
  const wrapper = document.createElement("label"); wrapper.textContent = label;
  const input = options.choices ? document.createElement("select") : options.multiline ? document.createElement("textarea") : document.createElement("input");
  if (input instanceof HTMLInputElement) {
    input.type = options.type ?? "text";
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (input.type === "number") input.step = "1";
    else input.maxLength = 200;
  }
  if (input instanceof HTMLTextAreaElement) { input.rows = 4; input.maxLength = 20000; }
  if (options.choices) for (const [key, title] of options.choices) input.append(new Option(title, key));
  input.value = String(value);
  let checkpointed = false;
  let lastValue = input.value;
  input.addEventListener("focus", () => { checkpointed = false; });
  const commit = () => {
    if (!input.checkValidity()) return false;
    if (input.value !== lastValue) {
      if (!checkpointed) { checkpoint(); checkpointed = true; }
      lastValue = input.value;
      set(input.value);
      persist();
      drawMap();
    }
    return true;
  };
  // Story and title edits are saved while typing; one focus session is one undo step.
  if (input instanceof HTMLTextAreaElement || (input instanceof HTMLInputElement && input.type === "text" && label !== "ID")) {
    input.addEventListener("input", commit);
  }
  input.addEventListener("change", () => {
    if (!commit()) { input.reportValidity(); return; }
    refreshSelection();
  });
  wrapper.append(input); parent.append(wrapper);
}
function imageField(parent: HTMLElement, target: { image: string }): void {
  const box = document.createElement("div"); box.className = "image-field";
  if (target.image) {
    const img = document.createElement("img"); img.src = target.image; img.alt = "Illustration"; box.append(img);
  } else { const empty = document.createElement("div"); empty.className = "image-empty"; empty.textContent = "Add a story image"; box.append(empty); }
  box.append(button("Choose image", () => {
    const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0]; if (!file) return;
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 5_000_000) { announce("Choose a PNG, JPEG, WebP or GIF image up to 5 MB.", true); return; }
      const reader = new FileReader();
      reader.onload = () => change(() => { target.image = String(reader.result); }, true);
      reader.onerror = () => announce("The image could not be read.", true);
      reader.readAsDataURL(file);
    }); fileInput.click();
  }));
  if (target.image) box.append(button("Remove image", () => change(() => { target.image = ""; }, true)));
  parent.append(box);
}
function refreshNavigation(): void {
  const select = element<HTMLSelectElement>("campaign-select");
  select.replaceChildren(...workspace.campaigns.map(c => new Option(c.title || "Untitled", c.id)));
  select.value = campaign().id;
  const list = element("mission-list"); list.replaceChildren();
  campaign().missions.forEach((m, i) => {
    const b = button(`${String(i + 1).padStart(2, "0")}  ${m.title || "Untitled"}`, () => {
      workspace.missionId = m.id; view = "mission"; selected = null; persist(); render(); fitMap();
    }); b.className = "mission-nav"; b.classList.toggle("active", m.id === mission()?.id); list.append(b);
  });
  element("mission-tab").classList.toggle("active", view === "mission");
  element("campaign-tab").classList.toggle("active", view === "campaign");
  element("page-kicker").textContent = view === "mission" ? "MISSION EDITOR" : "CAMPAIGN MANAGER";
  element("page-title").textContent = view === "mission" ? mission()?.title || "No missions yet" : campaign().title || "Untitled";
}
function refreshValidation(): void {
  const m = mission();
  const issues = view === "mission" && m ? missionIssues(m) : campaignIssues(campaign());
  element("validation-title").textContent = issues.length ? `${issues.length} unresolved issues` : "Ready to test";
  const list = element("issues"); list.replaceChildren();
  for (const issue of issues) { const li = document.createElement("li"); li.textContent = issue; list.append(li); }
  if (!issues.length) { const li = document.createElement("li"); li.textContent = "File format, setup and HQs checked. Test the mission to assess its balance."; list.append(li); }
  element<HTMLButtonElement>("test").disabled = !m || missionIssues(m).length > 0;
}
function render(): void {
  refreshNavigation(); refreshValidation();
  element("mission-view").hidden = view !== "mission" || !mission();
  element("campaign-view").hidden = view !== "campaign";
  const m = mission();
  const form = element("mission-form"); form.replaceChildren();
  if (m) {
    field(form, "Mission title", m.title, v => { m.title = v; });
    field(form, "ID", m.id, v => { if (campaign().missions.some(other => other !== m && other.id === v) || !/^[a-zA-Z0-9_-]+$/.test(v)) { announce("The ID must be valid and unique within this campaign.", true); render(); return; } m.id = v; workspace.missionId = v; });
    field(form, "AI difficulty", m.difficulty, v => { m.difficulty = v as MissionDocument["difficulty"]; }, { choices: [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]] });
    field(form, "Starting funds · Player", m.state.playerBalances[0]!, v => { m.state.playerBalances[0] = Number(v); }, { type: "number", min: 0, max: 10000000 });
    field(form, "Starting funds · AI", m.state.playerBalances[1]!, v => { m.state.playerBalances[1] = Number(v); }, { type: "number", min: 0, max: 10000000 });
    const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "The player controls side 1 and moves first. The AI controls side 2. Objective: destroy the enemy HQs."; form.append(hint);
    imageField(form, m);
    field(form, "Briefing / backstory", m.briefing, v => { m.briefing = v; }, { multiline: true });
    field(form, "Victory text", m.victoryText, v => { m.victoryText = v; }, { multiline: true });
    field(form, "Defeat text", m.defeatText, v => { m.defeatText = v; }, { multiline: true });
    form.append(button("Duplicate mission", () => change(() => {
      const copy = clone(m); copy.id = newId(); copy.title += " (Copy)"; campaign().missions.push(copy); workspace.missionId = copy.id;
    }, true)));
    form.append(button("Remove mission", () => { if (confirm(`Remove “${m.title}” from this campaign?`)) change(() => {
      campaign().missions = campaign().missions.filter(item => item !== m); workspace.missionId = campaign().missions[0]?.id ?? null; selected = null;
    }, true); }));
    element<HTMLInputElement>("map-width").value = String(m.state.mapWidth);
    element<HTMLInputElement>("map-height").value = String(m.state.mapHeight);
  }
  const c = campaign(); const cf = element("campaign-form"); cf.replaceChildren();
  field(cf, "Campaign title", c.title, v => { c.title = v; });
  field(cf, "ID", c.id, v => { if (!/^[a-zA-Z0-9_-]+$/.test(v) || workspace.campaigns.some(other => other !== c && other.id === v)) { announce("The ID must be valid and unique.", true); render(); return; } c.id = v; workspace.campaignId = v; });
  field(cf, "Short description", c.description, v => { c.description = v; }, { multiline: true });
  imageField(cf, c);
  field(cf, "Campaign introduction", c.introduction, v => { c.introduction = v; }, { multiline: true });
  field(cf, "Completion / success message", c.completionText, v => { c.completionText = v; }, { multiline: true });
  renderOrder(); refreshSelection(); requestAnimationFrame(resizeMap);
}
function renderOrder(): void {
  const list = element("campaign-order"); list.replaceChildren();
  if (!campaign().missions.length) { const p = document.createElement("p"); p.textContent = "Add the first mission or import a mission file."; list.append(p); }
  campaign().missions.forEach((m, index) => {
    const card = document.createElement("article"); card.className = "mission-card";
    const number = document.createElement("span"); number.className = "mission-number"; number.textContent = String(index + 1).padStart(2, "0");
    const info = document.createElement("div"); const title = document.createElement("h3"); title.textContent = m.title || "Untitled";
    const detail = document.createElement("p"); detail.textContent = `${({ easy: "Easy", normal: "Normal", hard: "Hard" })[m.difficulty]} · ${m.state.mapWidth} × ${m.state.mapHeight} · ${m.state.units.length} units`;
    info.append(title, detail);
    const controls = document.createElement("div"); controls.className = "button-row";
    controls.append(button("↑", () => change(() => moveMission(campaign(), index, -1), true), index === 0), button("↓", () => change(() => moveMission(campaign(), index, 1), true), index === campaign().missions.length - 1), button("Edit", () => { workspace.missionId = m.id; view = "mission"; selected = null; persist(); render(); fitMap(); }));
    card.append(number, info, controls); list.append(card);
  });
  list.append(button("+ New mission", addMission));
  const note = document.createElement("p"); note.className = "hint"; note.textContent = "The export includes all missions and embedded images in this order. Automatic mission progression in the game will be added in a later step."; list.append(note);
}

const canvas = element<HTMLCanvasElement>("map");
const renderer = new CanvasRenderer(canvas, 42);
renderer.setInvalidateHandler(drawMap);
function drawMap(): void {
  const m = mission(); if (!m || view !== "mission") return;
  const units = m.state.units.map(u => Unit.fromSaved(u));
  const state: GameState = { ...m.state, gameOver: false, winner: null, units, selectedHex: selected,
    selectedUnit: null, reachableTiles: {}, attackOverlay: {}, combatOverlay: {} };
  renderer.render(state);
  element("map-info").textContent = `${m.state.mapWidth} × ${m.state.mapHeight} · ${units.length} units`;
}
function resizeMap(): void {
  if (!canvas.clientWidth || !canvas.clientHeight) return;
  const width = Math.round(canvas.clientWidth); const height = Math.round(canvas.clientHeight);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  drawMap();
}
function fitMap(): void {
  resizeMap(); const m = mission(); if (!m) return;
  renderer.resetView();
  const fit = Math.min(canvas.width / (m.state.mapWidth * 75 + 100), canvas.height / (m.state.mapHeight * 63 + 100), 1);
  renderer.zoomAtCenter(Math.max(0.35, fit));
  const center = m.state.tiles.find(t => t.col === Math.floor(m.state.mapWidth / 2) && t.row === Math.floor(m.state.mapHeight / 2));
  if (center) renderer.centerOnAxial(center.q, center.r);
  drawMap();
}
function refreshSelection(): void {
  const container = element("unit-form"); container.replaceChildren();
  const m = mission(); const tile = selected && m?.state.tiles.find(t => t.q === selected!.q && t.r === selected!.r);
  element("selection-label").textContent = tile ? `Tile ${tile.col}, ${tile.row} · axial ${tile.q}, ${tile.r}` : "No selection";
  if (!tile || !m) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "Select a tile on the map. Use the Place unit tool to add units."; container.append(p); return; }
  field(container, "Terrain", tile.field, v => { tile.field = v as FieldType; }, { choices: terrainChoices });
  field(container, "Road", tile.hasRoad ? "yes" : "no", v => { tile.hasRoad = v === "yes"; }, { choices: [["no", "No"], ["yes", "Yes"]] });
  const u = m.state.units.find(u => u.q === tile.q && u.r === tile.r);
  if (!u) { const p = document.createElement("p"); p.textContent = "No unit on this tile."; p.className = "hint"; container.append(p); return; }
  field(container, "Unit type", u.type, v => {
    const replacement = Unit.serialize(new Unit(v as UnitType, u.q, u.r, u.owner));
    Object.assign(u, replacement);
  }, { choices: unitChoices });
  field(container, "Owner", u.owner, v => { u.owner = Number(v) as 0 | 1; }, { choices: [["0", "Player"], ["1", "AI"]] });
  for (const [key, label, min, max] of [["hp", "HP", 1, u.maxHP], ["maxHP", "Maximum HP", u.hp, 10000], ["experience", "Experience", 0, 100000], ["offense", "Offense", 0, 10000], ["defense", "Defense", 0, 10000], ["attackRange", "Attack range", 0, 100]] as const) {
    field(container, label, u[key], v => { u[key] = Number(v); }, { type: "number", min, max });
  }
  container.append(button("Remove unit", () => change(() => { m.state.units = m.state.units.filter(item => item !== u); refreshSelection(); })));
}
const terrainChoices: [string, string][] = [[FieldType.Farmland, "Plains"], [FieldType.Woods, "Forest"], [FieldType.Hills, "Hills"], [FieldType.Mountain, "Mountains"], [FieldType.Ocean, "Water"], [FieldType.City, "City"], [FieldType.Industry, "Industry"]];
const unitChoices: [string, string][] = Object.values(UnitType).map(type => [type, UNIT_TYPES[type].name]);
element<HTMLSelectElement>("terrain").append(...terrainChoices.map(([value, name]) => new Option(name, value)));
element<HTMLSelectElement>("unit-type").append(...unitChoices.map(([value, name]) => new Option(name, value)));
let dragging = false; let previousX = 0; let previousY = 0;
canvas.addEventListener("contextmenu", event => event.preventDefault());
canvas.addEventListener("pointerdown", event => {
  if (event.button === 1 || event.button === 2) {
    dragging = true; previousX = event.clientX; previousY = event.clientY; canvas.setPointerCapture(event.pointerId); event.preventDefault(); return;
  }
  if (event.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  const hex = pixelToAxial(world.x, world.y, renderer.getHexSize());
  const m = mission(); const tile = m?.state.tiles.find(t => t.q === hex.q && t.r === hex.r);
  if (!m || !tile) return;
  selected = hex;
  if (tool === "terrain") change(() => { tile.field = element<HTMLSelectElement>("terrain").value as FieldType; });
  if (tool === "road") change(() => { tile.hasRoad = !tile.hasRoad; });
  if (tool === "remove") change(() => { m.state.units = m.state.units.filter(u => u.q !== hex.q || u.r !== hex.r); });
  if (tool === "unit") {
    if (m.state.units.some(u => u.q === hex.q && u.r === hex.r)) announce("This tile is occupied. Edit or remove the existing unit.", true);
    else if (tile.field === FieldType.Ocean) announce("Units can only be placed on land.", true);
    else change(() => { m.state.units.push(Unit.serialize(new Unit(element<HTMLSelectElement>("unit-type").value as UnitType, hex.q, hex.r, Number(element<HTMLSelectElement>("owner").value) as 0 | 1))); });
  }
  refreshSelection(); drawMap();
});
canvas.addEventListener("pointermove", event => {
  if (!dragging) return;
  renderer.panBy(event.clientX - previousX, event.clientY - previousY); previousX = event.clientX; previousY = event.clientY; drawMap();
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, () => { dragging = false; });
canvas.addEventListener("wheel", event => {
  event.preventDefault(); const rect = canvas.getBoundingClientRect();
  renderer.zoomAtScreenPoint(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.001)); drawMap();
}, { passive: false });
new ResizeObserver(resizeMap).observe(canvas);

function addMission(): void { change(() => { const m = createMission(); campaign().missions.push(m); workspace.missionId = m.id; view = "mission"; selected = null; }, true); fitMap(); }
function download(value: unknown, name: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name.replace(/[^a-zA-Z0-9_.-]/g, "_"); a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("File exported. Drafts can be saved even with unresolved validation issues.");
}
function readJson(onRead: (value: unknown) => void): void {
  const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      if (file.size > 100_000_000) throw new Error("The file is too large (maximum 100 MB).");
      onRead(JSON.parse(await file.text()));
    } catch (error) { announce(error instanceof Error ? error.message : String(error), true); }
  }); input.click();
}
element("tool").addEventListener("change", () => { tool = element<HTMLSelectElement>("tool").value as Tool; });
element("fit").addEventListener("click", fitMap);
element("mission-tab").addEventListener("click", () => { view = "mission"; render(); });
element("campaign-tab").addEventListener("click", () => { view = "campaign"; render(); });
element("new-mission").addEventListener("click", addMission);
element("campaign-select").addEventListener("change", () => {
  workspace.campaignId = element<HTMLSelectElement>("campaign-select").value;
  workspace.missionId = campaign().missions[0]?.id ?? null; selected = null; persist(); render(); fitMap();
});
element("new-campaign").addEventListener("click", () => change(() => {
  const c = createCampaign(); workspace.campaigns.push(c); workspace.campaignId = c.id; workspace.missionId = c.missions[0]!.id; view = "campaign"; selected = null;
}, true));
element("delete-campaign").addEventListener("click", () => {
  if (!confirm(`Remove “${campaign().title}” and all its missions from the workspace?`)) return;
  change(() => {
    workspace.campaigns = workspace.campaigns.filter(c => c !== campaign());
    if (!workspace.campaigns.length) workspace.campaigns.push(createCampaign());
    workspace.campaignId = workspace.campaigns[0]!.id; workspace.missionId = campaign().missions[0]?.id ?? null; selected = null;
  }, true);
});
element("undo").addEventListener("click", () => { const previous = history.pop(); if (!previous) return; workspace = previous; selected = null; persist(); render(); });
element("generate-map").addEventListener("click", () => {
  const m = mission(); if (!m) return;
  const w = element<HTMLInputElement>("map-width"); const h = element<HTMLInputElement>("map-height");
  if (!w.reportValidity() || !h.reportValidity()) return;
  if (!confirm("Replace this mission’s terrain and units with a new map?")) return;
  change(() => { m.state = createMission(Number(w.value), Number(h.value)).state; selected = null; }, true); fitMap();
});
element("starting-units").addEventListener("click", () => {
  const m = mission(); if (!m) return;
  if (m.state.units.length && !confirm("Replace all existing units with a starting setup?")) return;
  try {
    const game = new GameCore(20, 20);
    const fresh = game.prepareNewGame({ format: "hexagon-map", version: 1, name: m.title, width: m.state.mapWidth, height: m.state.mapHeight, tiles: clone(m.state.tiles) });
    change(() => { m.state.units = fresh.units; }, true);
    announce("Starting setup generated. Select any unit to edit it.");
  } catch (error) { announce(`Could not generate a starting setup: ${String(error)}`, true); }
});
element("import-map").addEventListener("click", () => readJson(value => {
  const m = mission(); if (!m) return;
  let state;
  if (value && typeof value === "object" && "format" in value && value.format === "hexagon-map") {
    const map = parseMapDocument(value);
    state = parseMissionState({ version: 1, mapWidth: map.width, mapHeight: map.height, tiles: map.tiles, units: [], playerBalances: m.state.playerBalances });
  } else state = parseMissionState(value);
  if (!confirm("Replace the current mission’s map and unit setup?")) return;
  change(() => { m.state = state; selected = null; }, true); fitMap(); announce("Map / saved game imported as a fresh mission start.");
}));
element("import").addEventListener("click", () => readJson(value => {
  if (value && typeof value === "object" && "format" in value && value.format === "hexagon-campaign") {
    const c = parseCampaign(value);
    if (workspace.campaigns.some(existing => existing.id === c.id)) { c.id = newId(); c.title += " (Import)"; }
    change(() => { workspace.campaigns.push(c); workspace.campaignId = c.id; workspace.missionId = c.missions[0]?.id ?? null; view = "campaign"; selected = null; }, true);
  } else {
    const m = parseMission(value);
    if (campaign().missions.some(existing => existing.id === m.id)) { m.id = newId(); m.title += " (Import)"; }
    change(() => { campaign().missions.push(m); workspace.missionId = m.id; view = "mission"; selected = null; }, true);
  }
  fitMap(); announce("File validated and imported. Existing drafts have been preserved.");
}));
element("export").addEventListener("click", () => { try { download(parseCampaign(campaign()), `${campaign().id}.campaign.json`); } catch (error) { announce(String(error), true); } });
element("export-mission").addEventListener("click", () => { const m = mission(); if (!m) return; try { download(parseMission(m), `${m.id}.mission.json`); } catch (error) { announce(String(error), true); } });
element("validate").addEventListener("click", () => {
  const issues = campaignIssues(campaign());
  announce(issues.length ? issues.join("\n") : "The entire campaign passed validation. Test the missions for difficulty and reachable objectives.", issues.length > 0);
});
element("test").addEventListener("click", () => {
  const m = mission(); if (!m) return; const issues = missionIssues(m);
  if (issues.length) { announce(issues.join("\n"), true); return; }
  try {
    sessionStorage.setItem("hexagon-author-test", JSON.stringify(parseMission(m)));
    persist();
    if (unsaved && !confirm("The browser could not save the draft. Export it before testing if possible. Continue anyway?")) return;
    window.location.href = "./play.html";
  } catch { announce("The test mission could not be saved in the browser. Reduce image sizes or free up browser storage.", true); }
});
window.addEventListener("beforeunload", event => { if (unsaved) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault(); element("undo").click();
  }
});
render();
if (recoveryError) announce(recoveryError, true);
element("save-state").textContent = saveMessage;
requestAnimationFrame(fitMap);
