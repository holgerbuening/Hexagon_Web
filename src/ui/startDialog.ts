type StartDialogOptions = {
  onStartNew: () => void;
  onOpenEditor: () => void;
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  resumeEnabled?: boolean;
};

export function showStartDialog(appRoot: HTMLElement, options: StartDialogOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay start-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "start-dialog";
  dialog.style.backgroundImage = 'url("/images/background/startbackground.png")';

  const title = document.createElement("h1");
  title.className = "start-dialog-title";
  title.textContent = "Hexagon";

  const resumeButton = document.createElement("button");
  resumeButton.className = "start-dialog-button";
  resumeButton.type = "button";
  resumeButton.textContent = "Resume Game";
  const resumeEnabled = options.resumeEnabled ?? true;
  resumeButton.disabled = !resumeEnabled;

  resumeButton.addEventListener("click", () => {
    if (!resumeEnabled) {
      return;
    }
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

  const settingsButton = document.createElement("button");
  settingsButton.className = "start-dialog-button";
  settingsButton.type = "button";
  settingsButton.textContent = "Settings";

  settingsButton.addEventListener("click", () => {
    overlay.remove();
    options.onOpenSettings();
  });

  const aboutButton = document.createElement("button");
  aboutButton.className = "start-dialog-button";
  aboutButton.type = "button";
  aboutButton.textContent = "About";

  aboutButton.addEventListener("click", () => {
    overlay.remove();
    options.onOpenAbout();
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

  const editorButton = document.createElement("button");
  editorButton.className = "start-dialog-button";
  editorButton.type = "button";
  editorButton.textContent = "Map Editor";
  editorButton.addEventListener("click", () => {
    overlay.remove();
    options.onOpenEditor();
  });

  dialog.append(title, editorButton, resumeButton, startButton, settingsButton, aboutButton, saveButton, loadButton);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}