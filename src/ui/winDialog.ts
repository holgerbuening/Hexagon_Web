import { PLAYER_NAMES, type PlayerId } from "../core/types";

type WinDialogOptions = {
  onOk: () => void;
};

export function showWinDialog(
  appRoot: HTMLElement,
  winner: PlayerId,
  options: WinDialogOptions
): void {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.backgroundImage = 'url("/background/combatdialogbackground.png")';

  const content = document.createElement("div");
  content.className = "dialog-content";

  const header = document.createElement("h2");
  header.textContent = `${PLAYER_NAMES[winner]} wins`;

  const columns = document.createElement("div");
  columns.className = "dialog-columns";

  const flagCol = document.createElement("div");
  flagCol.className = "dialog-column";

  const flagImg = document.createElement("img");
  flagImg.className = "dialog-flag";
  flagImg.alt = `${PLAYER_NAMES[winner]} flag`;
  flagImg.src = `flags/player${winner}.png`;

  flagCol.appendChild(flagImg);
  columns.appendChild(flagCol);

  const footer = document.createElement("div");
  footer.className = "dialog-footer";

  const okBtn = document.createElement("button");
  okBtn.className = "dialog-button";
  okBtn.type = "button";
  okBtn.textContent = "OK";

  okBtn.addEventListener("click", () => {
    overlay.remove();
    options.onOk();
  });

  footer.appendChild(okBtn);
  content.append(header, columns, footer);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}
