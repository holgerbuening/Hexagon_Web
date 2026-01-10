type StartDialogOptions = {
  onStart: () => void;
};

export function showStartDialog(appRoot: HTMLElement, options: StartDialogOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay start-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "start-dialog";
  dialog.style.backgroundImage = 'url("/background/startbackground.png")';

  const title = document.createElement("h1");
  title.className = "start-dialog-title";
  title.textContent = "Hexagon";

  const button = document.createElement("button");
  button.className = "start-dialog-button";
  button.type = "button";
  button.textContent = "Start New Game";

  button.addEventListener("click", () => {
    overlay.remove();
    options.onStart();
  });

  dialog.append(title, button);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}