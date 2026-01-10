import type { Unit } from "../core/units/unit";
import { PLAYER_NAMES } from "../core/types";
import { UNIT_TYPES, UnitType } from "../core/units/unitType";

type HeadquarterDialogHandlers = {
  onClose: () => void;
  onBuy: (unitType: UnitType) => void;
};

type HeadquarterDialogOptions = {
  balance?: number;
};

function createRow(label: string, value: string): HTMLDivElement {
  // English comment: Simple HUD-like row
  const row = document.createElement("div");
  row.className = "dialog-statline";

  const left = document.createElement("span");
  left.className = "dialog-statlabel";
  left.textContent = label;

  const right = document.createElement("span");
  right.className = "dialog-statvalue";
  right.textContent = value;

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

export function showHeadquarterDialog(
  appRoot: HTMLElement,
  hqUnit: Unit,
  handlers: HeadquarterDialogHandlers,
  options: HeadquarterDialogOptions = {}
): void {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.backgroundImage = 'url("/background/headquarterdialogbackground.png")';

  const content = document.createElement("div");
  content.className = "dialog-content";

  // Title
  const title = document.createElement("h2");
  title.className = "hq-title";
  title.textContent = "Headquarter";
  content.appendChild(title);

  // Top info area (flag + balance)
  const top = document.createElement("div");
  top.className = "hq-top";

  const flag = document.createElement("img");
  flag.className = "hq-flag";
  flag.alt = "current player flag";
  flag.src = `/flags/player${hqUnit.owner}.png`;
  top.appendChild(flag);

  const infoBox = document.createElement("div");
  infoBox.className = "hq-info";

  const bal = options.balance;
  infoBox.appendChild(createRow("Balance", bal !== undefined ? String(bal) : "—"));
  infoBox.appendChild(createRow("Owner", PLAYER_NAMES[hqUnit.owner]));
  infoBox.appendChild(createRow("HQ HP", `${hqUnit.hp}/${hqUnit.maxHP}`));
  top.appendChild(infoBox);

  content.appendChild(top);

  // Main area (placeholder for buy list + preview)
  const cols = document.createElement("div");
  cols.className = "dialog-columns";

  const leftCol = document.createElement("div");
  leftCol.className = "dialog-column";

  const leftH = document.createElement("h3");
  leftH.textContent = "Available Units";
  leftCol.appendChild(leftH);

  const unitList = document.createElement("ul");
  unitList.className = "hq-unit-list";

  const purchasableUnits: UnitType[] = [
    UnitType.Infantry,
    UnitType.MachnineGun,
    UnitType.Medic,
    UnitType.Engineer,
    UnitType.Cavalry,
    UnitType.Artillery,
    UnitType.Tank
  ];

  leftCol.appendChild(unitList);

  const rightCol = document.createElement("div");
  rightCol.className = "dialog-column";

  const rightH = document.createElement("h3");
  rightH.textContent = "Preview";
  rightCol.appendChild(rightH);

    const previewCard = document.createElement("div");
  previewCard.className = "hq-preview";

  const previewImage = document.createElement("img");
  previewImage.className = "hq-preview-image";
  previewImage.alt = "unit preview";
  previewCard.appendChild(previewImage);

  const previewStats = document.createElement("div");
  previewStats.className = "hq-preview-stats";
  previewCard.appendChild(previewStats);

  rightCol.appendChild(previewCard);

  const unitItems = new Map<UnitType, HTMLLIElement>();
  let selectedUnitType = purchasableUnits[0];
  let buyBtn: HTMLButtonElement | null = null;

  function setPreview(unitType: UnitType): void {
    selectedUnitType = unitType;
    const data = UNIT_TYPES[unitType];
    previewImage.src = `/units/${data.spriteKey}.png`;
    previewImage.alt = `${data.name} preview`;

    previewStats.innerHTML = "";
    previewStats.appendChild(createRow("Movement", String(data.maxMovement)));
    previewStats.appendChild(createRow("Offense", String(data.offense)));
    previewStats.appendChild(createRow("Defense", String(data.defense)));

    unitItems.forEach((item) => item.classList.remove("hq-unit-item--active"));
    const activeItem = unitItems.get(unitType);
    if (activeItem) {
      activeItem.classList.add("hq-unit-item--active");
    }

    updateBuyButtonState();
  }

  purchasableUnits.forEach((unitType) => {
    const data = UNIT_TYPES[unitType];
    const item = document.createElement("li");
    item.className = "hq-unit-item";

    const name = document.createElement("span");
    name.className = "hq-unit-name";
    name.textContent = data.name;

    const price = document.createElement("span");
    price.className = "hq-unit-price";
    price.textContent = `${data.price}`;

    item.appendChild(name);
    item.appendChild(price);
    unitList.appendChild(item);
    unitItems.set(unitType, item);

    item.addEventListener("click", () => setPreview(unitType));
  });

  leftCol.appendChild(unitList);

  cols.appendChild(leftCol);
  cols.appendChild(rightCol);
  content.appendChild(cols);
  
  if (purchasableUnits[0]!==undefined) {
    setPreview(purchasableUnits[0]);
  }

  // Footer: only Close button for now
  const footer = document.createElement("div");
  footer.className = "dialog-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "dialog-button";
  cancelBtn.textContent = "Cancel";
  footer.appendChild(cancelBtn);

  buyBtn = document.createElement("button");
  buyBtn.className = "dialog-button";
  buyBtn.textContent = "Buy";
  footer.appendChild(buyBtn);

  content.appendChild(footer);

  dialog.appendChild(content);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      close();
      handlers.onClose();
    }
  };

  function close(): void {
    window.removeEventListener("keydown", onKeyDown);
    if (overlay.parentElement === appRoot) {
      appRoot.removeChild(overlay);
    }
  }

  window.addEventListener("keydown", onKeyDown);

  function updateBuyButtonState(): void {
    if (selectedUnitType !== undefined) {
      const data = UNIT_TYPES[selectedUnitType];
      if (bal === undefined) {
        if (buyBtn) {
          buyBtn.disabled = true;
        }
        return;
      }
      if (buyBtn) {
        buyBtn.disabled = bal < data.price;
      }
    }
  }
  updateBuyButtonState();
  cancelBtn.addEventListener("click", () => {
    close();
    handlers.onClose();
  });

    buyBtn.addEventListener("click", () => {
    if (!buyBtn || buyBtn.disabled) return;
    close();
    if (selectedUnitType === undefined) return;
    handlers.onBuy(selectedUnitType);
  });
}
