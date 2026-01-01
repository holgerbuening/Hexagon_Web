// src/ui/combatDialog.ts
import type { CombatPreview } from "../core/types";
import type { Unit } from "../core/units/unit";

type CombatDialogHandlers = {
  onOk: () => void;
  onCancel: () => void;
};

function createRow(label: string, value: string): HTMLDivElement {
  // English comment: Small helper to keep DOM creation readable
  const row = document.createElement("div");
  row.className = "modalRow";

  const left = document.createElement("div");
  left.textContent = label;

  const right = document.createElement("div");
  right.textContent = value;

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

export function showCombatDialog(
  appRoot: HTMLElement,
  attacker: Unit,
  defender: Unit,
  preview: CombatPreview,
  handlers: CombatDialogHandlers
): void {
  // English comment: Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "modalBackdrop";

  // English comment: Modal panel
  const modal = document.createElement("div");
  modal.className = "modal";

  const title = document.createElement("h2");
  title.textContent = "Combat";
  modal.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "modalGrid";

  const leftCol = document.createElement("div");
  const rightCol = document.createElement("div");

  leftCol.appendChild(createRow("Attacker HP", `${attacker.hp}/${attacker.maxHP}`));
  leftCol.appendChild(createRow("AttackBase", String(preview.attackBase)));
  leftCol.appendChild(createRow("Min", String(preview.minAttacker)));
  leftCol.appendChild(createRow("Max", String(preview.maxAttacker)));
  leftCol.appendChild(createRow("Random(0..99)", String(preview.randomAttacker)));
  leftCol.appendChild(createRow("Final", String(preview.attackPower)));
  leftCol.appendChild(createRow("Damage taken", String(preview.damageAttacker)));

  rightCol.appendChild(createRow("Defender HP", `${defender.hp}/${defender.maxHP}`));
  rightCol.appendChild(createRow("DefenseBase", String(preview.defenseBase)));
  rightCol.appendChild(createRow("Min", String(preview.minDefender)));
  rightCol.appendChild(createRow("Max", String(preview.maxDefender)));
  rightCol.appendChild(createRow("Random(0..99)", String(preview.randomDefender)));
  rightCol.appendChild(createRow("Final", String(preview.defensePower)));
  rightCol.appendChild(createRow("Damage taken", String(preview.damageDefender)));

  grid.appendChild(leftCol);
  grid.appendChild(rightCol);

  modal.appendChild(grid);

  const info = document.createElement("div");
  info.style.marginTop = "10px";
  info.style.fontSize = "13px";
  info.textContent =
    `Distance: ${preview.distance} | Counter: ${preview.defenderCanCounter ? "yes" : "no"} | RandomDamage: ${preview.randomDamage}`;
  modal.appendChild(info);

  const buttons = document.createElement("div");
  buttons.className = "modalButtons";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";

  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";

  buttons.appendChild(cancelBtn);
  buttons.appendChild(okBtn);
  modal.appendChild(buttons);

  backdrop.appendChild(modal);
  appRoot.appendChild(backdrop);

  function close(): void {
    // English comment: Remove modal from DOM
    appRoot.removeChild(backdrop);
  }

  cancelBtn.addEventListener("click", () => {
    close();
    handlers.onCancel();
  });

  okBtn.addEventListener("click", () => {
    close();
    handlers.onOk();
  });

  // Optional: click outside to cancel
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) {
      close();
      handlers.onCancel();
    }
  });
}
