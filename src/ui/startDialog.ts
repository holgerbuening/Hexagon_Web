type StartDialogOptions = {
  onStartNew: () => void;
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
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

  const resumeButton = document.createElement("button");
  resumeButton.className = "start-dialog-button";
  resumeButton.type = "button";
  resumeButton.textContent = "Resume Game";

  resumeButton.addEventListener("click", () => {
    overlay.remove();
    options.onResume();
  });

  const startButton = document.createElement("button");
  startButton.className = "start-dialog-button";
  startButton.type = "button";
  startButton.textContent = "Start New Game";

  startButton.addEventListener("click", () => {
    overlay.remove();
    options.onStartNew();
  });

  const saveButton = document.createElement("button");
  saveButton.className = "start-dialog-button";
  saveButton.type = "button";
  saveButton.textContent = "Save Game";

  saveButton.addEventListener("click", () => {
    options.onSave();
  });

  const loadButton = document.createElement("button");
  loadButton.className = "start-dialog-button";
  loadButton.type = "button";
  loadButton.textContent = "Load Game";

  loadButton.addEventListener("click", () => {
    overlay.remove();
    options.onLoad();
  });

  dialog.append(title, resumeButton, startButton, saveButton, loadButton);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}