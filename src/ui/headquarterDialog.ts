import type { Unit } from "../core/units/unit";

type HeadquarterDialogHandlers = {
  onClose: () => void;
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
  infoBox.appendChild(createRow("Owner", `Player ${hqUnit.owner}`));
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

  const placeholderList = document.createElement("div");
  placeholderList.className = "hq-placeholder";
  placeholderList.textContent =
    "Kaufoptionen folgen im nächsten Schritt. (Hier kommt später die Liste + Preise rein.)";
  leftCol.appendChild(placeholderList);

  const rightCol = document.createElement("div");
  rightCol.className = "dialog-column";

  const rightH = document.createElement("h3");
  rightH.textContent = "Preview";
  rightCol.appendChild(rightH);

  const placeholderPreview = document.createElement("div");
  placeholderPreview.className = "hq-placeholder";
  placeholderPreview.textContent =
    "Hier kommt später die große Unit-Vorschau rein (wie in der C++-Version).";
  rightCol.appendChild(placeholderPreview);

  cols.appendChild(leftCol);
  cols.appendChild(rightCol);
  content.appendChild(cols);

  // Footer: only Close button for now
  const footer = document.createElement("div");
  footer.className = "dialog-footer";

  const closeBtn = document.createElement("button");
  closeBtn.className = "dialog-button";
  closeBtn.textContent = "OK";
  footer.appendChild(closeBtn);

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

  closeBtn.addEventListener("click", () => {
    close();
    handlers.onClose();
  });
}
