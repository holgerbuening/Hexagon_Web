// src/ui/combatDialog.ts
import type { CombatPreview } from "../core/types";
import type { Unit } from "../core/units/unit";

type CombatDialogHandlers = {
  onOk: () => void;
};

function createStatLine(label: string, value: string): HTMLDivElement {
  // English comment: Helper for left/right aligned stat rows
  const line = document.createElement("div");
  line.className = "dialog-statline";

  const left = document.createElement("span");
  left.className = "dialog-statlabel";
  left.textContent = label;

  const right = document.createElement("span");
  right.className = "dialog-statvalue";
  right.textContent = value;

  line.appendChild(left);
  line.appendChild(right);
  return line;
}

function getFlagUrl(unit: Unit): string {
  // English comment: owner is expected to be 0 or 1
  return `/flags/player${unit.owner}.png`;
}

function getUnitImageUrl(unit: Unit): string {
  // English comment: unit.type maps directly to sprite filename
  return `/units/${String(unit.type).toLowerCase()}.png`;
}

export function showCombatDialog(
  appRoot: HTMLElement,
  attacker: Unit,
  defender: Unit,
  preview: CombatPreview,
  handlers: CombatDialogHandlers
): void {
  // Overlay
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  // Dialog container with fixed background
  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.backgroundImage =
    'url("/background/combatbackground.png")';

  const content = document.createElement("div");
  content.className = "dialog-content";

  const columns = document.createElement("div");
  columns.className = "dialog-columns";

  /* ================= Attacker ================= */
  const leftCol = document.createElement("div");
  leftCol.className = "dialog-column";

  const leftTitle = document.createElement("h3");
  leftTitle.textContent = "Attacker";
  leftCol.appendChild(leftTitle);

  const attackerFlag = document.createElement("img");
  attackerFlag.className = "dialog-flag";
  attackerFlag.src = getFlagUrl(attacker);
  leftCol.appendChild(attackerFlag);

  const attackerImg = document.createElement("img");
  attackerImg.className = "dialog-unit";
  attackerImg.src = getUnitImageUrl(attacker);
  leftCol.appendChild(attackerImg);

  const attackerStats = document.createElement("div");
  attackerStats.className = "dialog-stats";
  attackerStats.appendChild(
    createStatLine("HP", `${attacker.hp}/${attacker.maxHP}`)
  );
  attackerStats.appendChild(
    createStatLine("Offense", String(preview.attackBase))
  );
  attackerStats.appendChild(
    createStatLine("Min", String(preview.minAttacker))
  );
  attackerStats.appendChild(
    createStatLine("Max", String(preview.maxAttacker))
  );
  attackerStats.appendChild(
    createStatLine("Random", String(preview.randomAttacker))
  );
  attackerStats.appendChild(
    createStatLine("Final", String(preview.attackPower))
  );
  leftCol.appendChild(attackerStats);

  /* ================= Defender ================= */
  const rightCol = document.createElement("div");
  rightCol.className = "dialog-column";

  const rightTitle = document.createElement("h3");
  rightTitle.textContent = "Defender";
  rightCol.appendChild(rightTitle);

  const defenderFlag = document.createElement("img");
  defenderFlag.className = "dialog-flag";
  defenderFlag.src = getFlagUrl(defender);
  rightCol.appendChild(defenderFlag);

  const defenderImg = document.createElement("img");
  defenderImg.className = "dialog-unit";
  defenderImg.src = getUnitImageUrl(defender);
  rightCol.appendChild(defenderImg);

  const defenderStats = document.createElement("div");
  defenderStats.className = "dialog-stats";
  defenderStats.appendChild(
    createStatLine("HP", `${defender.hp}/${defender.maxHP}`)
  );
  defenderStats.appendChild(
    createStatLine("Defense", String(preview.defenseBase))
  );
  defenderStats.appendChild(
    createStatLine("Min", String(preview.minDefender))
  );
  defenderStats.appendChild(
    createStatLine("Max", String(preview.maxDefender))
  );
  defenderStats.appendChild(
    createStatLine("Random", String(preview.randomDefender))
  );
  defenderStats.appendChild(
    createStatLine("Final", String(preview.defensePower))
  );
  rightCol.appendChild(defenderStats);

  columns.appendChild(leftCol);
  columns.appendChild(rightCol);
  content.appendChild(columns);

  /* ================= Damage ================= */
  const damageRow = document.createElement("div");
  damageRow.className = "dialog-columns";
  damageRow.style.marginTop = "16px";

  const dmgAttacker = document.createElement("div");
  dmgAttacker.className = "dialog-column dialog-damage";
  dmgAttacker.innerHTML = `
    <div>Damage (Attacker)</div>
    <div class="dialog-damage-value dialog-damage-value--red">
      ${preview.damageAttacker}
    </div>
  `;

  const dmgDefender = document.createElement("div");
  dmgDefender.className = "dialog-column dialog-damage";
  dmgDefender.innerHTML = `
    <div>Damage (Defender)</div>
    <div class="dialog-damage-value dialog-damage-value--green">
      ${preview.damageDefender}
    </div>
  `;

  damageRow.appendChild(dmgAttacker);
  damageRow.appendChild(dmgDefender);
  content.appendChild(damageRow);

  /* ================= Footer ================= */
  const footer = document.createElement("div");
  footer.className = "dialog-footer";

  const okBtn = document.createElement("button");
  okBtn.className = "dialog-button";
  okBtn.textContent = "OK";
  footer.appendChild(okBtn);

  content.appendChild(footer);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      close();
      handlers.onOk();
    }
  };

  function close(): void {
    window.removeEventListener("keydown", onKeyDown);
    appRoot.removeChild(overlay);
  }

  window.addEventListener("keydown", onKeyDown);

  okBtn.addEventListener("click", () => {
    close();
    handlers.onOk();
  });
}
